"""Behavioural tests for conversation list, auto-title, rename and delete
(US-014-1/US-014-2/US-014-3).

Title tests deliberately use the "no documents yet" refusal path
(`NO_DOCUMENTS_MESSAGE` in `app.routers.conversations`) rather than a real
grounded answer: `_apply_auto_title` runs identically on every reply path,
so this exercises the exact same auto-title logic without the overhead of
uploading and processing a document. The delete-cascade test is the
exception -- it needs a real message with a real citation, so it follows
the ready-document pattern already used in
`test_conversation_cross_account_isolation.py`.
"""

from __future__ import annotations

import asyncio
import io
import uuid

import pytest
from fastapi.testclient import TestClient

import app.ingestion as ingestion_module
import app.routers.conversations as conversations_module
import app.routers.documents as documents_module
from app.database import SessionLocal
from app.main import app
from app.models import Chunk, Citation, Document, Message

VECTOR_DIM = 768
MATCHING_VECTOR = [1.0] + [0.0] * (VECTOR_DIM - 1)


def new_client() -> TestClient:
    return TestClient(app, base_url="https://testserver")


def create_conversation(client: TestClient) -> str:
    response = client.post("/conversations")
    assert response.status_code == 201
    return response.json()["id"]


def ask_without_documents(client: TestClient, conversation_id: str, question: str) -> str:
    """Asks a question for an account with no documents at all -- the
    `NO_DOCUMENTS_MESSAGE` refusal path, which still runs `_apply_auto_title`
    and persists a user/assistant turn, without needing any upload or
    ingestion stub."""
    response = client.post(
        f"/conversations/{conversation_id}/messages", json={"question": question}
    )
    assert response.status_code == 200
    return response.text


def txt_file(name: str, content: bytes) -> tuple:
    return (name, io.BytesIO(content), "text/plain")


@pytest.fixture(autouse=True)
def stub_s3_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(documents_module, "_store_file", lambda key, data, content_type: None)


def upload_and_get_id(client: TestClient, filename: str, content: bytes) -> str:
    response = client.post("/documents", files={"files": txt_file(filename, content)})
    assert response.status_code == 201
    return response.json()[0]["id"]


def process_to_ready(document_id: str, monkeypatch: pytest.MonkeyPatch, content: bytes) -> None:
    monkeypatch.setattr(ingestion_module, "_fetch_file", lambda key: content)

    def fake_embed(texts, *, correlation_id=None):
        return [MATCHING_VECTOR for _ in texts]

    monkeypatch.setattr(ingestion_module, "embed", fake_embed)
    asyncio.run(ingestion_module.process_document({}, document_id))


# ---------------------------------------------------------------------------
# List ordered by last activity, scoped to the caller.
# ---------------------------------------------------------------------------


def test_list_orders_by_most_recent_activity_not_creation_order() -> None:
    client = new_client()
    older_id = create_conversation(client)
    newer_id = create_conversation(client)

    # Immediately after creation, the more recently created conversation is
    # already first (its own updated_at is the newer timestamp).
    body = client.get("/conversations").json()
    assert [c["id"] for c in body] == [newer_id, older_id]

    # Activity on the *older* conversation (a first question, which sets its
    # title and so touches updated_at) must move it back to the top.
    ask_without_documents(client, older_id, "What is the deadline?")

    body = client.get("/conversations").json()
    assert [c["id"] for c in body] == [older_id, newer_id]


# ---------------------------------------------------------------------------
# Auto-title from the first question; unchanged on later messages; long
# question truncation.
# ---------------------------------------------------------------------------


def test_first_question_sets_the_conversation_title() -> None:
    client = new_client()
    conversation_id = create_conversation(client)

    ask_without_documents(client, conversation_id, "What is the notice period?")

    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["title"] == "What is the notice period?"
    assert detail["title_locked"] is False


def test_title_is_unchanged_by_a_later_message() -> None:
    client = new_client()
    conversation_id = create_conversation(client)

    ask_without_documents(client, conversation_id, "What is the notice period?")
    ask_without_documents(client, conversation_id, "And what about the deposit?")

    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["title"] == "What is the notice period?"
    assert len(detail["messages"]) == 4


def test_long_first_question_truncates_the_title() -> None:
    client = new_client()
    conversation_id = create_conversation(client)

    long_question = "What is the exact notice period " + ("and renewal terms " * 10) + "?"
    assert len(long_question) > 60

    ask_without_documents(client, conversation_id, long_question)

    detail = client.get(f"/conversations/{conversation_id}").json()
    assert len(detail["title"]) <= 60
    assert detail["title"].endswith("...")
    assert detail["title"][:20] == long_question[:20]


