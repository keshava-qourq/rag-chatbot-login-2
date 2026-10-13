"""Conversation routes: list, create, load, rename, delete, ask.

List, create, load, rename and delete are plain CRUD over `Conversation`,
`Message` and `Citation` rows, always filtered by the caller's `user_id` so
a conversation id that belongs to another account is indistinguishable from
one that does not exist (404 either way). `POST /conversations/{id}/messages`
is the grounded-ask endpoint: retrieve the caller's own ready chunks, prompt
Gemini with those chunks and the question only, stream the answer
token-by-token over SSE, and persist the user message, the assistant message
and its citations only once the stream has completed without error.

The model is never called when there is nothing worth answering from: a
caller with zero documents, or one whose relevant chunks (after the
similarity threshold) come back empty, gets a fixed, distinct refusal
message instead -- no chat completion, no risk of a free, outside-knowledge
answer slipping through (AC-031, AC-032, AC-033).

Citations are derived strictly from the `[[n]]` markers the model actually
emitted, resolved only against the excerpts it was actually given: any `n`
outside that range is dropped before it is streamed or persisted (AC-036).
"""

from __future__ import annotations

import json
import math
import re
import uuid
from collections.abc import AsyncIterator, Mapping, Sequence
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.orm import selectinload

from app.database import SessionLocal, get_db
from app.gemini_client import GeminiProviderError, chat_stream, embed
from app.ingestion import get_ready_chunks
from app.models import Chunk, Citation, Conversation, Message, User
from app.models import Document as DocumentModel
from app.schemas import (
    AskQuestionRequest,
    CitationResponse,
    ConversationDetailResponse,
    ConversationResponse,
    MessageResponse,
    RenameConversationRequest,
)
from app.security import get_current_user

router = APIRouter(tags=["conversations"])

# Module-level singletons so route signatures satisfy B008 (no function call
# as an argument default) while still resolving per-request via FastAPI's
# dependency injection.
_DBDependency = Depends(get_db)
_CurrentUserDependency = Depends(get_current_user)

# How many of the caller's own chunks are offered to the model, and how
# similar (cosine) a chunk must be to the question before it is offered at
# all -- a chunk below this bar is simply irrelevant, which is what lets
# AC-031's "no relevant chunks" case occur even for a user with ready
# documents.
TOP_K_CHUNKS = 6
SIMILARITY_THRESHOLD = 0.2

# How much of a cited chunk's own text is quoted back in a citation -- a
# fixed, deterministic cap so the same chunk always produces the same
# `quoted_passage` (AC-035).
MAX_QUOTED_PASSAGE_CHARS = 500

# AC-034: the model is told to mark its sources with this exact bracket form
# so markers in the streamed answer can be told apart from ordinary text
# (a stray "[3]" the model writes as prose is not a citation).
_CITATION_MARKER_RE = re.compile(r"\[\[(\d+)\]\]")

SYSTEM_PROMPT = (
    "You are a document question-answering assistant. Answer the user's "
    "question using ONLY the information in the numbered excerpts below. "
    "Cite the excerpt(s) you used inline with a double-bracket marker in "
    "the exact form [[n]], where n is the excerpt number -- place one "
    "immediately after every statement it supports. Never use outside "
    "knowledge, and never guess or supplement a partial answer with "
    "anything you already know. If the excerpts do not actually answer the "
    "question, reply exactly: "
    '"I could not find the answer in your documents." and cite nothing.'
)

# AC-031/AC-032: shown instead of calling the model at all when the caller's
# question has no chunk scoring above `SIMILARITY_THRESHOLD` -- whether
# because the documents genuinely do not cover it, or because the question
# is a general-knowledge one no owned chunk addresses. Fixed and exact, so
# it is never confused with a free-form, partially-correct model answer.
REFUSAL_MESSAGE = "I could not find the answer in your documents."

# AC-033: a user with no documents at all gets this instead -- distinct from
# `REFUSAL_MESSAGE`, which implies documents were actually searched.
NO_DOCUMENTS_MESSAGE = "There's nothing to search yet. Upload a document to get started."

