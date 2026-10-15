"""Document routes: upload, list, status stream, delete, retry.

Validates and stores uploaded files (S3, or local disk without a bucket --
see `app.storage`), creates one `Document` row per
file with status `queued`, and enqueues an ingestion job to arq -- the
ingestion ticket (US-007-1) owns the worker that actually extracts, chunks
and embeds the file. Every query here filters by the session user, resolved
via `app.security.get_current_user`, so one account can never see or touch
another's documents.

Delete is a true purge: the stored file and every `Chunk` row (content
and embedding) for the document are removed, not just the `Document` row
itself. Retry clears any chunks left by a failed attempt and re-enqueues
ingestion against the same `s3_key` rather than requiring a fresh upload.
"""

import asyncio
import io
import json
import logging
import os
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app import storage
from app.database import SessionLocal, get_db
from app.models import Chunk, Document, User
from app.schemas import DocumentResponse
from app.security import get_current_user
from app.worker import _redis_settings

router = APIRouter(tags=["documents"])

logger = logging.getLogger("app.documents")

# Module-level singletons so route signatures satisfy B008 (no function call
# as an argument default) while still resolving per-request via FastAPI's
# dependency injection.
_DBDependency = Depends(get_db)
_CurrentUserDependency = Depends(get_current_user)
_FilesField = File(...)

# Sane defaults, overridable per deployment; read fresh from the environment
# on every request so a config change takes effect without a restart.
_DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024
_DEFAULT_MAX_UPLOAD_PAGES = 500

_ALLOWED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/markdown": ".md",
    "text/plain": ".txt",
}

_EXTENSION_TO_MIME_TYPE = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/markdown",
    ".txt": "text/plain",
}

_SUPPORTED_TYPES_MESSAGE = (
    "Supported file types are PDF, Word (.docx), Markdown (.md) and plain text (.txt)."
)

# The arq job name the worker (US-007-1) registers to process a queued
# document. Only the name is a contract between the two tickets; the worker
# implementation itself is out of scope here.
INGESTION_JOB_NAME = "process_document"

# The status stream polls rather than listens for pushed events, since
# nothing in this codebase yet publishes document-status change
# notifications; a 1s interval is frequent enough to feel live without
# hammering the database.
_EVENT_POLL_INTERVAL_SECONDS = 1.0

# Hard ceiling on how long one connection to /documents/events is kept open.
# `Request.is_disconnected()` is the primary way this generator learns the
# client went away, but it is not guaranteed to fire promptly against every
# transport (notably some ASGI test transports), so this is the backstop
# that guarantees the generator -- and the thread or event loop running it --
# always terminates rather than running for the lifetime of the process.
_EVENT_STREAM_MAX_SECONDS = 60.0


def _max_upload_bytes() -> int:
    return int(os.getenv("MAX_UPLOAD_BYTES", _DEFAULT_MAX_UPLOAD_BYTES))


def _max_upload_pages() -> int:
    return int(os.getenv("MAX_UPLOAD_PAGES", _DEFAULT_MAX_UPLOAD_PAGES))


def _resolve_mime_type(upload: UploadFile) -> str | None:
    """The file's effective mime type, trusting the extension over a
    generic or missing `Content-Type` header from the client."""
    filename = upload.filename or ""
    extension = os.path.splitext(filename)[1].lower()
    if extension in _EXTENSION_TO_MIME_TYPE:
        return _EXTENSION_TO_MIME_TYPE[extension]
    if upload.content_type in _ALLOWED_CONTENT_TYPES:
        return upload.content_type
    return None


def _count_pdf_pages(data: bytes) -> int | None:
    """The page count for a PDF, or None when it cannot be determined --
    an undeterminable count is not itself a reason to reject the file."""
    try:
        reader = PdfReader(io.BytesIO(data))
        return len(reader.pages)
    except Exception:
        return None


def _store_file(key: str, data: bytes, content_type: str) -> None:
    storage.store_file(key, data, content_type)


def _delete_file(key: str) -> None:
    """Best-effort purge of the stored file.

    Deleting the file is attempted before the `Document` row is removed
    (per the constraint that a storage failure must not leave the DB row
    orphaned pointing at a surviving file), but a delete failure here --
    e.g. the file is already gone, or S3 is briefly unreachable -- is logged
    and swallowed rather than left to block the purge: retrying a delete is
    always safe, so failing to remove the DB row over it would only leave an
    orphaned file *and* an orphaned Document row, which is strictly worse.
    """
    try:
        storage.delete_file(key)
    except Exception:
        logger.exception("failed to delete stored file %s", key)


async def _enqueue_ingestion(document_id: uuid.UUID) -> None:
    """Hand the document off to the ingestion worker without waiting on it.

    When `REDIS_URL` is unset (local development without the queue running)
    this is a no-op rather than a failure -- the document stays `queued`
    until a worker is available, which is the ingestion ticket's concern,
    not upload's.
    """
    redis_settings = _redis_settings()
    if redis_settings is None:
        return

    from arq.connections import create_pool

    # The file is already stored and its row committed, so an unreachable
    # Redis must not turn the upload into an error: the document stays
    # `queued` and Retry re-enqueues it once the queue is back.
    try:
        pool = await create_pool(redis_settings)
    except Exception:
        logger.exception("document %s not queued for ingestion", document_id)
        return
    try:
        await pool.enqueue_job(INGESTION_JOB_NAME, str(document_id))
    except Exception:
        logger.exception("document %s not queued for ingestion", document_id)
    finally:
        await pool.close()


def _document_response(document: Document) -> DocumentResponse:
    return DocumentResponse(
        id=str(document.id),
        filename=document.filename,
        created_at=document.created_at,
        size_bytes=document.size_bytes,
        status=document.status,
        failure_reason=document.failure_reason,
    )