# ---------------------------------------------------------------------------
# Rename persistence; empty-title rejection.
# ---------------------------------------------------------------------------


def test_rename_persists_and_locks_the_title_against_future_auto_titling() -> None:
    client = new_client()
    conversation_id = create_conversation(client)

    response = client.patch(f"/conversations/{conversation_id}", json={"title": "Lease terms"})
    assert response.status_code == 200
    assert response.json()["title"] == "Lease terms"
    assert response.json()["title_locked"] is True

    # Persists across a fresh GET.
    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["title"] == "Lease terms"
    assert detail["title_locked"] is True

    # A first question after the rename must not overwrite the chosen title.
    ask_without_documents(client, conversation_id, "What is the notice period?")
    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["title"] == "Lease terms"


@pytest.mark.parametrize("title", ["", "   ", "\n\t"])
def test_empty_or_whitespace_only_rename_is_rejected(title: str) -> None:
    client = new_client()
    conversation_id = create_conversation(client)

    response = client.patch(f"/conversations/{conversation_id}", json={"title": title})

    assert response.status_code == 422
    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["title"] == "New chat"
    assert detail["title_locked"] is False


def test_rename_with_surrounding_whitespace_stores_the_trimmed_title() -> None:
    """`schemas.RenameConversationRequest`'s validator returns `value.strip()`
    for a title that is non-blank once trimmed -- not merely a title that
    passes validation unchanged. A regression that validated but no longer
    trimmed (or that trimmed only for the blank-rejection check, discarding
    the stripped value) would still reject the two parametrized all-
    whitespace cases above while silently storing leading/trailing
    whitespace a user never intended to type as part of the title."""
    client = new_client()
    conversation_id = create_conversation(client)

    response = client.patch(
        f"/conversations/{conversation_id}", json={"title": "  Lease terms  \n"}
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Lease terms"

    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["title"] == "Lease terms"


# ---------------------------------------------------------------------------
# Cross-account rename and delete return 404.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Delete cascades to messages and citations; documents (and their chunks)
# survive.
# ---------------------------------------------------------------------------


def test_delete_cascades_to_messages_and_citations_but_documents_survive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = new_client()
    content = b"The Eiffel Tower is a famous landmark in Paris, France."
    document_id = upload_and_get_id(client, "notes.txt", content)
    process_to_ready(document_id, monkeypatch, content)
    conversation_id = create_conversation(client)

    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts]
    )

    def fake_chat_stream(messages, **kwargs):
        yield "The Eiffel Tower is in Paris [[1]]."

    monkeypatch.setattr(conversations_module, "chat_stream", fake_chat_stream)

    response = client.post(
        f"/conversations/{conversation_id}/messages",
        json={"question": "Tell me about the Eiffel Tower."},
    )
    assert response.status_code == 200

    session = SessionLocal()
    try:
        conv_uuid = uuid.UUID(conversation_id)
        doc_uuid = uuid.UUID(document_id)
        assert session.query(Message).filter(Message.conversation_id == conv_uuid).count() == 2
        assert (
            session.query(Citation)
            .join(Citation.message)
            .filter(Citation.message.has(conversation_id=conv_uuid))
            .count()
            >= 1
        )
        assert session.query(Chunk).filter(Chunk.document_id == doc_uuid).count() >= 1
    finally:
        session.close()

    delete_response = client.delete(f"/conversations/{conversation_id}")
    assert delete_response.status_code == 204

    session = SessionLocal()
    try:
        conv_uuid = uuid.UUID(conversation_id)
        doc_uuid = uuid.UUID(document_id)

        assert session.query(Message).filter(Message.conversation_id == conv_uuid).count() == 0
        assert (
            session.query(Citation)
            .join(Citation.message)
            .filter(Citation.message.has(conversation_id=conv_uuid))
            .count()
            == 0
        )

        # The document and its chunks are untouched by the conversation
        # delete -- they belong to the document's own lifecycle, not the
        # conversation's.
        document = session.get(Document, doc_uuid)
        assert document is not None
        assert session.query(Chunk).filter(Chunk.document_id == doc_uuid).count() >= 1
    finally:
        session.close()

    listed_documents = client.get("/documents").json()
    assert any(doc["id"] == document_id for doc in listed_documents)

    get_response = client.get(f"/conversations/{conversation_id}")
    assert get_response.status_code == 404
