"""Behavioural tests for document purge, retry and failure reporting.

Covers AC-017 (delete purges the document row, its chunks, and the stored
S3 object, and the document leaves GET /documents), AC-019 (delete of a
queued/processing/failed document leaves no chunk rows and no
enqueued-job side effect, and `process_document` on a deleted id is a
no-op), AC-024 (a document whose ingestion raises ends `failed` with a
plain-language `failure_reason`) and AC-025 (retry deletes pre-existing
chunks, re-enqueues the job, and returns `queued` with a null
`failure_reason`).

S3 storage is stubbed throughout, matching `tests/test_documents.py`;
`app.ingestion.embed` is stubbed so no real Gemini call is ever made,
matching `tests/test_ingestion.py`. The arq queue is never configured in
this test environment (`REDIS_URL` is unset), so `_enqueue_ingestion` is
already a documented no-op; tests that need to observe whether it *would*
have enqueued a job monkeypatch it directly rather than standing up a real
arq pool.
"""

import asyncio
import io
import uuid

import pytest
from fastapi.testclient import TestClient

import app.ingestion as ingestion_module
import app.routers.documents as documents_module
from app.database import SessionLocal
from app.main import app
from app.models import Chunk, Document

STRONG_PASSWORD = "Str0ngPass!"


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


def txt_file(name: str = "notes.txt", content: bytes = b"hello world") -> tuple:
    return (name, io.BytesIO(content), "text/plain")


@pytest.fixture(autouse=True)
def stub_s3_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(documents_module, "_store_in_s3", lambda key, data, content_type: None)


