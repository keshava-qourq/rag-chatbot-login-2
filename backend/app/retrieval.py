"""Owner-scoped similarity search over a user's ready document chunks.

`search` is the one entry point: embed the caller's question via
`app.gemini_client.embed`, then return the top-k most similar chunks
restricted to that caller's `user_id` and to documents with status `ready`
(AC-027, AC-029). A chunk belonging to another user is never a candidate --
not merely unlikely to be chosen -- because every code path below filters by
`user_id` before ranking, so another account's closest-matching chunk is
never even considered.

On Postgres this runs as a real pgvector `ORDER BY ... <=> ... LIMIT k`
query. `chunks.embedding` falls back to a plain `Text` column on SQLite
(see `app.models.EmbeddingType`), which cannot run that query at all, so
there this degrades to fetching every ready, owned chunk and ranking them
by cosine similarity in Python -- same filtering, computed application-side
instead of in the database.
"""

from __future__ import annotations

import json
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.database import engine
from app.gemini_client import embed
from app.ingestion import get_ready_chunks
from app.models import Chunk, Document

_IS_SQLITE = engine.dialect.name == "sqlite"


def _coerce_vector(value: object) -> list[float]:
    """A chunk's stored embedding as a plain `list[float]`.

    On SQLite it is JSON-encoded text (see `app.ingestion._embedding_value`);
    everywhere else it is already a list.
    """
    if isinstance(value, str):
        return [float(v) for v in json.loads(value)]
    return [float(v) for v in value]  # type: ignore[arg-type]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def search(session: DBSession, user_id: uuid.UUID, question: str, k: int) -> list[Chunk]:
    """The top `k` chunks most similar to `question` for `user_id`.

    Restricted to documents with status `ready`; never returns a chunk
    belonging to any other user (AC-027, AC-029).
    """
    query_vector = embed([question])[0]

    if not _IS_SQLITE:
        stmt = (
            select(Chunk)
            .join(Document, Chunk.document_id == Document.id)
            .where(Chunk.user_id == user_id, Document.status == "ready")
            .order_by(Chunk.embedding.cosine_distance(query_vector))
            .limit(k)
        )
        return list(session.execute(stmt).scalars().all())

    # SQLite fallback: rank every owned, ready chunk in Python. Still never
    # touches another user's chunks -- `get_ready_chunks` filters on
    # `user_id` before a single similarity score is computed.
    candidates = get_ready_chunks(session, user_id)
    scored: list[tuple[float, Chunk]] = []
    for chunk in candidates:
        if chunk.embedding is None:
            continue
        vector = _coerce_vector(chunk.embedding)
        scored.append((_cosine_similarity(query_vector, vector), chunk))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [chunk for _, chunk in scored[:k]]
