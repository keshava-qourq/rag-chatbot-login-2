"""Behavioural tests for the email/password auth slice.

Uses `base_url="https://testserver"` so the `secure` session cookie the app
sets is actually retained and replayed by the test client between requests
within the same `TestClient` instance -- a real browser would require https
too, so this mirrors production rather than working around it.
"""

import logging
import uuid

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Session as SessionModel
from app.models import User

STRONG_PASSWORD = "Str0ngPass!"


def unique_email() -> str:
    return f"user-{uuid.uuid4().hex}@example.com"


def new_client() -> TestClient:
    return TestClient(app, base_url="https://testserver")


def test_signup_creates_account_sets_cookie_and_returns_user() -> None:
    client = new_client()
    email = unique_email()

    response = client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == email
    assert "password" not in body
    assert "password_hash" not in body
    assert "session" in response.cookies

    me = client.get("/me")
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_signup_sets_an_httponly_secure_samesite_cookie() -> None:
    client = new_client()
    email = unique_email()

    response = client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    set_cookie = response.headers.get("set-cookie", "")
    assert "session=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "Secure" in set_cookie
    assert "samesite" in set_cookie.lower()


def test_signup_rejects_weak_password_with_field_specific_message() -> None:
    client = new_client()

    response = client.post("/auth/signup", json={"email": unique_email(), "password": "weak"})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["field"] == "password"
    assert "8" in detail["message"]


def test_signup_weak_password_creates_no_account() -> None:
    client = new_client()
    email = unique_email()

    client.post("/auth/signup", json={"email": email, "password": "weak"})

    db = SessionLocal()
    try:
        assert db.query(User).filter(User.email == email).one_or_none() is None
    finally:
        db.close()


def test_signup_rejects_duplicate_email_with_field_specific_message() -> None:
    client = new_client()
    email = unique_email()

    first = client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})
    assert first.status_code == 201

    second = client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["field"] == "email"

    db = SessionLocal()
    try:
        assert db.query(User).filter(User.email == email).count() == 1
    finally:
        db.close()


def test_password_is_never_stored_in_plaintext() -> None:
    client = new_client()
    email = unique_email()

    client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        assert user.password_hash != STRONG_PASSWORD
        assert STRONG_PASSWORD not in user.password_hash
        # bcrypt (passlib), never a bare digest.
        assert user.password_hash.startswith("$2")
    finally:
        db.close()


def test_signup_never_logs_the_password(caplog: object) -> None:
    client = new_client()
    email = unique_email()

    with caplog.at_level(logging.DEBUG):  # type: ignore[attr-defined]
        response = client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    assert response.status_code == 201
    assert STRONG_PASSWORD not in caplog.text  # type: ignore[attr-defined]
    for record in caplog.records:  # type: ignore[attr-defined]
        assert STRONG_PASSWORD not in str(record.getMessage())
        if record.exc_text:
            assert STRONG_PASSWORD not in record.exc_text


def test_login_never_logs_the_password(caplog: object) -> None:
    signup_client = new_client()
    email = unique_email()
    signup_client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    login_client = new_client()
    with caplog.at_level(logging.DEBUG):  # type: ignore[attr-defined]
        response = login_client.post(
            "/auth/login", json={"email": email, "password": STRONG_PASSWORD}
        )

    assert response.status_code == 200
    assert STRONG_PASSWORD not in caplog.text  # type: ignore[attr-defined]
    for record in caplog.records:  # type: ignore[attr-defined]
        assert STRONG_PASSWORD not in str(record.getMessage())
        if record.exc_text:
            assert STRONG_PASSWORD not in record.exc_text


def test_failed_login_never_logs_the_attempted_password(caplog: object) -> None:
    signup_client = new_client()
    email = unique_email()
    signup_client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    wrong_password = "WrongPass1"
    with caplog.at_level(logging.DEBUG):  # type: ignore[attr-defined]
        response = new_client().post(
            "/auth/login", json={"email": email, "password": wrong_password}
        )

    assert response.status_code == 401
    assert wrong_password not in caplog.text  # type: ignore[attr-defined]


def test_login_with_correct_credentials_sets_cookie_and_returns_user() -> None:
    signup_client = new_client()
    email = unique_email()
    signup_client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    login_client = new_client()
    response = login_client.post("/auth/login", json={"email": email, "password": STRONG_PASSWORD})

    assert response.status_code == 200
    assert response.json()["email"] == email
    assert "session" in response.cookies

    set_cookie = response.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie
    assert "Secure" in set_cookie
    assert "samesite" in set_cookie.lower()

    me = login_client.get("/me")
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_login_wrong_password_returns_generic_401() -> None:
    signup_client = new_client()
    email = unique_email()
    signup_client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    response = new_client().post("/auth/login", json={"email": email, "password": "WrongPass1"})

    assert response.status_code == 401
    assert response.json()["detail"] == "email or password is incorrect"


def test_login_unknown_email_returns_identically_shaped_401() -> None:
    response = new_client().post(
        "/auth/login", json={"email": unique_email(), "password": "WrongPass1"}
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "email or password is incorrect"


def test_wrong_password_and_unknown_email_return_byte_identical_bodies() -> None:
    signup_client = new_client()
    email = unique_email()
    signup_client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    wrong_password_response = new_client().post(
        "/auth/login", json={"email": email, "password": "WrongPass1"}
    )
    unknown_email_response = new_client().post(
        "/auth/login", json={"email": unique_email(), "password": "WrongPass1"}
    )

    assert wrong_password_response.status_code == unknown_email_response.status_code == 401
    assert wrong_password_response.content == unknown_email_response.content


def test_me_without_a_cookie_is_unauthorized() -> None:
    response = new_client().get("/me")

    assert response.status_code == 401


def test_logout_invalidates_the_session_row_and_clears_the_cookie() -> None:
    client = new_client()
    email = unique_email()
    client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})

    session_token = client.cookies.get("session")
    assert session_token is not None

    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 204

    db = SessionLocal()
    try:
        import hashlib

        token_hash = hashlib.sha256(session_token.encode("utf-8")).hexdigest()
        record = db.query(SessionModel).filter(SessionModel.token_hash == token_hash).one()
        assert record.revoked_at is not None
    finally:
        db.close()

    me = client.get("/me")
    assert me.status_code == 401


def test_openapi_describes_typed_auth_schemas_with_no_stub_left() -> None:
    client = new_client()

    openapi = client.get("/openapi.json").json()
    schemas = openapi["components"]["schemas"]

    assert "UserResponse" in schemas
    signup_response_ref = openapi["paths"]["/auth/signup"]["post"]["responses"]["201"]
    assert "StubResponse" not in str(signup_response_ref)
    login_response_ref = openapi["paths"]["/auth/login"]["post"]["responses"]["200"]
    assert "StubResponse" not in str(login_response_ref)
    me_response_ref = openapi["paths"]["/me"]["get"]["responses"]["200"]
    assert "StubResponse" not in str(me_response_ref)
