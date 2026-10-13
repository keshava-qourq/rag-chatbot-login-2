"""Conversation routes: list, create, load, rename, delete, ask.

Stubs only. Retrieval, Gemini streaming and persistence are the chat
ticket's work -- this file fixes the route shapes and OpenAPI document
ahead of it.
"""

from fastapi import APIRouter, status

from app.schemas import AskQuestionRequest, RenameConversationRequest, StubResponse

router = APIRouter(tags=["conversations"])


@router.get("/conversations", response_model=list[StubResponse])
async def list_conversations() -> list[StubResponse]:
    return []


@router.post("/conversations", response_model=StubResponse)
async def create_conversation() -> StubResponse:
    return StubResponse(endpoint="POST /conversations")


@router.get("/conversations/{conversation_id}", response_model=StubResponse)
async def get_conversation(conversation_id: str) -> StubResponse:
    return StubResponse(endpoint="GET /conversations/{id}")


@router.patch("/conversations/{conversation_id}", response_model=StubResponse)
async def rename_conversation(
    conversation_id: str, payload: RenameConversationRequest
) -> StubResponse:
    return StubResponse(endpoint="PATCH /conversations/{id}")


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: str) -> None:
    return None


@router.post("/conversations/{conversation_id}/messages", response_model=StubResponse)
async def ask_question(conversation_id: str, payload: AskQuestionRequest) -> StubResponse:
    # Real implementation streams the answer token by token over SSE, then
    # persists it; a stub returns a typed body, per the other routes here.
    return StubResponse(endpoint="POST /conversations/{id}/messages")
