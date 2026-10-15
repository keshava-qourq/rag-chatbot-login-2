"""Document ingestion: extraction, chunking, embedding, status transitions.

The arq job `process_document` (registered in `app.worker.WorkerSettings`)
is the single entry point this module exposes to the worker process. Given
a document id it:

1. Loads the `Document` row and moves its status `queued` -> `processing`,
   committing that transition on its own so it is observable immediately.
2. Fetches the stored file (S3 or local disk, see `app.storage`) and
   extracts text -- per PDF page, per DOCX document (python-docx exposes no
   page boundaries, so the whole document is one unit), or per
   Markdown/plain-text section (split on top-level Markdown headers; a file
   with none is one section).
3. Chunks each extracted unit with overlap, embeds every chunk in one
   `app.gemini_client.embed` call, and persists the resulting `Chunk` rows
   in their own commit.
4. Moves the document to `ready` in a final, separate commit.

Any failure in steps 2-4 moves the document to `failed` with
`failure_reason` set to a short plain-language message (see
`_classify_failure`) rather than a raw exception string, in its own commit,
so a crash mid-embed never leaves a document stuck in `processing`.

`app.gemini_client` is the only module this codebase lets talk to a model
provider; this module calls its `embed` function and nothing else.

Also exposes `get_ready_chunks`, the retrieval helper that restricts a
user's chunks to documents whose status is `ready` -- so a deleted, queued,
processing or failed document never contributes a chunk to retrieval.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import uuid

from docx import Document as DocxDocument
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app import storage
from app.database import SessionLocal, engine
from app.gemini_client import embed
from app.models import Chunk, Document
from app.storage import StorageError

logger = logging.getLogger("app.ingestion")

# Character-based chunking: simple, provider-agnostic, and independent of
# whatever tokenizer the embedding model uses internally.
CHUNK_SIZE_CHARS = 1500
CHUNK_OVERLAP_CHARS = 200

_PDF_MIME = "application/pdf"
_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_MD_MIME = "text/markdown"
_TXT_MIME = "text/plain"

_MD_HEADER_RE = re.compile(r"^#{1,6}\s+.*$", re.MULTILINE)

# `chunks.embedding` falls back to a plain `Text` column on SQLite (see
# `app.models.EmbeddingType`); a Python list cannot bind directly to that
# column type the way it can to pgvector's native `vector(768)`, so values
# are JSON-encoded there and left as real lists everywhere else.
_IS_SQLITE = engine.dialect.name == "sqlite"

# Plain-language messages `_classify_failure` maps a failure onto, per
# AC-024 -- a user sees one of these, never a raw exception string.
_NO_TEXT_MESSAGE = "No readable text found in this file."
_PROVIDER_UNAVAILABLE_MESSAGE = "Processing service unavailable - try again."
_STORAGE_UNAVAILABLE_MESSAGE = "Could not retrieve the file - try again."
_GENERIC_MESSAGE = "Something went wrong while processing this file - try again."


class IngestionError(RuntimeError):
    """Raised for an extraction, embedding or storage failure during ingestion.

    Caught by `process_document`'s own handler, which turns it (and any
    other exception from this module) into `Document.failure_reason` via
    `_classify_failure`.
    """


def _embedding_value(vector: list[float]) -> object:
    return json.dumps(vector) if _IS_SQLITE else vector


def _fetch_file(key: str) -> bytes:
    try:
        return storage.read_file(key)
    except StorageError as exc:
        raise IngestionError(str(exc)) from exc


def _extract_pdf(data: bytes) -> list[tuple[str, int]]:
    """One unit per page: `(page text, 1-based page number)`."""
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:
        raise IngestionError(f"failed to read PDF: {exc}") from exc
    units: list[tuple[str, int]] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:
            raise IngestionError(f"failed to extract PDF page {index}: {exc}") from exc
        units.append((text, index))
    return units


def _extract_docx(data: bytes) -> list[tuple[str, int]]:
    """The whole document as one unit, page 1.

    python-docx exposes paragraphs and runs, not page boundaries -- Word
    computes pagination at render time, which is not recoverable from the
    file alone. Treating the document as a single page is the honest
    degenerate case of AC-021's "page number for ... DOCX".
    """
    try:
        doc = DocxDocument(io.BytesIO(data))
    except Exception as exc:
        raise IngestionError(f"failed to read DOCX: {exc}") from exc
    text = "\n".join(paragraph.text for paragraph in doc.paragraphs)
    return [(text, 1)]


def _extract_markdown_or_text(data: bytes) -> list[tuple[str, int]]:
    """One unit per top-level Markdown section, numbered from 1.

    A file with no `#`-style headers (including every plain-text file) is a
    single section, ordinal 1.
    """
    text = data.decode("utf-8", errors="replace")
    matches = list(_MD_HEADER_RE.finditer(text))
    if not matches:
        return [(text, 1)] if text.strip() else []
    units: list[tuple[str, int]] = []
    for position, match in enumerate(matches):
        start = match.start()
        end = matches[position + 1].start() if position + 1 < len(matches) else len(text)
        units.append((text[start:end], position + 1))
    return units


def extract_units(mime_type: str, data: bytes) -> list[tuple[str, int]]:
    """Extracted text broken into `(text, page_or_section_number)` units.

    PDF: one unit per page. DOCX: one unit, page 1. Markdown/plain text: one
    unit per top-level section (or one unit, section 1, when there are none).
    """
    if mime_type == _PDF_MIME:
        return _extract_pdf(data)
    if mime_type == _DOCX_MIME:
        return _extract_docx(data)
    if mime_type in (_MD_MIME, _TXT_MIME):
        return _extract_markdown_or_text(data)
    raise IngestionError(f"unsupported mime type for extraction: {mime_type!r}")


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE_CHARS,
    overlap: int = CHUNK_OVERLAP_CHARS,
) -> list[str]:
    """`text` split into overlapping, non-empty chunks of up to `chunk_size`
    characters, each subsequent chunk starting `overlap` characters before
    the previous one ended."""
    text = text.strip()
    if not text:
        return []
    if overlap >= chunk_size:
        overlap = chunk_size // 4

    chunks: list[str] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + chunk_size, length)
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end == length:
            break
        start = end - overlap
    return chunks


def _build_chunks(document: Document, mime_type: str, data: bytes) -> list[Chunk]:
    """Every `Chunk` row for `document`, embedded and ready to persist.

    Chunking happens per extracted unit (so a chunk's `page` always matches
    the unit it came from) but `chunk_index` increments across the whole
    document, per AC-021's "monotonically increasing chunk_index per
    document".
    """
    units = extract_units(mime_type, data)

    pending: list[tuple[str, int]] = []  # (chunk text, page/section number)
    for unit_text, unit_number in units:
        for piece in chunk_text(unit_text):
            pending.append((piece, unit_number))

    if not pending:
        raise IngestionError("no extractable text found in document")

    texts = [piece for piece, _ in pending]
    try:
        embeddings = embed(texts)
    except Exception as exc:
        raise IngestionError(f"failed to embed document chunks: {exc}") from exc

    if len(embeddings) != len(pending):
        raise IngestionError(
            f"embedding returned {len(embeddings)} vectors for {len(pending)} chunks"
        )

    chunk_rows: list[Chunk] = []
    for index, ((piece, page_number), vector) in enumerate(zip(pending, embeddings, strict=True)):
        chunk_rows.append(
            Chunk(
                document_id=document.id,
                user_id=document.user_id,
                content=piece,
                page=page_number,
                chunk_index=index,
                embedding=_embedding_value(vector),
            )
        )
    return chunk_rows


def _load_and_mark_processing(session: DBSession, document_id: str) -> Document | None:
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        logger.error("invalid document id passed to process_document: %s", document_id)
        return None

    document = session.get(Document, doc_uuid)
    if document is None:
        # Either the id never existed, or the document was deleted after
        # being enqueued (see `app.routers.documents.delete_document`): both
        # cases are a clean no-op rather than an error, which is what makes
        # delete a true cancel of any pending or racing ingestion job
        # (AC-019).
        logger.error("document %s not found for ingestion", document_id)
        return None

    document.status = "processing"
    document.failure_reason = None
    session.add(document)
    session.commit()
    session.refresh(document)
    return document


def _root_message(exc: Exception) -> str:
    """The message of the innermost exception `exc` was raised from.

    Every wrapping raise in this module uses `raise ... from exc`, so the
    immediate `__cause__` is the original failure's own message -- the
    detail worth surfacing (briefly) to the user, as distinct from this
    module's own "failed to ..." wrapping text around it.
    """
    cause = exc.__cause__
    return str(cause) if cause is not None else str(exc)


def _classify_failure(exc: Exception) -> str:
    """A short, plain-language message for `Document.failure_reason`.

    Maps the internal `IngestionError` messages raised throughout this
    module (and the generic errors they wrap) onto one of a small, stable
    set of user-facing strings -- never the raw exception text (AC-024).
    For a storage failure, a short detail (only the text before the first
    colon in the original error's own message, so any further detail --
    connection internals, stack-like text -- never leaks) is appended in
    parentheses.
    """
    message = str(exc).lower()

    if "no extractable text" in message:
        return _NO_TEXT_MESSAGE
    if (
        "failed to read pdf" in message
        or "failed to extract pdf page" in message
        or "failed to read docx" in message
        or "unsupported mime type" in message
    ):
        return _NO_TEXT_MESSAGE
    if "failed to embed" in message or "embedding returned" in message:
        return _PROVIDER_UNAVAILABLE_MESSAGE
    if "failed to fetch" in message:
        detail = _root_message(exc).split(":", 1)[0].strip()
        if detail:
            return f"{_STORAGE_UNAVAILABLE_MESSAGE} ({detail})"
        return _STORAGE_UNAVAILABLE_MESSAGE
    return _GENERIC_MESSAGE


def _mark_failed(session: DBSession, document_id: str, exc: Exception) -> None:
    session.rollback()
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        return
    document = session.get(Document, doc_uuid)
    if document is None:
        return
    document.status = "failed"
    document.failure_reason = _classify_failure(exc)
    session.add(document)
    session.commit()


def _ingest(session: DBSession, document: Document) -> None:
    try:
        data = _fetch_file(document.s3_key)
    except Exception as exc:
        raise IngestionError(f"failed to fetch document from storage: {exc}") from exc

    chunk_rows = _build_chunks(document, document.mime_type, data)

    # Chunk writes are committed on their own, separately from the status
    # transition below, so a crash between the two still leaves a document
    # whose chunks are visible even though it never reached `ready`.
    session.add_all(chunk_rows)
    session.commit()

    document.status = "ready"
    document.failure_reason = None
    session.add(document)
    session.commit()


def _process_document_sync(document_id: str) -> None:
    session = SessionLocal()
    try:
        document = _load_and_mark_processing(session, document_id)
        if document is None:
            return
        try:
            _ingest(session, document)
        except Exception as exc:
            # The raw exception is logged (for operators) but never stored:
            # `_mark_failed` maps it onto a short plain-language message.
            logger.exception("ingestion failed for document %s", document_id)
            _mark_failed(session, document_id, exc)
    finally:
        session.close()


async def process_document(ctx: dict, document_id: str) -> None:
    """The arq job: `process_document(document_id: str)`.

    Registered under this exact name in `app.worker.WorkerSettings.functions`
    so `app.routers.documents`'s enqueue call (by
    `app.routers.documents.INGESTION_JOB_NAME`) resolves to it. All of the
    actual work is synchronous (DB, storage, Gemini), so it runs on a worker
    thread rather than blocking arq's event loop.

    A document deleted after being enqueued (or while this job is running)
    is handled by `_load_and_mark_processing`'s guard: this function becomes
    a no-op rather than resurrecting or half-processing a purged document
    (AC-019).
    """
    await asyncio.to_thread(_process_document_sync, document_id)


def get_ready_chunks(session: DBSession, user_id: uuid.UUID) -> list[Chunk]:
    """Chunks for `user_id`, restricted to documents whose status is `ready`.

    Excludes chunks belonging to queued, processing or failed documents --
    the retrieval helper AC-018/AC-023/AC-026 requires, so a deleted,
    half-ingested or failed document's chunks are never surfaced to
    retrieval.
    """
    stmt = (
        select(Chunk)
        .join(Document, Chunk.document_id == Document.id)
        .where(Chunk.user_id == user_id, Document.status == "ready")
        .order_by(Chunk.document_id, Chunk.chunk_index)
    )
    return list(session.execute(stmt).scalars().all())
