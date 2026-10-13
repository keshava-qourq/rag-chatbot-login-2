"""Conversation routes: list, create, load, rename, delete, ask.

Every route except `POST /conversations/{id}/messages` is still a stub --
list, create, load, rename and delete are a separate ticket's work. This
file implements only the grounded-ask endpoint: retrieve the caller's own
ready chunks, prompt Gemini with those chunks and the question only, stream
the answer token-by-token over SSE, and persist the user message, the
assistant message and its citations only once the stream has completed
without error.
"""

from __future__ import annotations

import json
import math
import uuid
from collections.abc import AsyncIterator, Mapping, Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.database import SessionLocal, get_db
from app.gemini_client import GeminiProviderError, chat_stream, embed
from app.ingestion import get_ready_chunks
from app.models import Chunk, Citation, Conversation, Message, User
from app.models import Document as DocumentModel
from app.schemas import AskQuestionRequest, RenameConversationRequest, StubResponse
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
# AC-028's "no relevant chunks" case occur even for a user with ready
# documents.
TOP_K_CHUNKS = 6
SIMILARITY_THRESHOLD = 0.2

# AC-028: the model must answer solely from the supplied excerpts, cite
# them, and say so -- rather than fall back on outside knowledge -- when the
# excerpts do not contain the answer.
SYSTEM_PROMPT = (
    "You are a document question-answering assistant. Answer the user's "
    "question using ONLY the information in the numbered excerpts below. "
    "Cite the excerpt(s) you used inline as [n], where n is the excerpt "
    "number. Never use outside knowledge, and never guess or supplement a "
    "partial answer with anything you already know. If the excerpts do not "
    "contain the answer, reply exactly: "
    '"I don\'t see an answer to that in your documents." and cite nothing.'
)

NO_EXCERPTS_PLACEHOLDER = "(no excerpts were found relevant to this question)"

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


@router.get("/conversations", response_model=list[StubResponse])
async def list_conversations() -> list[StubResponse]:
    return []


@router.post("/conversations", response_model=StubResponse)
async def create_conversation() -> StubResponse:
    return StubResponse(endpoint="POST /conversations")


@router.get("/conversations/{conversation_id}", response_model=StubResponse)
async def get_conversation(conversation_id: str) -> StubResponse:
    return StubResponse(endpoint="GET /conversations/{id}")


@router.patch("/conversations/{conversation_id}", response_model=StubResponse)
async def rename_conversation(
    conversation_id: str, payload: RenameConversationRequest
) -> StubResponse:
    return StubResponse(endpoint="PATCH /conversations/{id}")


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_conversation(conversation_id: str) -> None:
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
    `question` first -- AC-027/AC-029.

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
    if chunks:
        excerpts = "\n\n".join(
            f"[{index}] (page {chunk.page}): {chunk.content}"
            for index, chunk in enumerate(chunks, start=1)
        )
    else:
        excerpts = NO_EXCERPTS_PLACEHOLDER

    user_turn = f"{SYSTEM_PROMPT}\n\nExcerpts:\n{excerpts}\n\nQuestion: {question}"
    return [{"role": "user", "content": user_turn}]


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


async def _stream_answer(
    conversation_id: uuid.UUID, user_id: uuid.UUID, question: str
) -> AsyncIterator[str]:
    """The SSE body of `ask_question`.

    Runs its own session, independent of the request's: the request's
    session closes once the handler returns the `StreamingResponse`, but
    this generator keeps running for the lifetime of the stream. Nothing is
    written to the database until the full answer has streamed
    successfully; a provider failure at any point yields an `error` event
    and leaves no trace of this turn.
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
        has_ready_document = any(document.status == "ready" for document in documents)

        if documents and not has_ready_document:
            # AC-030: no chat model call at all.
            db.add(
                Message(
                    conversation_id=conversation.id, user_id=user_id, role="user", content=question
                )
            )
            db.add(
                Message(
                    conversation_id=conversation.id,
                    user_id=user_id,
                    role="assistant",
                    content=PROCESSING_MESSAGE,
                )
            )
            _apply_auto_title(conversation, question, is_first_question)
            db.commit()
            yield _sse("token", {"text": PROCESSING_MESSAGE})
            yield _sse("citations", {"citations": []})
            yield _sse("done", {})
            return

        try:
            relevant_chunks = _retrieve_relevant_chunks(db, user_id, question)
        except GeminiProviderError:
            yield _sse("error", {"message": _RETRIEVAL_ERROR_MESSAGE})
            return

        messages = _build_prompt(question, relevant_chunks)

        collected: list[str] = []
        try:
            for token in chat_stream(messages):
                collected.append(token)
                yield _sse("token", {"text": token})
        except GeminiProviderError:
            # Nothing has been added to this session, so there is nothing
            # to roll back -- the failure simply never gets persisted.
            yield _sse("error", {"message": _STREAM_ERROR_MESSAGE})
            return

        answer = "".join(collected)

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
        for chunk in relevant_chunks:
            quoted_passage = chunk.content[:500]
            db.add(
                Citation(
                    message_id=assistant_message.id,
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    page=chunk.page,
                    quoted_passage=quoted_passage,
                )
            )
            citations_payload.append(
                {
                    "document_id": str(chunk.document_id),
                    "chunk_id": str(chunk.id),
                    "page": chunk.page,
                    "quoted_passage": quoted_passage,
                }
            )

        _apply_auto_title(conversation, question, is_first_question)
        db.commit()

        yield _sse("citations", {"citations": citations_payload})
        yield _sse("done", {})
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
