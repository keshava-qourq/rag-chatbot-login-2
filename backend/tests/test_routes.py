"""Every approved API spec endpoint is present in the generated app.

This is a scaffold-completeness check, not a behaviour test: each route is
still a stub, so this only proves the path and method exist and the app
starts with them mounted -- not that any of them does the right thing yet.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# (method, path) exactly as the approved API spec declares it, with FastAPI's
# `{param}` path-parameter syntax.
EXPECTED_ROUTES = [
    ("POST", "/documents"),
    ("GET", "/documents"),
    ("GET", "/documents/events"),
    ("DELETE", "/documents/{document_id}"),
    ("POST", "/documents/{document_id}/retry"),
    ("GET", "/conversations"),
    ("POST", "/conversations"),
    ("GET", "/conversations/{conversation_id}"),
    ("PATCH", "/conversations/{conversation_id}"),
    ("DELETE", "/conversations/{conversation_id}"),
    ("POST", "/conversations/{conversation_id}/messages"),
]


def test_every_api_spec_endpoint_is_mounted() -> None:
    openapi = client.get("/openapi.json").json()
    paths = openapi["paths"]

    for method, path in EXPECTED_ROUTES:
        assert path in paths, f"missing path {path}"
        assert method.lower() in paths[path], f"missing method {method} on {path}"
