"""Pydantic request and response models.

One pair per entity in the approved data model. Every route in
`app.routers` is fully implemented against these shapes -- there is no
remaining stub endpoint and so no placeholder response model here either.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


class RenameConversationRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def _title_must_not_be_blank(cls, value: str) -> str:
        """AC-050: an empty or whitespace-only title is rejected (422) and
        must never reach the handler, let alone overwrite a stored title."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be empty or whitespace-only")
        return stripped


class AskQuestionRequest(BaseModel):
    question: str


class DocumentResponse(BaseModel):
    """What POST /documents, GET /documents and POST /documents/{id}/retry
    return for a document.

    `failure_reason` is `None` for every status except `failed`, where it is
    a short plain-language message (see `app.ingestion._classify_failure`)
    rather than a raw exception string.
    """

    id: str
    filename: str
    created_at: datetime
    size_bytes: int
    status: str
    failure_reason: str | None = None


class CitationResponse(BaseModel):
    """One citation attached to an assistant message.

    `n` is the 1-based marker number matching the `[[n]]` marker in the
    assistant message's `content` this citation belongs to (AC-034, AC-038).
    `document` is the source document's filename, included directly so a
    client need not join against the documents list to show it.
    """

    id: str
    n: int
    document_id: str
    document: str
    page: int
    quoted_passage: str


class MessageResponse(BaseModel):
    """One message in a conversation, with any citations it carries.

    `citations` is always empty for a `user` message; an `assistant` message
    carries one citation per retrieved chunk it drew its answer from,
    ordered by `n` so a reload reproduces the exact marker-to-citation
    mapping (AC-038).
    """

    id: str
    role: str
    content: str
    created_at: datetime
    citations: list[CitationResponse] = []


class ConversationResponse(BaseModel):
    """What GET/POST /conversations and PATCH /conversations/{id} return."""

    id: str
    title: str
    title_locked: bool
    created_at: datetime
    updated_at: datetime


class ConversationDetailResponse(ConversationResponse):
    """What GET /conversations/{id} returns: the conversation plus every
    message, in the order they were sent, each with its own citations."""

    messages: list[MessageResponse] = []


class GeminiKeyRequest(BaseModel):
    """PUT /settings/gemini: the Gemini API key to save for the whole app."""

    api_key: str

    @field_validator("api_key")
    @classmethod
    def _api_key_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("api_key must not be empty or whitespace-only")
        return stripped


class GeminiSettingsResponse(BaseModel):
    """What GET/PUT/DELETE /settings/gemini return. Never the key itself.

    `source` is where the key in effect comes from: `"app"` (saved on the
    Settings page), `"environment"` (the `GEMINI_API_KEY` fallback), or
    None when no key is set. `key_hint` is its last four characters only.
    `updated_at`/`updated_by` describe the Settings-page key and are None
    unless `source` is `"app"`.
    """

    configured: bool
    source: Literal["app", "environment"] | None
    key_hint: str | None
    updated_at: datetime | None
    updated_by: str | None
    chat_model: str
    embedding_model: str
