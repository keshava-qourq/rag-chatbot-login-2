"""SQLAlchemy models for the approved data model.

One class per entity: users, sessions, documents, chunks, conversations,
messages, citations. Ownership columns (`user_id`) sit directly on every
table that holds account-private data, per the architecture note that
per-account isolation is enforced by filtering on them.

Two Postgres-only types appear here -- `citext` for case-insensitive email
and pgvector's `vector(768)` for embeddings -- because that is what the
architecture names. Both degrade to a portable equivalent via
`with_variant` so `Base.metadata.create_all` still succeeds against the
SQLite fallback `database.py` uses when `DATABASE_URL` is unset; the real
target remains PostgreSQL 16 with the pgvector extension enabled.
"""

import uuid
from datetime import UTC, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

# citext requires `CREATE EXTENSION IF NOT EXISTS citext;` on the Postgres
# database before this column can be created there -- ops' job, not this
# scaffold's; there are no migrations yet to carry it.
EmailType = CITEXT().with_variant(String(320), "sqlite")

# pgvector's column type compiles to Postgres-specific DDL; on every other
# dialect (SQLite, for tests) it falls back to plain text so the table still
# creates, even though nothing here can run a similarity query against it.
EmbeddingType = Vector(768).with_variant(Text(), "sqlite")

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
    email: Mapped[str] = mapped_column(EmailType, unique=True, nullable=False)
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
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Indexed: session resolution (the `get_current_user` FastAPI dependency
    # in app.routers.auth) is a single lookup by this column on every
    # authenticated request.
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
    embedding: Mapped[list[float] | None] = mapped_column(EmbeddingType, nullable=True)
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


__all__ = [
    "Base",
    "User",
    "Session",
    "Document",
    "Chunk",
    "Conversation",
    "Message",
    "Citation",
]