def _get_owned_document(db: DBSession, document_id: str, user_id: uuid.UUID) -> Document:
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="document not found"
        ) from exc

    stmt = select(Document).where(Document.id == doc_uuid, Document.user_id == user_id)
    document = db.execute(stmt).scalar_one_or_none()
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")
    return document


@router.post(
    "/documents",
    response_model=list[DocumentResponse],
    status_code=status.HTTP_201_CREATED,
)
async def upload_documents(
    files: list[UploadFile] = _FilesField,
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> list[DocumentResponse]:
    max_bytes = _max_upload_bytes()
    max_pages = _max_upload_pages()

    # Validate every file -- size, type, then page count -- before storing or
    # creating a single record, so a batch of N files either all pass
    # validation or none of them are processed or enqueued.
    validated: list[tuple[UploadFile, bytes, str, int | None]] = []
    for upload in files:
        data = await upload.read()
        size = len(data)

        if size > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"{upload.filename} is {size} bytes, which exceeds the "
                    f"maximum allowed upload size of {max_bytes} bytes."
                ),
            )

        mime_type = _resolve_mime_type(upload)
        if mime_type is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{upload.filename} is not a supported file type. "
                + _SUPPORTED_TYPES_MESSAGE,
            )

        page_count: int | None = None
        if mime_type == "application/pdf":
            page_count = _count_pdf_pages(data)
            if page_count is not None and page_count > max_pages:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"{upload.filename} has {page_count} pages, which exceeds "
                        f"the maximum allowed page count of {max_pages}."
                    ),
                )

        validated.append((upload, data, mime_type, page_count))

    documents: list[Document] = []
    for upload, data, mime_type, page_count in validated:
        key = f"{user.id}/{uuid.uuid4()}-{storage.safe_filename(upload.filename or '')}"
        _store_file(key, data, mime_type)

        document = Document(
            user_id=user.id,
            filename=upload.filename or "untitled",
            s3_key=key,
            mime_type=mime_type,
            size_bytes=len(data),
            page_count=page_count,
            status="queued",
        )
        db.add(document)
        documents.append(document)

    db.commit()
    for document in documents:
        db.refresh(document)

    # Enqueued after the commit, once every document has a durable row and an
    # id -- and only after every file in the batch validated and stored, so a
    # later file's rejection never leaves an earlier one enqueued.
    for document in documents:
        await _enqueue_ingestion(document.id)

    return [_document_response(document) for document in documents]


@router.get("/documents", response_model=list[DocumentResponse])
async def list_documents(
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> list[DocumentResponse]:
    stmt = select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    documents = db.execute(stmt).scalars().all()
    return [_document_response(document) for document in documents]


async def _document_event_stream(user_id: uuid.UUID, request: Request) -> AsyncIterator[str]:
    """Poll this user's documents and emit one SSE event per status change.

    Runs its own session rather than the request's: the request's session
    closes once the handler returns, but this generator keeps running for as
    long as the client stays connected. It stops as soon as the client
    disconnects, or in any case after `_EVENT_STREAM_MAX_SECONDS`, so a
    connection here is never a reason the process cannot exit.
    """
    last_known: dict[str, str] = {}
    db = SessionLocal()
    loop = asyncio.get_event_loop()
    deadline = loop.time() + _EVENT_STREAM_MAX_SECONDS
    try:
        while loop.time() < deadline:
            if await request.is_disconnected():
                break

            stmt = select(Document).where(Document.user_id == user_id)
            documents = db.execute(stmt).scalars().all()
            for document in documents:
                doc_id = str(document.id)
                if last_known.get(doc_id) != document.status:
                    last_known[doc_id] = document.status
                    payload = json.dumps(
                        {
                            "id": doc_id,
                            "status": document.status,
                            "filename": document.filename,
                            "failure_reason": document.failure_reason,
                        }
                    )
                    yield f"event: status\ndata: {payload}\n\n"
            db.expire_all()
            await asyncio.sleep(_EVENT_POLL_INTERVAL_SECONDS)
    finally:
        db.close()


@router.get("/documents/events")
async def document_events(
    request: Request, user: User = _CurrentUserDependency
) -> StreamingResponse:
    return StreamingResponse(
        _document_event_stream(user.id, request),
        media_type="text/event-stream",
    )


@router.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_document(
    document_id: str,
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> None:
    document = _get_owned_document(db, document_id, user.id)

    # Delete the stored file before the row: a document whose row
    # survives but whose file is gone would still be visible and
    # retry-able; the reverse (file gone, row survives briefly) is the
    # safe ordering given above (AC-017, AC-019).
    _delete_file(document.s3_key)

    # `Document.chunks` cascades "all, delete-orphan", so deleting the row
    # removes every Chunk (content and embedding) for it in the same
    # transaction. A pending or in-flight arq job for this id becomes a
    # no-op once the row is gone: `app.ingestion._load_and_mark_processing`
    # looks the document up before doing anything and returns immediately
    # when it is missing (AC-019).
    db.delete(document)
    db.commit()
    return None


@router.post("/documents/{document_id}/retry", response_model=DocumentResponse)
async def retry_document(
    document_id: str,
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> DocumentResponse:
    document = _get_owned_document(db, document_id, user.id)

    # Discard anything a prior failed (or partial) attempt left behind
    # before re-enqueueing, so retrying never doubles up chunks or leaves a
    # stale embedding alongside a freshly re-ingested one (AC-025).
    db.query(Chunk).filter(Chunk.document_id == document.id).delete(synchronize_session=False)

    document.status = "queued"
    document.failure_reason = None
    db.commit()
    db.refresh(document)

    # Re-enqueued against the same s3_key -- no re-upload required.
    await _enqueue_ingestion(document.id)
    return _document_response(document)
