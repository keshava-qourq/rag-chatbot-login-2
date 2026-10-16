"""The app has no login: every request acts as one shared workspace user.

Covers that the sign-up/log-in/log-out routes are gone, that every route
answers without a session cookie, that separate visitors share one
workspace, and that `get_current_user` creates the workspace user only once.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

import app.security as security
from app.database import SessionLocal
from app.main import app
from app.models import User


def new_client() -> TestClient:
    return TestClient(app, base_url="https://testserver")


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/auth/signup"),
        ("POST", "/auth/login"),
        ("POST", "/auth/logout"),
        ("GET", "/me"),
    ],
)
def test_the_login_routes_are_gone(method: str, path: str) -> None:
    assert new_client().request(method, path).status_code == 404


def test_every_route_answers_without_a_session_cookie() -> None:
    client = new_client()

    assert client.get("/documents").status_code == 200
    assert client.get("/conversations").status_code == 200
    assert client.get("/settings/gemini").status_code == 200
    created = client.post("/conversations")
    assert created.status_code == 201
    assert client.get(f"/conversations/{created.json()['id']}").status_code == 200


def test_a_leftover_session_cookie_from_before_is_ignored() -> None:
    client = new_client()
    client.cookies.set("session", "a-token-from-when-the-app-had-login")

    assert client.get("/conversations").status_code == 200


def test_separate_visitors_share_one_workspace() -> None:
    first = new_client()
    conversation_id = first.post("/conversations").json()["id"]

    second = new_client()

    assert conversation_id in [c["id"] for c in second.get("/conversations").json()]


def test_the_workspace_user_is_created_once() -> None:
    with SessionLocal() as db:
        first = security.get_current_user(db)
    with SessionLocal() as db:
        second = security.get_current_user(db)
        count = db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.email == security.WORKSPACE_USER_EMAIL)
        )

    assert first.id == second.id
    assert count == 1
