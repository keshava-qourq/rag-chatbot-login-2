"""Pydantic request and response models.

One pair per entity in the approved data model. Every route in
`app.routers` is fully implemented against these shapes -- there is no
remaining stub endpoint and so no placeholder response model here either.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """What signup, login and /me return: never the password or its hash."""

    id: str
    email: EmailStr
    created_at: datetime


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
