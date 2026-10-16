"""Who is calling, now that the app has no login.

There are no accounts to sign up for or log in to: every request acts as one
shared workspace user, created the first time anything asks for it. Every
route still scopes its data by `user_id` through `get_current_user`, so that
dependency keeps its name and the routes are unchanged -- all of the data
simply belongs to this one user.
"""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import User

# `.invalid` is a reserved top-level domain, so this can never be a real mailbox.
WORKSPACE_USER_EMAIL = "workspace@local.invalid"

# Nobody signs in as the workspace user, so it has no usable password: "!" is
# not a valid hash under any scheme.
_NO_PASSWORD_HASH = "!"

# Module-level singleton so `get_current_user`'s signature satisfies B008
# (no function call as an argument default) while still resolving per-request
# via FastAPI's dependency injection.
_DBDependency = Depends(get_db)


def _workspace_user_query():
    return select(User).where(User.email == WORKSPACE_USER_EMAIL)


def get_current_user(db: DBSession = _DBDependency) -> User:
    """FastAPI dependency: the shared workspace user, created on first use."""
    user = db.execute(_workspace_user_query()).scalar_one_or_none()
    if user is not None:
        return user
    user = User(email=WORKSPACE_USER_EMAIL, password_hash=_NO_PASSWORD_HASH)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two first-ever requests raced and the other one created it; the
        # unique email constraint stopped a duplicate, so use theirs.
        db.rollback()
        user = db.execute(_workspace_user_query()).scalar_one()
    return user
