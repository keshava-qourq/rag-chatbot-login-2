"""Behavioural tests for document upload, listing, status-stream, delete and
retry.

S3 storage (`_store_in_s3`) is stubbed for every test in this module so no
real S3/boto3 call is ever made. The arq job queue needs no separate stub:
`REDIS_URL` is unset in this test configuration, so
`app.worker._redis_settings()` returns `None` and `_enqueue_ingestion`
becomes a documented no-op.
"""

import io
import uuid

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

import app.routers.documents as documents_module
from app.main import app

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


@pytest.fixture(autouse=True)
def stub_s3(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, bytes, str]]:
    """Every test in this module stores to an in-memory list, never S3."""
    stored: list[tuple[str, bytes, str]] = []

    def fake_store(key: str, data: bytes, content_type: str) -> None:
        stored.append((key, data, content_type))

    monkeypatch.setattr(documents_module, "_store_in_s3", fake_store)
    return stored


def make_pdf_bytes(num_pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(num_pages):
        writer.add_blank_page(width=72, height=72)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def txt_file(name: str = "notes.txt", content: bytes = b"hello world") -> tuple:
    return (name, io.BytesIO(content), "text/plain")


# ---------------------------------------------------------------------------
# AC-010: accepted upload is queued, owned by the session user, and appears
# first in GET /documents.
# ---------------------------------------------------------------------------


def test_accepted_upload_is_queued_for_the_session_user() -> None:
    client = signed_up_client()

    response = client.post("/documents", files={"files": txt_file()})

    assert response.status_code == 201
    body = response.json()
    assert len(body) == 1
    assert body[0]["status"] == "queued"
    assert body[0]["filename"] == "notes.txt"


def test_most_recently_uploaded_document_appears_first_in_list() -> None:
    client = signed_up_client()
    client.post("/documents", files={"files": txt_file("first.txt")})
    client.post("/documents", files={"files": txt_file("second.txt")})

    response = client.get("/documents")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["filename"] == "second.txt"
    assert body[1]["filename"] == "first.txt"


# ---------------------------------------------------------------------------
# AC-011: oversized file and over-page-limit file are rejected, naming the
# limit and the actual value.
# ---------------------------------------------------------------------------


def test_oversized_file_is_rejected_naming_limit_and_actual_size(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "10")
    client = signed_up_client()

    response = client.post("/documents", files={"files": txt_file("big.txt", b"x" * 100)})

    assert response.status_code == 413
    detail = response.json()["detail"]
    assert "10" in detail
    assert "100" in detail


def test_oversized_file_creates_no_document_record(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "10")
    client = signed_up_client()

    client.post("/documents", files={"files": txt_file("big.txt", b"x" * 100)})

    assert client.get("/documents").json() == []


def test_over_page_limit_pdf_is_rejected_naming_limit_and_actual_pages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MAX_UPLOAD_PAGES", "1")
    client = signed_up_client()
    pdf_bytes = make_pdf_bytes(3)

    response = client.post(
        "/documents",
        files={"files": ("doc.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "1" in detail
    assert "3" in detail


def test_pdf_within_page_limit_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAX_UPLOAD_PAGES", "5")
    client = signed_up_client()
    pdf_bytes = make_pdf_bytes(3)

    response = client.post(
        "/documents",
        files={"files": ("doc.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )

    assert response.status_code == 201
    assert response.json()[0]["status"] == "queued"


# ---------------------------------------------------------------------------
# AC-012: unsupported extension/MIME rejected, naming every supported type.
# ---------------------------------------------------------------------------


def test_unsupported_extension_is_rejected_listing_supported_types() -> None:
    client = signed_up_client()

    response = client.post(
        "/documents",
        files={"files": ("malware.exe", io.BytesIO(b"binary"), "application/octet-stream")},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "PDF" in detail
    assert "Word" in detail
    assert "Markdown" in detail
    assert "plain text" in detail


def test_unsupported_extension_creates_no_document_record() -> None:
    client = signed_up_client()

    client.post(
        "/documents",
        files={"files": ("malware.exe", io.BytesIO(b"binary"), "application/octet-stream")},
    )

    assert client.get("/documents").json() == []


# ---------------------------------------------------------------------------
# AC-013: a multi-file upload yields one independent document record per
# file.
# ---------------------------------------------------------------------------


def test_multi_file_upload_creates_one_independent_record_per_file() -> None:
    client = signed_up_client()

    response = client.post(
        "/documents",
        files=[
            ("files", ("a.txt", io.BytesIO(b"content a"), "text/plain")),
            ("files", ("b.txt", io.BytesIO(b"content b"), "text/plain")),
        ],
    )

    assert response.status_code == 201
    body = response.json()
    assert len(body) == 2
    ids = {doc["id"] for doc in body}
    assert len(ids) == 2
    filenames = {doc["filename"] for doc in body}
    assert filenames == {"a.txt", "b.txt"}
    assert all(doc["status"] == "queued" for doc in body)


def test_one_invalid_file_in_a_batch_rejects_the_whole_batch() -> None:
    """Documented batch-validation behaviour: either every file in a request
    passes validation, or none of them are stored."""
    client = signed_up_client()

    response = client.post(
        "/documents",
        files=[
            ("files", ("good.txt", io.BytesIO(b"ok"), "text/plain")),
            ("files", ("bad.exe", io.BytesIO(b"binary"), "application/octet-stream")),
        ],
    )

    assert response.status_code == 422
    assert client.get("/documents").json() == []


# ---------------------------------------------------------------------------
# Ownership isolation: a second account cannot see, delete or retry the
# first account's documents.
# ---------------------------------------------------------------------------


def test_second_account_cannot_see_the_first_accounts_documents() -> None:
    owner = signed_up_client()
    owner.post("/documents", files={"files": txt_file()})

    other = signed_up_client()

    assert other.get("/documents").json() == []


def test_second_account_cannot_delete_the_first_accounts_document() -> None:
    owner = signed_up_client()
    doc_id = owner.post("/documents", files={"files": txt_file()}).json()[0]["id"]

    other = signed_up_client()
    response = other.delete(f"/documents/{doc_id}")

    assert response.status_code == 404
    assert owner.get("/documents").json()  # still present for the owner


def test_second_account_cannot_retry_the_first_accounts_document() -> None:
    owner = signed_up_client()
    doc_id = owner.post("/documents", files={"files": txt_file()}).json()[0]["id"]

    other = signed_up_client()
    response = other.post(f"/documents/{doc_id}/retry")

    assert response.status_code == 404


def test_deleting_an_unknown_document_id_is_a_404_not_a_500() -> None:
    client = signed_up_client()

    response = client.delete("/documents/not-a-uuid")

    assert response.status_code == 404


def test_owner_can_delete_their_own_document() -> None:
    client = signed_up_client()
    doc_id = client.post("/documents", files={"files": txt_file()}).json()[0]["id"]

    response = client.delete(f"/documents/{doc_id}")

    assert response.status_code == 204
    assert client.get("/documents").json() == []


# ---------------------------------------------------------------------------
# GET /documents/events: text/event-stream, caller-scoped only.
# ---------------------------------------------------------------------------


def test_events_stream_is_text_event_stream_and_only_the_callers_documents() -> None:
    owner = signed_up_client()
    owner.post("/documents", files={"files": txt_file("owner-file.txt")})

    other = signed_up_client()
    other.post("/documents", files={"files": txt_file("other-file.txt")})

    with owner.stream("GET", "/documents/events") as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        seen = ""
        for chunk in response.iter_text():
            seen += chunk
            if "owner-file.txt" in seen:
                break

        assert "owner-file.txt" in seen
        assert "other-file.txt" not in seen
