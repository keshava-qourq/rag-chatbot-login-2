"""Engine, session factory and the request-scoped session dependency.

SQLite by default so a fresh clone runs with nothing but `pip install -r
requirements.txt` -- the approved architecture may name Postgres or MySQL, but
naming one is not the same as having one, and a scaffold that cannot start
without a database server is a scaffold nobody runs. Point `DATABASE_URL` at
the real thing when it exists; nothing else has to change.
"""

import os
from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

_is_sqlite = DATABASE_URL.startswith("sqlite")

# SQLite rejects a connection made on one thread and used on another, which is
# exactly what happens when FastAPI runs a sync dependency in its threadpool.
# `timeout` extends how long a connection waits on a lock before sqlite3
# raises "database is locked": FastAPI runs every non-async dependency
# (`get_db`, `get_current_user`) in a worker thread, so two requests that
# arrive close together -- the ordinary case once more than one browser tab,
# or more than one e2e test, hits this API at the same time -- open genuinely
# concurrent connections to the same file. The driver's 5s default is tight
# enough that a handful of concurrent uploads can occasionally lose that race
# and surface to the caller as a bare, unexplained 500.
_connect_args = {"check_same_thread": False, "timeout": 30} if _is_sqlite else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)


if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, connection_record) -> None:  # noqa: ANN001
        """WAL lets readers proceed while a writer holds the file instead of
        every connection serializing on one lock -- the single biggest
        source of spurious "database is locked" errors under the concurrent
        access this threaded-dependency setup produces. `busy_timeout`
        mirrors the connection-level `timeout` above for a statement that
        starts waiting on a lock after the connection was already open.
        """
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base that every generated model inherits."""


def get_db() -> Iterator[Session]:
    """One session per request, closed even when the handler raises."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
