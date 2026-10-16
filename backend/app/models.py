"""SQLAlchemy models for the approved data model.

One class per entity: users, sessions, documents, chunks, conversations,
messages, citations, plus the app-wide `app_settings`. Ownership columns
(`user_id`) sit directly on every table that holds account-private data,
per the architecture note that
per-account isolation is enforced by filtering on them.

Every column uses a portable type, so `Base.metadata.create_all` succeeds
on any PostgreSQL as well as the SQLite fallback `database.py` uses when
`DATABASE_URL` is unset. No database extension is required: email is plain
text (the auth routes lowercase it before every write and lookup, so
uniqueness is still case-insensitive), and an embedding is its 768 floats
stored as JSON text (chat ranks chunks by cosine similarity in Python -- see
`app.routers.conversations`). Earlier versions used `citext` and pgvector's
`vector(768)`, which made startup fail on any Postgres without those
extensions installed and enabled.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

CreatedAt = Mapped[datetime]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def created_at_column():
    """`created_at timestamptz`, stamped on insert.

    Stamped with a Python-side `default` (microsecond resolution) rather
    than relying solely on `server_default=func.now()`: some backends --
    notably SQLite, used for tests and local development -- only store
    `CURRENT_TIMESTAMP` at second resolution, so two rows inserted within
    the same second would otherwise compare equal and make
    `ORDER BY created_at` nondeterministic between them. `server_default`
    stays as a fallback for any row inserted outside the ORM.
    """
    return mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Unique: `app.security.get_current_user` relies on it so two racing
    # first requests cannot create two workspace users.
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: CreatedAt = created_at_column()

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    """Login sessions. Unused since the app's login was removed; the table is
    kept so an existing database needs no migration."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    created_at: CreatedAt = created_at_column()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    s3_key: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # queued | processing | ready | failed -- enforced in application code,
    # not a DB constraint, since the ingestion ticket owns the state machine.
    status: Mapped[str] = mapped_column(Text, nullable=False, default="queued")
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: CreatedAt = created_at_column()

    user: Mapped["User"] = relationship(back_populates="documents")
    chunks: Mapped[list["Chunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    # Denormalised from documents.user_id so a chunk's ownership -- and a
    # user's vectors -- can be filtered and deleted without a join.
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # The chunk's 768-float embedding as JSON text (see
    # `app.ingestion._embedding_value`).
    embedding: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: CreatedAt = created_at_column()

    document: Mapped["Document"] = relationship(back_populates="chunks")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False, default="New chat")
    # Set once the user renames the conversation themselves, so auto-titling
    # on the first question never overwrites a deliberate choice.
    title_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: CreatedAt = created_at_column()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=_utcnow,
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: CreatedAt = created_at_column()

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    citations: Mapped[list["Citation"]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )


class Citation(Base):
    __tablename__ = "citations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    chunk_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("chunks.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    # The 1-based marker number `n` matching the `[[n]]` marker the model
    # actually wrote in the answer text this citation belongs to (AC-034,
    # AC-038) -- distinct from `page` and from insertion order, so
    # `GET /conversations/{id}` can order citations by `n` and reproduce the
    # exact marker-to-citation mapping on reload. Additive column: defaults
    # to 1 so it never breaks a row inserted before this existed.
    n: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    page: Mapped[int] = mapped_column(Integer, nullable=False)
    quoted_passage: Mapped[str] = mapped_column(Text, nullable=False)

    message: Mapped["Message"] = relationship(back_populates="citations")
    # Read-only convenience so a citation's response can carry the source
    # document's filename (AC-034) without the caller joining against the
    # documents list separately.
    document: Mapped["Document"] = relationship()


class AppSetting(Base):
    """One app-wide setting, shared by every account.

    Today that is only the Gemini API key entered on the Settings page (see
    `app.routers.settings`). Deliberately not account-private: there is one
    key for the whole app, so there is no `user_id` ownership column --
    `updated_by_user_id` only records who last changed the value.
    """

    __tablename__ = "app_settings"

    name: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        onupdate=_utcnow,
        nullable=False,
    )
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    updated_by: Mapped["User | None"] = relationship()


__all__ = [
    "Base",
    "User",
    "Session",
    "Document",
    "Chunk",
    "Conversation",
    "Message",
    "Citation",
    "AppSetting",
]
