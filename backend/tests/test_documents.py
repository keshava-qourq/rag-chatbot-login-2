"""Behavioural tests for document upload, listing, status-stream, delete and
retry.

S3 storage (`_store_in_s3`) is stubbed for every test in this module so no
real S3/boto3 call is ever made. The arq job queue needs no separate stub:
`REDIS_URL` is unset in this test configuration, so
`app.worker._redis_settings()` returns `None` and `_enqueue_ingestion`
becomes a documented no-op. One test below opts into a configured
`REDIS_URL` with a fake arq pool, specifically to prove the ingestion job is
enqueued rather than executed inline.
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


def make_docx_bytes(paragraphs: list[str] | None = None) -> bytes:
    from docx import Document as DocxDocument

    doc = DocxDocument()
    for text in paragraphs or ["hello from a docx file"]:
        doc.add_paragraph(text)
    buffer = io.BytesIO()
    doc.save(buffer)
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


def test_accepted_docx_upload_is_queued_and_appears_in_the_list() -> None:
    client = signed_up_client()
    docx_bytes = make_docx_bytes()

    response = client.post(
        "/documents",
        files={
            "files": (
                "report.docx",
                io.BytesIO(docx_bytes),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body[0]["status"] == "queued"
    assert body[0]["filename"] == "report.docx"

    listed = client.get("/documents").json()
    assert any(doc["filename"] == "report.docx" for doc in listed)


def test_accepted_markdown_upload_is_queued_and_appears_in_the_list() -> None:
    client = signed_up_client()

    response = client.post(
        "/documents",
        files={
            "files": (
                "readme.md",
                io.BytesIO(b"# Title\n\nSome markdown body text."),
                "text/markdown",
            )
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body[0]["status"] == "queued"
    assert body[0]["filename"] == "readme.md"

    listed = client.get("/documents").json()
    assert any(doc["filename"] == "readme.md" for doc in listed)


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


def test_oversized_file_is_rejected_before_any_s3_write(
    monkeypatch: pytest.MonkeyPatch, stub_s3: list[tuple[str, bytes, str]]
) -> None:
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "10")
    client = signed_up_client()

    client.post("/documents", files={"files": txt_file("big.txt", b"x" * 100)})

    assert stub_s3 == []


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


def test_over_page_limit_pdf_creates_no_document_record_and_no_s3_write(
    monkeypatch: pytest.MonkeyPatch, stub_s3: list[tuple[str, bytes, str]]
) -> None:
    monkeypatch.setenv("MAX_UPLOAD_PAGES", "1")
    client = signed_up_client()
    pdf_bytes = make_pdf_bytes(3)

    client.post(
        "/documents",
        files={"files": ("doc.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
    )

    assert client.get("/documents").json() == []
    assert stub_s3 == []


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
# file, each independently mutable.
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


def test_deleting_one_document_from_a_batch_leaves_the_others_untouched() -> None:
    """Proves each Document row in a multi-file upload is independently
    mutable: deleting one by id does not affect the sibling rows created in
    the same request."""
    client = signed_up_client()

    response = client.post(
        "/documents",
        files=[
            ("files", ("a.txt", io.BytesIO(b"content a"), "text/plain")),
            ("files", ("b.txt", io.BytesIO(b"content b"), "text/plain")),
        ],
    )
    created = response.json()
    first_id = created[0]["id"]

    delete_response = client.delete(f"/documents/{first_id}")
    assert delete_response.status_code == 204

    remaining = client.get("/documents").json()
    assert len(remaining) == 1
    assert remaining[0]["id"] != first_id
    assert remaining[0]["status"] == "queued"


def test_retrying_one_document_from_a_batch_leaves_the_others_untouched() -> None:
    """Proves per-row status mutation (retry resets status) does not leak
    across sibling rows created in the same upload request."""
    client = signed_up_client()

    response = client.post(
        "/documents",
        files=[
            ("files", ("a.txt", io.BytesIO(b"content a"), "text/plain")),
            ("files", ("b.txt", io.BytesIO(b"content b"), "text/plain")),
        ],
    )
    created = response.json()
    first_id = created[0]["id"]
    second_id = created[1]["id"]

    retry_response = client.post(f"/documents/{first_id}/retry")
    assert retry_response.status_code == 200
    assert retry_response.json()["id"] == first_id
    assert retry_response.json()["status"] == "queued"

    listed = {doc["id"]: doc["status"] for doc in client.get("/documents").json()}
    assert listed[first_id] == "queued"
    assert listed[second_id] == "queued"
    assert first_id != second_id


# ---------------------------------------------------------------------------
# AC-022: upload returns without running extraction/embedding -- the job is
# enqueued to arq, not executed inline.
# ---------------------------------------------------------------------------


def test_upload_enqueues_the_ingestion_job_without_executing_it_inline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    enqueued: list[tuple[str, tuple]] = []

    class FakePool:
        async def enqueue_job(self, name: str, *args: object) -> None:
            enqueued.append((name, args))

        async def close(self) -> None:
            pass

    async def fake_create_pool(settings: object) -> FakePool:
        return FakePool()

    import arq.connections as arq_connections

    monkeypatch.setattr(arq_connections, "create_pool", fake_create_pool)

    import app.ingestion as ingestion_module

    embed_calls: list[object] = []
    monkeypatch.setattr(
        ingestion_module,
        "embed",
        lambda *args, **kwargs: embed_calls.append((args, kwargs)) or [],
    )
    process_document_calls: list[object] = []
    original_process_document = ingestion_module.process_document

    async def spying_process_document(ctx: dict, document_id: str) -> None:
        process_document_calls.append(document_id)
        await original_process_document(ctx, document_id)

    monkeypatch.setattr(ingestion_module, "process_document", spying_process_document)

    client = signed_up_client()
    response = client.post("/documents", files={"files": txt_file()})

    assert response.status_code == 201
    document_id = response.json()[0]["id"]

    # The job was handed to arq's pool...
    assert len(enqueued) == 1
    job_name, args = enqueued[0]
    assert job_name == documents_module.INGESTION_JOB_NAME
    assert args == (document_id,)

    # ...but never actually run inside the request: no extraction/embedding
    # call happened, and the worker's own job function was never invoked.
    assert embed_calls == []
    assert process_document_calls == []


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


def test_second_account_gets_404_on_both_delete_and_retry_of_the_same_foreign_id() -> None:
    """Both mutating routes are checked against the exact same foreign id,
    not just against the resource type in general."""
    owner = signed_up_client()
    doc_id = owner.post("/documents", files={"files": txt_file()}).json()[0]["id"]

    other = signed_up_client()
    retry_response = other.post(f"/documents/{doc_id}/retry")
    delete_response = other.delete(f"/documents/{doc_id}")

    assert retry_response.status_code == 404
    assert delete_response.status_code == 404
    # Neither attempt mutated or removed the owner's row.
    owner_docs = owner.get("/documents").json()
    assert any(doc["id"] == doc_id for doc in owner_docs)


def test_deleting_an_unknown_document_id_is_a_404_not_a_500() -> None:
    client = signed_up_client()

    response = client.delete("/documents/not-a-uuid")

    assert response.status_code == 404


def test_retrying_an_unknown_document_id_is_a_404_not_a_500() -> None:
    client = signed_up_client()

    response = client.post("/documents/not-a-uuid/retry")

    assert response.status_code == 404


def test_owner_can_delete_their_own_document() -> None:
    client = signed_up_client()
    doc_id = client.post("/documents", files={"files": txt_file()}).json()[0]["id"]

    response = client.delete(f"/documents/{doc_id}")

    assert response.status_code == 204
    assert client.get("/documents").json() == []


# ---------------------------------------------------------------------------
# Auth guard: an unauthenticated caller cannot upload or list documents. The
# api_spec declares `/documents` as cookie-authenticated; neither AC-010 nor
# any of the pytest tests above previously exercised the unauthenticated
# path, which is exactly the contract a client depends on before it ever
# gets to try a real upload.
# ---------------------------------------------------------------------------


def test_upload_without_a_session_cookie_is_unauthorized() -> None:
    client = new_client()

    response = client.post("/documents", files={"files": txt_file()})

    assert response.status_code == 401


def test_listing_documents_without_a_session_cookie_is_unauthorized() -> None:
    client = new_client()

    response = client.get("/documents")

    assert response.status_code == 401


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
