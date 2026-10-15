"""Owner-scoped similarity search over a user's ready document chunks.

`search` is the one entry point: embed the caller's question via
`app.gemini_client.embed`, then return the top-k most similar chunks
restricted to that caller's `user_id` and to documents with status `ready`
(AC-027, AC-029). A chunk belonging to another user is never a candidate --
not merely unlikely to be chosen -- because every code path below filters by
`user_id` before ranking, so another account's closest-matching chunk is
never even considered.

`chunks.embedding` is JSON text on every database (see `app.models.Chunk`),
so this fetches every ready, owned chunk and ranks them by cosine similarity
in Python -- the database never computes similarity itself.
"""

from __future__ import annotations

import json
import uuid

from sqlalchemy.orm import Session as DBSession

from app.gemini_client import embed
from app.ingestion import get_ready_chunks
from app.models import Chunk


def _coerce_vector(value: object) -> list[float]:
    """A chunk's stored embedding as a plain `list[float]`.

    Stored as JSON-encoded text (see `app.ingestion._embedding_value`).
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

    # Never touches another user's chunks -- `get_ready_chunks` filters on
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
