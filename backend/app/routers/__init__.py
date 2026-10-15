"""Generated routers: one module per resource the approved API spec owns.

Every route here is a stub -- it returns a typed placeholder so the service
starts, serves a complete OpenAPI document, and the frontend can be built
against the agreed shape before a single handler does real work. Wiring up
auth, persistence and streaming is the development sprint's job, one ticket
at a time.
"""

from app.routers import auth, conversations, documents, settings

routers = [auth.router, documents.router, conversations.router, settings.router]

__all__ = ["auth", "conversations", "documents", "routers", "settings"]
