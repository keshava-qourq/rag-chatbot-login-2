"""Pydantic request and response models.

One pair per entity in the approved data model, plus the placeholder every
generated route returns until it has been implemented. Request bodies are
typed accurately against the approved API spec so the OpenAPI document --
and anything generated from it -- already describes the real contract;
the handlers behind them are still stubs.
"""

from pydantic import BaseModel, EmailStr


class StubResponse(BaseModel):
    """What a generated route returns until someone implements it.

    A stub that returns a typed body rather than raising keeps the service
    startable and its OpenAPI document complete, so the frontend can be built
    against the agreed shape while the handlers are still being written.
    """

    endpoint: str
    status: str = "not_implemented"
    detail: str = "Scaffolded from the approved API spec; no behaviour yet."


class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RenameConversationRequest(BaseModel):
    title: str


class AskQuestionRequest(BaseModel):
    question: str
