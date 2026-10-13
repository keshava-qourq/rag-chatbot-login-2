"""Auth routes: /auth/signup, /auth/login, /auth/logout, /me.

Cookie-based sessions only -- no token is ever handed to the client to store
itself. Passwords are hashed with passlib's bcrypt backend; the session
cookie carries an opaque random token whose sha256 digest is the only thing
stored server-side, looked up by a single indexed query (see
`app.security.get_current_user`).
"""

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, SignupRequest, UserResponse
from app.security import (
    PASSWORD_RULES,
    SESSION_COOKIE_NAME,
    create_session,
    get_current_user,
    hash_password,
    revoke_session,
    validate_password_strength,
    verify_password,
)

router = APIRouter(tags=["auth"])

# 14 days, matching app.security.SESSION_TTL.
_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14

# A single generic body for any bad-credentials case, so the response reveals
# nothing about whether the email is registered (AC-005).
_INVALID_CREDENTIALS_DETAIL = "email or password is incorrect"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=_COOKIE_MAX_AGE_SECONDS,
        path="/",
    )


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=str(user.id), email=user.email, created_at=user.created_at)


@router.post(
    "/auth/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def signup(
    payload: SignupRequest, response: Response, db: DBSession = Depends(get_db)
) -> UserResponse:
    if not validate_password_strength(payload.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"field": "password", "message": PASSWORD_RULES},
        )

    email = payload.email.lower()
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "field": "email",
                "message": "An account with this email already exists.",
            },
        )

    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session(db, user)
    _set_session_cookie(response, token)
    return _user_response(user)


@router.post("/auth/login", response_model=UserResponse)
async def login(
    payload: LoginRequest, response: Response, db: DBSession = Depends(get_db)
) -> UserResponse:
    email = payload.email.lower()
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()

    if user is None:
        # Hash a password anyway so an unknown email takes about as long as a
        # wrong-password check on a real account -- the response must not let
        # timing reveal whether the email is registered.
        hash_password(payload.password)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=_INVALID_CREDENTIALS_DETAIL
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=_INVALID_CREDENTIALS_DETAIL
        )

    token = create_session(db, user)
    _set_session_cookie(response, token)
    return _user_response(user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: DBSession = Depends(get_db),
) -> Response:
    if session is not None:
        revoke_session(db, session)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> UserResponse:
    return _user_response(user)
