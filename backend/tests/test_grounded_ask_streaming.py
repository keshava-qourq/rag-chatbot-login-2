"""Behavioural tests for the grounded-ask endpoint's streaming, citation and
persistence contract (US-010/US-011/US-012 backend behaviour).

Covers:

- AC-034: a grounded answer streams inline `[[n]]` markers and the
  `citations` SSE event carries the document filename and page for each
  marker the model actually wrote.
- AC-036: a marker whose `n` is outside the excerpts actually passed to the
  model is dropped before it is streamed or persisted; every persisted
  `Citation` resolves to a chunk owned by the caller on a still-existing
  document; another user's conversation id returns 404.
- AC-038: after a successful stream, the assistant message and its
  citations are persisted and are returned by `GET /conversations/{id}`.
- AC-039 (server half): a `GeminiProviderError` raised mid-stream yields an
  SSE `error` event and leaves no user or assistant message persisted for
  that turn.

As in `test_not_in_documents.py` and `test_conversations_followup.py`,
`app.gemini_client.embed`/`chat`/`chat_stream` are never called for real:
every test stubs the module-level seams in `app.routers.conversations` (and,
to get a document to `ready`, in `app.ingestion`), so nothing here makes a
network call.
"""

from __future__ import annotations

import asyncio
import io
import json
import uuid

import pytest
from fastapi.testclient import TestClient

import app.ingestion as ingestion_module
import app.routers.conversations as conversations_module
import app.routers.documents as documents_module
from app.database import SessionLocal
from app.gemini_client import GeminiProviderError
from app.main import app
from app.models import Chunk, Citation, Document

STRONG_PASSWORD = "Str0ngPass!"

VECTOR_DIM = 768
MATCHING_VECTOR = [1.0] + [0.0] * (VECTOR_DIM - 1)


def unique_email() -> str:
    return f"user-{uuid.uuid4().hex}@example.com"


def new_client() -> TestClient:
    return TestClient(app, base_url="https://testserver")


def signed_up_client() -> TestClient:
    client = new_client()
    response = client.post(
        "/auth/signup", json={"email": unique_email(), "password": STRONG_PASSWORD}
    )
    assert response.status_code == 201
    return client


def txt_file(name: str = "notes.txt", content: bytes = b"hello world") -> tuple:
    return (name, io.BytesIO(content), "text/plain")


@pytest.fixture(autouse=True)
def stub_s3_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(documents_module, "_store_file", lambda key, data, content_type: None)


def upload_and_get_id(client: TestClient, filename: str = "notes.txt") -> str:
    response = client.post("/documents", files={"files": txt_file(filename)})
    assert response.status_code == 201
    return response.json()[0]["id"]


def process_to_ready_two_pages(
    document_id: str,
    monkeypatch: pytest.MonkeyPatch,
    filename: str = "notes.txt",
) -> None:
    """Two short markdown sections -> two chunks, pages 1 and 2, each
    embedded to `MATCHING_VECTOR` -- enough excerpts to exercise two
    distinct, orderable citation markers."""
    content = (
        b"# First Section\n\nThe Eiffel Tower is in Paris, France.\n\n"
        b"# Second Section\n\nIt was completed in 1889 for the World's Fair."
    )
    monkeypatch.setattr(ingestion_module, "_fetch_file", lambda key: content)

    def fake_embed(texts, *, correlation_id=None):
        return [MATCHING_VECTOR for _ in texts]

    monkeypatch.setattr(ingestion_module, "embed", fake_embed)
    asyncio.run(ingestion_module.process_document({}, document_id))


def create_conversation(client: TestClient) -> str:
    response = client.post("/conversations")
    assert response.status_code == 201
    return response.json()["id"]


def ask(client: TestClient, conversation_id: str, question: str) -> object:
    return client.post(f"/conversations/{conversation_id}/messages", json={"question": question})


def parse_sse(text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in text.strip().split("\n\n"):
        if not block.strip():
            continue
        event_type = None
        data = None
        for line in block.splitlines():
            if line.startswith("event:"):
                event_type = line[len("event:") :].strip()
            elif line.startswith("data:"):
                data = line[len("data:") :].strip()
        if event_type and data is not None:
            events.append((event_type, json.loads(data)))
    return events


def stub_retrieval_embed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts]
    )


def stub_chat_stream_yielding(monkeypatch: pytest.MonkeyPatch, answer: str) -> list[list[dict]]:
    calls: list[list[dict]] = []

    def fake_chat_stream(messages, **kwargs):
        calls.append(list(messages))
        yield answer

    monkeypatch.setattr(conversations_module, "chat_stream", fake_chat_stream)
    return calls


# ---------------------------------------------------------------------------
# AC-034: a grounded answer streams inline [[n]] markers, and the citations
# event carries the document filename and page for each marker.
# ---------------------------------------------------------------------------


