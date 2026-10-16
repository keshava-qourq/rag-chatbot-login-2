"""Behavioural tests for the arq ingestion job and its retrieval helper.

Gemini and S3 are stubbed in every test here: `app.ingestion.embed` and
`app.ingestion._fetch_file` are monkeypatched so no real network call is
ever made, matching how `tests/test_documents.py` stubs S3 for the upload
endpoint.
"""

import asyncio
import io
import json
import uuid

import pytest
from pypdf import PdfWriter

import app.ingestion as ingestion
from app.database import SessionLocal
from app.models import Chunk, Document, User

PDF_MIME = "application/pdf"
TXT_MIME = "text/plain"
MD_MIME = "text/markdown"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def make_pdf_bytes(num_pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(num_pages):
        page = writer.add_blank_page(width=200, height=200)
        page.merge_page  # noqa: B018 - touch attribute only, no-op
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def make_docx_bytes(paragraphs: list[str]) -> bytes:
    from docx import Document as DocxDocument

    doc = DocxDocument()
    for text in paragraphs:
        doc.add_paragraph(text)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def create_user_and_document(
    session, *, mime_type: str = TXT_MIME, status: str = "queued"
) -> Document:
    user = User(email=f"user-{uuid.uuid4().hex}@example.com", password_hash="!")
    session.add(user)
    session.commit()
    session.refresh(user)

    document = Document(
        user_id=user.id,
        filename="doc",
        s3_key=f"key-{uuid.uuid4().hex}",
        mime_type=mime_type,
        size_bytes=100,
        status=status,
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


@pytest.fixture(autouse=True)
def stub_embed(monkeypatch: pytest.MonkeyPatch):
    """Returns one 768-dim vector per input text, deterministic per call."""

    def fake_embed(texts, *, correlation_id=None):
        return [[float(i)] * 768 for i in range(len(texts))]

    monkeypatch.setattr(ingestion, "embed", fake_embed)
    return fake_embed


def stub_s3(monkeypatch: pytest.MonkeyPatch, data: bytes) -> None:
    monkeypatch.setattr(ingestion, "_fetch_file", lambda key: data)


def _decoded_embedding(raw: object) -> list[float]:
    """`Chunk.embedding` as a plain list, whether it came back as a JSON
    string (the SQLite fallback column type) or a native list."""
    return json.loads(raw) if isinstance(raw, str) else raw


# ---------------------------------------------------------------------------
# AC-020: queued -> processing -> ready, chunks persisted with document_id
# and user_id.
# ---------------------------------------------------------------------------


def test_process_document_moves_plain_text_document_to_ready() -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=TXT_MIME)
        stub_s3_data = b"hello world, this is a small plain text document."

        import app.ingestion as mod

        mod._fetch_file = lambda key: stub_s3_data  # type: ignore[assignment]

        asyncio.run(ingestion.process_document({}, str(document.id)))

        session.expire_all()
        refreshed = session.get(Document, document.id)
        assert refreshed.status == "ready"
        assert refreshed.failure_reason is None

        chunks = session.query(Chunk).filter(Chunk.document_id == document.id).all()
        assert len(chunks) >= 1
        for chunk in chunks:
            assert chunk.document_id == document.id
            assert chunk.user_id == document.user_id
        indices = [c.chunk_index for c in sorted(chunks, key=lambda c: c.chunk_index)]
        assert indices == list(range(len(indices)))
    finally:
        session.close()


def test_persisted_chunks_have_non_empty_content_and_768_dim_embedding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=TXT_MIME)
        monkeypatch.setattr(
            ingestion,
            "_fetch_file",
            lambda key: b"hello world, this is a small plain text document.",
        )

        asyncio.run(ingestion.process_document({}, str(document.id)))

        session.expire_all()
        chunks = session.query(Chunk).filter(Chunk.document_id == document.id).all()
        assert chunks
        for chunk in chunks:
            assert chunk.content.strip() != ""
            vector = _decoded_embedding(chunk.embedding)
            assert len(vector) == 768
    finally:
        session.close()


def test_document_passes_through_processing_before_reaching_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=TXT_MIME)
        monkeypatch.setattr(
            ingestion, "_fetch_file", lambda key: b"some text content here for chunking"
        )

        observed: dict[str, str] = {}

        def embed_and_observe(texts, *, correlation_id=None):
            check_session = SessionLocal()
            try:
                mid_flight = check_session.get(Document, document.id)
                observed["status"] = mid_flight.status
            finally:
                check_session.close()
            return [[0.0] * 768 for _ in texts]

        monkeypatch.setattr(ingestion, "embed", embed_and_observe)

        asyncio.run(ingestion.process_document({}, str(document.id)))

        assert observed.get("status") == "processing"
        session.expire_all()
        refreshed = session.get(Document, document.id)
        assert refreshed.status == "ready"
    finally:
        session.close()


