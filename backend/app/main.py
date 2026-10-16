"""Application entrypoint.

Generated from the approved architecture: one router per component that owns
endpoints, one route per endpoint the API spec declares. Every generated route
is a stub that returns a typed placeholder, so the service starts, serves its
OpenAPI document and passes its tests before a single handler is implemented.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import models  # noqa: F401 -- imported so the tables register before create_all
from app.database import Base, engine
from app.routers import routers
from app.services import configured_services

# The app starts without a Gemini API key: it is entered on the Settings page
# (see `app.routers.settings`). Until then, uploads fail with a
# "set a key" reason and chat answers with the same instruction.

app = FastAPI(
    title="RAG Chatbot Login (2)",
    description="RAG Chatbot with Login, Chat History and Gemini",
    version="0.1.0",
)

# The SPA runs on a different origin than the API, so the browser refuses its calls
# unless that origin is allowed here. In development that is the Vite dev server; when
# deployed, the platform injects the frontend's real URL as ALLOWED_ORIGINS (comma
# separated). Point ALLOWED_ORIGINS at the real thing and nothing else has to change.
_dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins or _dev_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The scaffold ships no migrations, so the tables are created from the models on
# startup. Replace this with Alembic before anything holds data worth keeping.
Base.metadata.create_all(bind=engine)


def _ensure_additive_columns() -> None:
    """Add a column `create_all` cannot: it only creates missing *tables*,
    never alters one that already exists. On SQLite (tests, local dev) a
    `citations` table created before the `n` column (US-011-1) existed
    would otherwise be missing it forever; this adds it, with its model
    default, exactly once and only when it is not already there. Postgres
    deployments have no migration tooling yet either (see the note above)
    and are expected to run DDL by hand, so this only touches SQLite.
    """
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as connection:
        columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(citations)")).fetchall()
        }
        if columns and "n" not in columns:
            connection.execute(
                text("ALTER TABLE citations ADD COLUMN n INTEGER NOT NULL DEFAULT 1")
            )


_ensure_additive_columns()

for router in routers:
    app.include_router(router)


@app.get("/health")
async def health() -> dict[str, object]:
    """Liveness probe, and the only route here that is not a stub."""
    return {"status": "ok", "services": configured_services()}