def test_grounded_answer_streams_markers_and_citations_carry_filename_and_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client, "eiffel.txt")
    process_to_ready_two_pages(document_id, monkeypatch, "eiffel.txt")
    conversation_id = create_conversation(client)

    stub_retrieval_embed(monkeypatch)
    stub_chat_stream_yielding(
        monkeypatch,
        "The Eiffel Tower is in Paris [[1]], completed in 1889 [[2]].",
    )

    response = ask(client, conversation_id, "Tell me about the Eiffel Tower.")
    assert response.status_code == 200
    events = parse_sse(response.text)

    citations_events = [data for event, data in events if event == "citations"]
    assert citations_events
    citations = citations_events[0]["citations"]
    assert len(citations) == 2

    pages = {c["page"] for c in citations}
    assert pages == {1, 2}
    for citation in citations:
        assert citation["document"] == "eiffel.txt"
        assert citation["page"] in (1, 2)

    done_events = [data for event, data in events if event == "done"]
    assert done_events
    assert "[[1]]" in done_events[0]["message"]["content"]
    assert "[[2]]" in done_events[0]["message"]["content"]


# ---------------------------------------------------------------------------
# AC-036: a marker outside the excerpts actually passed to the model is
# dropped; every persisted Citation resolves to a chunk owned by the caller
# belonging to a still-existing document; another user's conversation id
# returns 404.
# ---------------------------------------------------------------------------


def test_marker_outside_given_excerpts_is_dropped_from_stream_and_persistence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client, "notes.txt")
    process_to_ready_two_pages(document_id, monkeypatch, "notes.txt")
    conversation_id = create_conversation(client)

    stub_retrieval_embed(monkeypatch)
    # [[1]] is valid; [[5]] and [[99]] exceed the two excerpts actually given.
    stub_chat_stream_yielding(
        monkeypatch, "This part is grounded [[1]], but this is invented [[5]] and [[99]]."
    )

    response = ask(client, conversation_id, "Tell me about the Eiffel Tower.")
    assert response.status_code == 200
    events = parse_sse(response.text)

    citations_events = [data for event, data in events if event == "citations"]
    assert citations_events
    citations = citations_events[0]["citations"]
    assert [c["n"] for c in citations] == [1]

    # Persisted the same way: a reload shows exactly one citation.
    detail = client.get(f"/conversations/{conversation_id}").json()
    assistant_message = next(m for m in detail["messages"] if m["role"] == "assistant")
    assert len(assistant_message["citations"]) == 1


def test_every_persisted_citation_resolves_to_a_chunk_owned_by_the_caller(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client, "notes.txt")
    process_to_ready_two_pages(document_id, monkeypatch, "notes.txt")
    conversation_id = create_conversation(client)

    stub_retrieval_embed(monkeypatch)
    stub_chat_stream_yielding(monkeypatch, "Grounded answer [[1]] and [[2]].")

    response = ask(client, conversation_id, "Tell me about the Eiffel Tower.")
    assert response.status_code == 200

    session = SessionLocal()
    try:
        document = session.get(Document, uuid.UUID(document_id))
        assert document is not None
        caller_user_id = document.user_id

        citations = session.query(Citation).filter(Citation.document_id == document.id).all()
        assert len(citations) == 2
        for citation in citations:
            chunk = session.get(Chunk, citation.chunk_id)
            assert chunk is not None
            assert chunk.user_id == caller_user_id
            assert chunk.document_id == document.id
    finally:
        session.close()


def test_another_users_conversation_id_returns_404() -> None:
    owner_client = signed_up_client()
    conversation_id = create_conversation(owner_client)

    other_client = signed_up_client()
    response = ask(other_client, conversation_id, "Anything?")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# AC-038: after a successful stream, the assistant message and its citations
# are persisted and are returned by GET /conversations/{id}.
# ---------------------------------------------------------------------------


def test_successful_stream_persists_message_and_citations_returned_by_get(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client, "eiffel.txt")
    process_to_ready_two_pages(document_id, monkeypatch, "eiffel.txt")
    conversation_id = create_conversation(client)

    stub_retrieval_embed(monkeypatch)
    answer_text = "The Eiffel Tower is in Paris [[1]]."
    stub_chat_stream_yielding(monkeypatch, answer_text)

    response = ask(client, conversation_id, "Where is the Eiffel Tower?")
    assert response.status_code == 200

    detail = client.get(f"/conversations/{conversation_id}").json()
    messages = detail["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "Where is the Eiffel Tower?"
    assert messages[1]["content"] == answer_text
    assert len(messages[1]["citations"]) == 1
    assert messages[1]["citations"][0]["page"] == 1
    assert messages[1]["citations"][0]["document_id"] == document_id


# ---------------------------------------------------------------------------
# AC-039 (server half): a GeminiProviderError mid-stream yields an SSE error
# event and leaves no user or assistant message persisted for that turn.
# ---------------------------------------------------------------------------


def test_provider_error_mid_stream_yields_error_event_and_persists_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client, "eiffel.txt")
    process_to_ready_two_pages(document_id, monkeypatch, "eiffel.txt")
    conversation_id = create_conversation(client)

    stub_retrieval_embed(monkeypatch)

    def failing_chat_stream(messages, **kwargs):
        yield "The Eiffel Tower is "
        raise GeminiProviderError("provider unavailable mid-stream")

    monkeypatch.setattr(conversations_module, "chat_stream", failing_chat_stream)

    response = ask(client, conversation_id, "Where is the Eiffel Tower?")
    assert response.status_code == 200
    events = parse_sse(response.text)

    error_events = [data for event, data in events if event == "error"]
    done_events = [data for event, data in events if event == "done"]
    assert error_events
    assert done_events == []

    detail = client.get(f"/conversations/{conversation_id}").json()
    assert detail["messages"] == []