# AC-030: shown instead of calling the model at all when the caller has
# documents but none has finished processing yet.
PROCESSING_MESSAGE = (
    "Your documents are still being processed. Please wait for at least one "
    "to finish before asking a question."
)

_STREAM_ERROR_MESSAGE = "The answer could not be completed. Nothing was saved."
_RETRIEVAL_ERROR_MESSAGE = "The question could not be processed right now. Nothing was saved."
_NOT_FOUND_ERROR_MESSAGE = "conversation not found"

# A title long enough to be recognisable, short enough to fit a sidebar row.
_AUTO_TITLE_MAX_CHARS = 60


def _conversation_response(conversation: Conversation) -> ConversationResponse:
    return ConversationResponse(
        id=str(conversation.id),
        title=conversation.title,
        title_locked=conversation.title_locked,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


def _citation_response(citation: Citation) -> CitationResponse:
    return CitationResponse(
        id=str(citation.id),
        document_id=str(citation.document_id),
        page=citation.page,
        quoted_passage=citation.quoted_passage,
    )


def _message_response(message: Message) -> MessageResponse:
    citations = sorted(message.citations, key=lambda c: (c.page, str(c.id)))
    return MessageResponse(
        id=str(message.id),
        role=message.role,
        content=message.content,
        created_at=message.created_at,
        citations=[_citation_response(c) for c in citations],
    )


def _get_owned_conversation(
    db: DBSession, conversation_id: str, user_id: uuid.UUID
) -> Conversation:
    """The caller's own conversation, or a 404 -- never distinguishing a
    missing id from one belonging to another account."""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_ERROR_MESSAGE
        ) from exc

    conversation = db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.user_id == user_id)
    ).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_ERROR_MESSAGE)
    return conversation


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> list[ConversationResponse]:
    conversations = (
        db.execute(
            select(Conversation)
            .where(Conversation.user_id == user.id)
            .order_by(Conversation.updated_at.desc())
        )
        .scalars()
        .all()
    )
    return [_conversation_response(c) for c in conversations]


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> ConversationResponse:
    conversation = Conversation(user_id=user.id, title="New chat", title_locked=False)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _conversation_response(conversation)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: str,
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> ConversationDetailResponse:
    conversation = _get_owned_conversation(db, conversation_id, user.id)
    messages = (
        db.execute(
            select(Message)
            .options(selectinload(Message.citations))
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.asc())
        )
        .scalars()
        .all()
    )
    base = _conversation_response(conversation)
    return ConversationDetailResponse(
        **base.model_dump(),
        messages=[_message_response(m) for m in messages],
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
async def rename_conversation(
    conversation_id: str,
    payload: RenameConversationRequest,
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> ConversationResponse:
    conversation = _get_owned_conversation(db, conversation_id, user.id)
    conversation.title = payload.title
    conversation.title_locked = True
    db.commit()
    db.refresh(conversation)
    return _conversation_response(conversation)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_conversation(
    conversation_id: str,
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> None:
    conversation = _get_owned_conversation(db, conversation_id, user.id)
    db.delete(conversation)
    db.commit()
    return None


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _parse_embedding(value: object) -> list[float] | None:
    """A chunk's stored embedding as a plain list of floats.

    On SQLite (tests, local dev without pgvector) `Chunk.embedding` is
    JSON-encoded text (see `app.ingestion._embedding_value`); on Postgres it
    is already a list via pgvector. Either way this is read-only normalising
    -- it never writes a chunk's embedding back.
    """
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return [float(x) for x in json.loads(value)]
        except (TypeError, ValueError):
            return None
    try:
        return [float(x) for x in value]
    except (TypeError, ValueError):
        return None


def _cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def _retrieve_relevant_chunks(db: DBSession, user_id: uuid.UUID, question: str) -> list[Chunk]:
    """The caller's own chunks, from ready documents only, most relevant to
    `question` first, restricted to those scoring at or above
    `SIMILARITY_THRESHOLD` -- AC-027/AC-029/AC-031/AC-032.

    `get_ready_chunks` (built for US-009-1) already restricts the candidate
    set to this user's chunks on documents whose status is `ready`; this
    function only ranks and thresholds that set, it does not reimplement
    the ownership or readiness filtering.
    """
    candidates = get_ready_chunks(db, user_id)
    if not candidates:
        return []

    [question_embedding] = embed([question])

    scored: list[tuple[float, Chunk]] = []
    for chunk in candidates:
        vector = _parse_embedding(chunk.embedding)
        if vector is None:
            continue
        score = _cosine_similarity(question_embedding, vector)
        if score >= SIMILARITY_THRESHOLD:
            scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:TOP_K_CHUNKS]]


def _build_prompt(question: str, chunks: list[Chunk]) -> list[Mapping[str, str]]:
    """The single user turn sent to the model.

    Only called once `chunks` is known to be non-empty -- AC-032 requires
    the model is never invoked with an empty-excerpt prompt that would let
    it supply a free, outside-knowledge answer; that case is handled by
    `REFUSAL_MESSAGE` before this is reached.
    """
    excerpts = "\n\n".join(
        f"[[{index}]] (page {chunk.page}): {chunk.content}"
        for index, chunk in enumerate(chunks, start=1)
    )
    user_turn = f"{SYSTEM_PROMPT}\n\nExcerpts:\n{excerpts}\n\nQuestion: {question}"
    return [{"role": "user", "content": user_turn}]


def _extract_citations(answer: str, chunks: list[Chunk]) -> list[tuple[int, Chunk]]:
    """`(n, chunk)` pairs for every `[[n]]` marker the model actually wrote,
    in the order they first appear, deduplicated, and restricted to `n`
    values that index into `chunks` -- the exact excerpts the model was
    given.

    A marker for any other `n` (a number the model invented, or one left
    over from a different turn) is silently dropped here, before a single
    row is streamed or persisted (AC-036).
    """
    seen: set[int] = set()
    cited: list[tuple[int, Chunk]] = []
    for match in _CITATION_MARKER_RE.finditer(answer):
        n = int(match.group(1))
        if n in seen or not (1 <= n <= len(chunks)):
            continue
        seen.add(n)
        cited.append((n, chunks[n - 1]))
    return cited


def _citation_payload(n: int, chunk: Chunk) -> dict[str, object]:
    quoted_passage = chunk.content[:MAX_QUOTED_PASSAGE_CHARS]
    return {
        "n": n,
        "document": chunk.document.filename,
        "page": chunk.page,
        "quoted_passage": quoted_passage,
    }


def _message_payload(message: Message, citations: list[dict[str, object]]) -> dict[str, object]:
    return {
        "id": str(message.id),
        "role": message.role,
        "content": message.content,
        "citations": citations,
        "created_at": _isoformat(message.created_at),
    }


def _isoformat(value: datetime) -> str:
    return value.isoformat()


def _is_first_question(db: DBSession, conversation_id: uuid.UUID) -> bool:
    count = db.execute(
        select(func.count()).select_from(Message).where(Message.conversation_id == conversation_id)
    ).scalar_one()
    return count == 0


def _apply_auto_title(conversation: Conversation, question: str, is_first_question: bool) -> None:
    """First question in an untitled conversation sets an auto-title,
    unless the user has already locked one in by renaming it themselves."""
    if not is_first_question or conversation.title_locked:
        return
    title = question.strip().replace("\n", " ")
    if len(title) > _AUTO_TITLE_MAX_CHARS:
        title = title[: _AUTO_TITLE_MAX_CHARS - 3].rstrip() + "..."
    if title:
        conversation.title = title


async def _persist_fixed_reply(
    db: DBSession,
    conversation: Conversation,
    user_id: uuid.UUID,
    question: str,
    reply: str,
    is_first_question: bool,
) -> AsyncIterator[str]:
    """Persist `question`/`reply` as a user/assistant turn with no
    citations and no model call, then stream it exactly as `token`
    events would for a real answer -- used by every refusal path
    (AC-031, AC-032, AC-033) so the client sees one consistent shape
    regardless of why the model was not called.
    """
    user_message = Message(
        conversation_id=conversation.id, user_id=user_id, role="user", content=question
    )
    assistant_message = Message(
        conversation_id=conversation.id, user_id=user_id, role="assistant", content=reply
    )
    db.add(user_message)
    db.add(assistant_message)
    _apply_auto_title(conversation, question, is_first_question)
    db.flush()
    db.commit()

    yield _sse("token", {"token": reply})
    yield _sse("citations", {"citations": []})
    yield _sse("done", {"message": _message_payload(assistant_message, [])})


async def _stream_answer(
    conversation_id: uuid.UUID, user_id: uuid.UUID, question: str
) -> AsyncIterator[str]:
    """The SSE body of `ask_question`.

    Runs its own session, independent of the request's: the request's
    session closes once the handler returns the `StreamingResponse`, but
    this generator keeps running for the lifetime of the stream. Nothing is
    written to the database until the full answer has streamed
    successfully (or a refusal path is taken deliberately); a provider
    failure at any point yields an `error` event and leaves no trace of
    this turn.
    """
    db = SessionLocal()
    try:
        conversation = db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        ).scalar_one_or_none()
        if conversation is None:
            yield _sse("error", {"message": _NOT_FOUND_ERROR_MESSAGE})
            return

        is_first_question = _is_first_question(db, conversation_id)

        documents = (
            db.execute(select(DocumentModel).where(DocumentModel.user_id == user_id))
            .scalars()
            .all()
        )

        if not documents:
            # AC-033: distinct from every other refusal, and no model call.
            async for event in _persist_fixed_reply(
                db, conversation, user_id, question, NO_DOCUMENTS_MESSAGE, is_first_question
            ):
                yield event
            return

        has_ready_document = any(document.status == "ready" for document in documents)
        if not has_ready_document:
            # AC-030: no chat model call at all.
            async for event in _persist_fixed_reply(
                db, conversation, user_id, question, PROCESSING_MESSAGE, is_first_question
            ):
                yield event
            return

        try:
            relevant_chunks = _retrieve_relevant_chunks(db, user_id, question)
        except GeminiProviderError:
            yield _sse("error", {"message": _RETRIEVAL_ERROR_MESSAGE})
            return

        if not relevant_chunks:
            # AC-031/AC-032: nothing scored above the threshold -- never
            # call the chat model with an empty-excerpt prompt.
            async for event in _persist_fixed_reply(
                db, conversation, user_id, question, REFUSAL_MESSAGE, is_first_question
            ):
                yield event
            return

        messages = _build_prompt(question, relevant_chunks)

        collected: list[str] = []
        try:
            for token in chat_stream(messages):
                collected.append(token)
                yield _sse("token", {"token": token})
        except GeminiProviderError:
            # Nothing has been added to this session, so there is nothing
            # to roll back -- the failure simply never gets persisted.
            yield _sse("error", {"message": _STREAM_ERROR_MESSAGE})
            return

        answer = "".join(collected)
        cited = _extract_citations(answer, relevant_chunks)

        user_message = Message(
            conversation_id=conversation.id, user_id=user_id, role="user", content=question
        )
        assistant_message = Message(
            conversation_id=conversation.id, user_id=user_id, role="assistant", content=answer
        )
        db.add(user_message)
        db.add(assistant_message)
        db.flush()

        citations_payload: list[dict[str, object]] = []
        for n, chunk in cited:
            payload = _citation_payload(n, chunk)
            db.add(
                Citation(
                    message_id=assistant_message.id,
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    page=chunk.page,
                    quoted_passage=payload["quoted_passage"],
                )
            )
            citations_payload.append(payload)

        _apply_auto_title(conversation, question, is_first_question)
        db.commit()

        yield _sse("citations", {"citations": citations_payload})
        yield _sse("done", {"message": _message_payload(assistant_message, citations_payload)})
    finally:
        db.close()


@router.post("/conversations/{conversation_id}/messages")
async def ask_question(
    conversation_id: str,
    payload: AskQuestionRequest,
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> StreamingResponse:
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_ERROR_MESSAGE
        ) from exc

    conversation = db.execute(
        select(Conversation).where(Conversation.id == conv_uuid, Conversation.user_id == user.id)
    ).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_ERROR_MESSAGE)

    return StreamingResponse(
        _stream_answer(conv_uuid, user.id, payload.question),
        media_type="text/event-stream",
    )
