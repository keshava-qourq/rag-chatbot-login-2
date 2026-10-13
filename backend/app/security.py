"""Password hashing and session management shared by the auth routes.

`get_current_user` is the single indexed-lookup FastAPI dependency other
tickets (notably US-003) attach to any route that needs to know who is
calling: it resolves the session cookie to a user with one query against
`sessions.token_hash`, which is indexed.
"""

from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import Session as SessionModel
from app.models import User

SESSION_COOKIE_NAME = "session"
SESSION_TTL = timedelta(days=14)

PASSWORD_MIN_LENGTH = 8

# Stated once here so the signup route and the 422 body it returns always
# agree on the rule, and the frontend can render this exact copy.
PASSWORD_RULES = (
    "Password must be at least 8 characters long and include at least one "
    "uppercase letter, one lowercase letter, and one number."
)

# bcrypt, never a bare hashlib digest, for anything that is a password.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def validate_password_strength(password: str) -> bool:
    """The one place the password strength rule is encoded."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    return True


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd_context.verify(password, password_hash)


def _hash_token(token: str) -> str:
    # The session token itself, not a password, so sha256 here is fine --
    # it is only ever compared against another sha256 digest, never used to
    # authenticate on its own without the matching session row.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: DBSession, user: User) -> str:
    """Issue a new opaque session token and persist its hash."""
    token = secrets.token_urlsafe(32)
    session = SessionModel(
        user_id=user.id,
        token_hash=_hash_token(token),
        expires_at=datetime.now(timezone.utc) + SESSION_TTL,
    )
    db.add(session)
    db.commit()
    return token


def get_session_by_token(db: DBSession, token: str) -> SessionModel | None:
    """The single indexed lookup: active, unexpired session for this token."""
    token_hash = _hash_token(token)
    now = datetime.now(timezone.utc)
    stmt = select(SessionModel).where(
        SessionModel.token_hash == token_hash,
        SessionModel.revoked_at.is_(None),
        SessionModel.expires_at > now,
    )
    return db.execute(stmt).scalar_one_or_none()


def revoke_session(db: DBSession, token: str) -> None:
    session = get_session_by_token(db, token)
    if session is not None:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()


def get_current_user(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: DBSession = Depends(get_db),
) -> User:
    """FastAPI dependency: the signed-in user, or a 401 with no detail leak."""
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    record = get_session_by_token(db, session)
    if record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return record.user