@pytest.fixture
def stub_s3_delete(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []
    monkeypatch.setattr(documents_module, "_delete_from_s3", lambda key: calls.append(key))
    return calls


@pytest.fixture(autouse=True)
def stub_embed(monkeypatch: pytest.MonkeyPatch):
    def fake_embed(texts, *, correlation_id=None):
        return [[0.0] * 768 for _ in texts]

    monkeypatch.setattr(ingestion_module, "embed", fake_embed)
    return fake_embed


def upload_and_get_id(client: TestClient, filename: str = "notes.txt") -> str:
    response = client.post("/documents", files={"files": txt_file(filename)})
    assert response.status_code == 201
    return response.json()[0]["id"]


def process_to_ready(
    document_id: str,
    monkeypatch: pytest.MonkeyPatch,
    content: bytes = b"hello world, some real content to chunk and embed.",
) -> None:
    monkeypatch.setattr(ingestion_module, "_fetch_from_s3", lambda key: content)
    asyncio.run(ingestion_module.process_document({}, document_id))


def chunk_count(document_id: str) -> int:
    session = SessionLocal()
    try:
        return session.query(Chunk).filter(Chunk.document_id == uuid.UUID(document_id)).count()
    finally:
        session.close()


def document_exists(document_id: str) -> bool:
    session = SessionLocal()
    try:
        return session.get(Document, uuid.UUID(document_id)) is not None
    finally:
        session.close()


def set_document_status(document_id: str, status: str, failure_reason: str | None = None) -> None:
    session = SessionLocal()
    try:
        document = session.get(Document, uuid.UUID(document_id))
        document.status = status
        document.failure_reason = failure_reason
        session.commit()
    finally:
        session.close()


# ---------------------------------------------------------------------------
# AC-017: delete purges the document row, its chunks, and calls S3 delete for
# the stored key; GET /documents no longer lists it.
# ---------------------------------------------------------------------------


def test_delete_removes_row_chunks_and_calls_s3_delete_for_stored_key(
    monkeypatch: pytest.MonkeyPatch, stub_s3_delete: list[str]
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    assert chunk_count(document_id) >= 1

    session = SessionLocal()
    try:
        s3_key = session.get(Document, uuid.UUID(document_id)).s3_key
    finally:
        session.close()

    response = client.delete(f"/documents/{document_id}")

    assert response.status_code == 204
    assert stub_s3_delete == [s3_key]
    assert chunk_count(document_id) == 0
    assert document_exists(document_id) is False

    listed = client.get("/documents").json()
    assert all(doc["id"] != document_id for doc in listed)


# ---------------------------------------------------------------------------
# AC-019: delete of a queued/processing/failed document leaves no chunk rows
# and no enqueued-job side effect; process_document on a deleted id is a
# no-op.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status", ["queued", "processing", "failed"])
def test_delete_of_non_ready_document_leaves_no_chunks_and_no_enqueue(
    status: str, monkeypatch: pytest.MonkeyPatch, stub_s3_delete: list[str]
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    assert chunk_count(document_id) >= 1

    failure_reason = (
        "Something went wrong while processing this file - try again."
        if status == "failed"
        else None
    )
    set_document_status(document_id, status, failure_reason)

    enqueue_calls: list[str] = []

    async def fake_enqueue(doc_id) -> None:
        enqueue_calls.append(str(doc_id))

    monkeypatch.setattr(documents_module, "_enqueue_ingestion", fake_enqueue)

    response = client.delete(f"/documents/{document_id}")

    assert response.status_code == 204
    assert chunk_count(document_id) == 0
    assert enqueue_calls == []

    # A pending or racing ingestion job for this id, run after the delete,
    # is a clean no-op rather than resurrecting the document.
    asyncio.run(ingestion_module.process_document({}, document_id))
    assert document_exists(document_id) is False
    assert chunk_count(document_id) == 0


# ---------------------------------------------------------------------------
# AC-024: a document whose ingestion raises ends 'failed' with a
# plain-language failure_reason, exposed by GET /documents.
# ---------------------------------------------------------------------------


def test_failed_ingestion_exposes_plain_language_failure_reason_via_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)

    raw_exception_text = "S3 is down: connection refused on port 9999"

    def boom(key: str) -> bytes:
        raise ingestion_module.IngestionError(raw_exception_text)

    monkeypatch.setattr(ingestion_module, "_fetch_from_s3", boom)

    asyncio.run(ingestion_module.process_document({}, document_id))

    listed = client.get("/documents").json()
    document = next(doc for doc in listed if doc["id"] == document_id)

    assert document["status"] == "failed"
    assert document["failure_reason"]
    assert raw_exception_text not in document["failure_reason"]
    assert "connection refused" not in document["failure_reason"]


# ---------------------------------------------------------------------------
# AC-025: retry deletes pre-existing chunks, re-enqueues the job, returns
# status 'queued' and null failure_reason.
# ---------------------------------------------------------------------------


def test_retry_deletes_chunks_reenqueues_and_returns_queued_with_null_failure_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    assert chunk_count(document_id) >= 1

    set_document_status(document_id, "failed", "Processing service unavailable - try again.")

    enqueue_calls: list[str] = []

    async def fake_enqueue(doc_id) -> None:
        enqueue_calls.append(str(doc_id))

    monkeypatch.setattr(documents_module, "_enqueue_ingestion", fake_enqueue)

    response = client.post(f"/documents/{document_id}/retry")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["failure_reason"] is None
    assert chunk_count(document_id) == 0
    assert enqueue_calls == [document_id]

    listed = client.get("/documents").json()
    document = next(doc for doc in listed if doc["id"] == document_id)
    assert document["status"] == "queued"
    assert document["failure_reason"] is None


# ---------------------------------------------------------------------------
# Another user's document id: 404 on both delete and retry.
# ---------------------------------------------------------------------------


def test_delete_and_retry_of_another_users_document_return_404() -> None:
    owner = signed_up_client()
    document_id = upload_and_get_id(owner)

    other = signed_up_client()

    delete_response = other.delete(f"/documents/{document_id}")
    retry_response = other.post(f"/documents/{document_id}/retry")

    assert delete_response.status_code == 404
    assert retry_response.status_code == 404
    # Untouched: the real owner's document still exists and is unaffected.
    assert document_exists(document_id) is True
    owned_list = owner.get("/documents").json()
    assert any(doc["id"] == document_id for doc in owned_list)


def test_delete_and_retry_without_a_session_cookie_are_unauthorized() -> None:
    anonymous = new_client()
    random_id = str(uuid.uuid4())

    assert anonymous.delete(f"/documents/{random_id}").status_code == 401
    assert anonymous.post(f"/documents/{random_id}/retry").status_code == 401


def test_delete_and_retry_of_a_nonexistent_document_id_return_404() -> None:
    client = signed_up_client()
    random_id = str(uuid.uuid4())

    assert client.delete(f"/documents/{random_id}").status_code == 404
    assert client.post(f"/documents/{random_id}/retry").status_code == 404
