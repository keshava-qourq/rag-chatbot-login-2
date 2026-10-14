"""AC-036 (US-012-4 QA pass): a conversation id belonging to another account
returns 404 on ask, and no citation ever resolves to another user's chunk --
exercised here with two accounts each uploading a document with
byte-identical content and embedding-identical chunks, so the only thing
that could keep the citations apart is ownership filtering, not any
difference in the underlying data.

`test_grounded_ask_streaming.py` already covers the single-caller shape of
this (a citation resolves to a chunk the caller themselves owns, and a
stranger's conversation id 404s). This file adds the two-account, identical-
content case that a single-caller test cannot exercise, and asserts on the
404 body's own `_NOT_FOUND_ERROR_MESSAGE` constant rather than just the
status code.
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
from app.models import Citation, Document

STRONG_PASSWORD = "Str0ngPass!"
VECTOR_DIM = 768
MATCHING_VECTOR = [1.0] + [0.0] * (VECTOR_DIM - 1)


def unique_email() -> str:
    return f"user-{uuid.uuid4().hex}@example.com"


def new_client() -> TestClient:
    return TestClient(app, base_url="https://testserver")


def signed_up_client() -> TestClient:
    client = new_client()
    response = client.post(
        "/auth/signup", json={"email": unique_email(), "password": STRONG_PASSWORD}
    )
    assert response.status_code == 201
    return client


def txt_file(name: str, content: bytes) -> tuple:
    return (name, io.BytesIO(content), "text/plain")


@pytest.fixture(autouse=True)
def stub_s3_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(documents_module, "_store_in_s3", lambda key, data, content_type: None)


def upload_and_get_id(client: TestClient, filename: str, content: bytes) -> str:
    response = client.post("/documents", files={"files": txt_file(filename, content)})
    assert response.status_code == 201
    return response.json()[0]["id"]


def process_to_ready(document_id: str, monkeypatch: pytest.MonkeyPatch, content: bytes) -> None:
    monkeypatch.setattr(ingestion_module, "_fetch_from_s3", lambda key: content)

    def fake_embed(texts, *, correlation_id=None):
        return [MATCHING_VECTOR for _ in texts]

    monkeypatch.setattr(ingestion_module, "embed", fake_embed)
    asyncio.run(ingestion_module.process_document({}, document_id))


def create_conversation(client: TestClient) -> str:
    response = client.post("/conversations")
    assert response.status_code == 201
    return response.json()["id"]


def ask(client: TestClient, conversation_id: str, question: str):
    return client.post(f"/conversations/{conversation_id}/messages", json={"question": question})


def test_citations_never_resolve_to_another_accounts_chunk_even_with_identical_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content = b"The Eiffel Tower is a famous landmark in Paris, France."

    user_a = signed_up_client()
    doc_a = upload_and_get_id(user_a, "a-notes.txt", content)
    process_to_ready(doc_a, monkeypatch, content)
    conv_a = create_conversation(user_a)

    user_b = signed_up_client()
    doc_b = upload_and_get_id(user_b, "b-notes.txt", content)
    process_to_ready(doc_b, monkeypatch, content)
    conv_b = create_conversation(user_b)

    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts]
    )

    def fake_chat_stream(messages, **kwargs):
        yield "The Eiffel Tower is in Paris [[1]]."

    monkeypatch.setattr(conversations_module, "chat_stream", fake_chat_stream)

    response_a = ask(user_a, conv_a, "Tell me about the Eiffel Tower.")
    response_b = ask(user_b, conv_b, "Tell me about the Eiffel Tower.")

    assert response_a.status_code == 200
    assert response_b.status_code == 200

    session = SessionLocal()
    try:
        document_a = session.get(Document, uuid.UUID(doc_a))
        document_b = session.get(Document, uuid.UUID(doc_b))
        assert document_a is not None
        assert document_b is not None

        citations_for_a = (
            session.query(Citation)
            .join(Citation.message)
            .filter(Citation.message.has(conversation_id=uuid.UUID(conv_a)))
            .all()
        )
        citations_for_b = (
            session.query(Citation)
            .join(Citation.message)
            .filter(Citation.message.has(conversation_id=uuid.UUID(conv_b)))
            .all()
        )

        assert citations_for_a
        assert citations_for_b
        for citation in citations_for_a:
            assert citation.document_id == document_a.id
            assert citation.document_id != document_b.id
        for citation in citations_for_b:
            assert citation.document_id == document_b.id
            assert citation.document_id != document_a.id
    finally:
        session.close()


def test_conversation_id_belonging_to_another_account_returns_404_with_the_shared_not_found_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = signed_up_client()
    conversation_id = create_conversation(owner)

    stranger = signed_up_client()
    response = ask(stranger, conversation_id, "Anything?")

    assert response.status_code == 404
    assert response.json()["detail"] == conversations_module._NOT_FOUND_ERROR_MESSAGE