def test_process_document_sets_failed_and_failure_reason_on_s3_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=TXT_MIME)

        def boom(key):
            raise ingestion.IngestionError("S3 is down")

        monkeypatch.setattr(ingestion, "_fetch_file", boom)

        asyncio.run(ingestion.process_document({}, str(document.id)))

        session.expire_all()
        refreshed = session.get(Document, document.id)
        assert refreshed.status == "failed"
        assert refreshed.failure_reason
        assert "S3 is down" in refreshed.failure_reason

        chunks = session.query(Chunk).filter(Chunk.document_id == document.id).all()
        assert chunks == []
    finally:
        session.close()


def test_process_document_sets_failed_on_embedding_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=TXT_MIME)
        monkeypatch.setattr(ingestion, "_fetch_file", lambda key: b"some text content here")

        def failing_embed(texts, *, correlation_id=None):
            raise RuntimeError("provider outage")

        monkeypatch.setattr(ingestion, "embed", failing_embed)

        asyncio.run(ingestion.process_document({}, str(document.id)))

        session.expire_all()
        refreshed = session.get(Document, document.id)
        assert refreshed.status == "failed"
        assert refreshed.failure_reason

        # No partially-orphaned chunk rows: a failed embed must not leave any
        # chunk committed for this document.
        chunks = session.query(Chunk).filter(Chunk.document_id == document.id).all()
        assert chunks == []
    finally:
        session.close()


def test_process_document_unknown_id_is_a_noop() -> None:
    # Must not raise; there is nothing to mark failed.
    asyncio.run(ingestion.process_document({}, str(uuid.uuid4())))


# ---------------------------------------------------------------------------
# AC-021: page numbers for PDF/DOCX, section ordinals for Markdown/TXT,
# monotonic chunk_index, overlapping neighbours.
# ---------------------------------------------------------------------------


def test_pdf_chunks_carry_their_source_page_number(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=PDF_MIME)
        pdf_bytes = make_pdf_bytes(2)
        monkeypatch.setattr(ingestion, "_fetch_file", lambda key: pdf_bytes)

        # Blank pages extract no text, so patch extract_text per page to
        # return distinguishable content instead of exercising pypdf's
        # real (empty) extraction of a blank page.
        page_texts = ["first page content " * 50, "second page content " * 50]

        original_extract_pdf = ingestion._extract_pdf

        def fake_extract_pdf(data):
            return [(page_texts[i], i + 1) for i in range(len(page_texts))]

        monkeypatch.setattr(ingestion, "_extract_pdf", fake_extract_pdf)

        asyncio.run(ingestion.process_document({}, str(document.id)))

        session.expire_all()
        refreshed = session.get(Document, document.id)
        assert refreshed.status == "ready"

        chunks = session.query(Chunk).filter(Chunk.document_id == document.id).all()
        pages_seen = {c.page for c in chunks}
        assert pages_seen == {1, 2}
        for chunk in chunks:
            assert chunk.document_id == document.id
        assert original_extract_pdf is not fake_extract_pdf  # sanity: patch applied
    finally:
        session.close()


def test_docx_chunks_carry_document_id_and_page_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=DOCX_MIME)
        docx_bytes = make_docx_bytes(["first paragraph " * 50, "second paragraph " * 50])
        monkeypatch.setattr(ingestion, "_fetch_file", lambda key: docx_bytes)

        asyncio.run(ingestion.process_document({}, str(document.id)))

        session.expire_all()
        refreshed = session.get(Document, document.id)
        assert refreshed.status == "ready"

        chunks = (
            session.query(Chunk)
            .filter(Chunk.document_id == document.id)
            .order_by(Chunk.chunk_index)
            .all()
        )
        assert chunks
        for chunk in chunks:
            assert chunk.document_id == document.id
            assert chunk.page == 1
        assert [c.chunk_index for c in chunks] == list(range(len(chunks)))
    finally:
        session.close()


def test_markdown_document_chunks_carry_section_ordinal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=MD_MIME)
        text = (
            "# Section One\n"
            + ("alpha content word " * 100)
            + "\n# Section Two\n"
            + ("beta content word " * 100)
        )
        monkeypatch.setattr(ingestion, "_fetch_file", lambda key: text.encode("utf-8"))

        asyncio.run(ingestion.process_document({}, str(document.id)))

        session.expire_all()
        refreshed = session.get(Document, document.id)
        assert refreshed.status == "ready"

        chunks = session.query(Chunk).filter(Chunk.document_id == document.id).all()
        assert chunks
        sections_seen = {c.page for c in chunks}
        assert sections_seen == {1, 2}
    finally:
        session.close()


