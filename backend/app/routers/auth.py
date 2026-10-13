"""Auth routes: /auth/signup, /auth/login, /auth/logout, /me.

Stubs only. Password hashing (passlib), session issuance and the HTTP-only
session cookie are the first ticket's work, not this scaffold's -- this
file exists so the route shapes, request bodies and OpenAPI document are
already correct before that ticket starts.
"""

from fastapi import APIRouter, Response, status

from app.schemas import LoginRequest, SignupRequest, StubResponse

router = APIRouter(tags=["auth"])


@router.post("/auth/signup", response_model=StubResponse)
async def signup(payload: SignupRequest) -> StubResponse:
    return StubResponse(endpoint="POST /auth/signup")


@router.post("/auth/login", response_model=StubResponse)
async def login(payload: LoginRequest) -> StubResponse:
    return StubResponse(endpoint="POST /auth/login")


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=StubResponse)
async def me() -> StubResponse:
    return StubResponse(endpoint="GET /me")
