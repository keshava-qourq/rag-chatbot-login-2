"""Entry point for the ingestion worker (same codebase, separate process).

Run as `arq app.worker.WorkerSettings`. It pulls jobs from the same Redis the
API enqueues to, so the two must agree on `REDIS_URL`. No job functions are
registered yet -- extraction, chunking, embedding and status reporting are
the ingestion ticket's work; this module is the base the jobs attach to.
"""

import os
from urllib.parse import urlparse

from arq.connections import RedisSettings


def _redis_settings() -> RedisSettings | None:
    """Parse REDIS_URL into arq's settings object, or None when it is unset.

    Read at import time deliberately: arq's runner imports this module once
    per worker process and expects `WorkerSettings.redis_settings` to already
    be a value, not a callable -- there is no later point to defer this to.
    The product owner adds REDIS_URL before deployment, not before
    development, so `None` here is the expected state until then.
    """
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None
    parsed = urlparse(redis_url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
        database=int(parsed.path.lstrip("/") or 0),
    )


class WorkerSettings:
    """arq's entry point: `arq app.worker.WorkerSettings`."""

    functions: list = []
    redis_settings = _redis_settings()