def test_markdown_sections_get_increasing_ordinals() -> None:
    text = "# Section One\n" + ("a" * 100) + "\n# Section Two\n" + ("b" * 100)
    units = ingestion.extract_units(MD_MIME, text.encode("utf-8"))
    assert [number for _, number in units] == [1, 2]


def test_plain_text_with_no_headers_is_a_single_section() -> None:
    units = ingestion.extract_units(TXT_MIME, b"just some plain text, no headers at all")
    assert [number for _, number in units] == [1]


def test_docx_extraction_yields_page_one() -> None:
    data = make_docx_bytes(["first paragraph", "second paragraph"])
    units = ingestion.extract_units(DOCX_MIME, data)
    assert [number for _, number in units] == [1]
    assert "first paragraph" in units[0][0]


def test_chunk_index_is_monotonically_increasing_per_document() -> None:
    session = SessionLocal()
    try:
        document = create_user_and_document(session, mime_type=TXT_MIME)
        long_text = ("word " * 2000).encode("utf-8")
        session_patcher_data = long_text

        import app.ingestion as mod

        mod._fetch_file = lambda key: session_patcher_data  # type: ignore[assignment]

        asyncio.run(ingestion.process_document({}, str(document.id)))

        session.expire_all()
        chunks = (
            session.query(Chunk)
            .filter(Chunk.document_id == document.id)
            .order_by(Chunk.chunk_index)
            .all()
        )
        assert len(chunks) > 1
        assert [c.chunk_index for c in chunks] == list(range(len(chunks)))
    finally:
        session.close()


def test_chunk_text_produces_overlapping_chunks() -> None:
    text = "x" * 4000
    chunks = ingestion.chunk_text(text, chunk_size=1000, overlap=100)
    assert len(chunks) > 1
    # Confirm overlap: the tail of one chunk recurs at the head of the next.
    for first, second in zip(chunks, chunks[1:], strict=False):
        assert first[-50:] in text
        assert second[:50] in text


# ---------------------------------------------------------------------------
# AC-023: retrieval helper filters to a user's ready documents only.
# ---------------------------------------------------------------------------


def test_get_ready_chunks_excludes_non_ready_documents() -> None:
    session = SessionLocal()
    try:
        ready_doc = create_user_and_document(session, mime_type=TXT_MIME, status="ready")
        user_id = ready_doc.user_id

        queued_doc = Document(
            user_id=user_id,
            filename="queued-doc",
            s3_key="key-queued",
            mime_type=TXT_MIME,
            size_bytes=10,
            status="queued",
        )
        processing_doc = Document(
            user_id=user_id,
            filename="processing-doc",
            s3_key="key-processing",
            mime_type=TXT_MIME,
            size_bytes=10,
            status="processing",
        )
        failed_doc = Document(
            user_id=user_id,
            filename="failed-doc",
            s3_key="key-failed",
            mime_type=TXT_MIME,
            size_bytes=10,
            status="failed",
        )
        session.add_all([queued_doc, processing_doc, failed_doc])
        session.commit()

        ready_chunk = Chunk(
            document_id=ready_doc.id,
            user_id=user_id,
            content="ready chunk",
            page=1,
            chunk_index=0,
        )
        other_chunks = [
            Chunk(
                document_id=doc.id,
                user_id=user_id,
                content="should not surface",
                page=1,
                chunk_index=0,
            )
            for doc in (queued_doc, processing_doc, failed_doc)
        ]
        session.add_all([ready_chunk, *other_chunks])
        session.commit()

        results = ingestion.get_ready_chunks(session, user_id)

        assert len(results) == 1
        assert results[0].content == "ready chunk"
        assert results[0].document_id == ready_doc.id
    finally:
        session.close()


def test_get_ready_chunks_excludes_other_users_chunks() -> None:
    session = SessionLocal()
    try:
        own_doc = create_user_and_document(session, mime_type=TXT_MIME, status="ready")
        other_doc = create_user_and_document(session, mime_type=TXT_MIME, status="ready")

        own_chunk = Chunk(
            document_id=own_doc.id,
            user_id=own_doc.user_id,
            content="mine",
            page=1,
            chunk_index=0,
        )
        other_chunk = Chunk(
            document_id=other_doc.id,
            user_id=other_doc.user_id,
            content="not mine",
            page=1,
            chunk_index=0,
        )
        session.add_all([own_chunk, other_chunk])
        session.commit()

        results = ingestion.get_ready_chunks(session, own_doc.user_id)

        assert len(results) == 1
        assert results[0].content == "mine"
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Worker registration contract.
# ---------------------------------------------------------------------------


def test_worker_registers_process_document_under_the_shared_job_name() -> None:
    import app.worker as worker
    from app.routers.documents import INGESTION_JOB_NAME

    assert worker.WorkerSettings.functions == [ingestion.process_document]
    assert ingestion.process_document.__name__ == INGESTION_JOB_NAME
