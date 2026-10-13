"""Document routes: upload, list, status stream, delete, retry.

Stubs only. Upload validation, S3 storage, ingestion enqueueing and the
SSE status stream are the ingestion ticket's work -- this file fixes the
route shapes and OpenAPI document ahead of it.
"""

from fastapi import APIRouter, status

from app.schemas import StubResponse

router = APIRouter(tags=["documents"])


@router.post("/documents", response_model=list[StubResponse])
async def upload_documents() -> list[StubResponse]:
    return [StubResponse(endpoint="POST /documents")]


@router.get("/documents", response_model=list[StubResponse])
async def list_documents() -> list[StubResponse]:
    return []


@router.get("/documents/events", response_model=StubResponse)
async def document_events() -> StubResponse:
    # Real implementation returns a `text/event-stream` StreamingResponse;
    # a stub endpoint returns a typed body instead of a stream it cannot yet
    # produce, so the route is visible in the OpenAPI document regardless.
    return StubResponse(endpoint="GET /documents/events")


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str) -> None:
    return None


@router.post("/documents/{document_id}/retry", response_model=StubResponse)
async def retry_document(document_id: str) -> StubResponse:
    return StubResponse(endpoint="POST /documents/{id}/retry")
