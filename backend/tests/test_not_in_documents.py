"""Behavioural tests for US-010: told clearly when the answer is not in my
documents.

Covers the three acceptance criteria directly against the real
`POST /conversations/{id}/messages` endpoint and its real
`_retrieve_relevant_chunks`/`SIMILARITY_THRESHOLD` logic -- as opposed to
`test_conversations_followup.py`, which only exercises the refusal path as
a side effect of a follow-up-resolution scenario. Here the question is
always a *first* question (no history resolution involved), so the
refusal/no-documents behaviour is tested in isolation:

- AC-031: a user with a ready document asks a question for which no chunk
  scores above the similarity threshold -> the fixed refusal message, no
  model call, no citations, and that is exactly what gets persisted.
- AC-032: a well-known general-knowledge question none of the user's
  documents covers -> the refusal message, never the "generally correct"
  answer, even when the (stubbed) chat model is configured to supply one.
- AC-033: a user with zero documents at all -> a distinct "nothing to
  search yet" message, with no model call of any kind (not even an
  embedding call for retrieval, since there is nothing to retrieve from).

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
from app.main import app

STRONG_PASSWORD = "Str0ngPass!"

VECTOR_DIM = 768
MATCHING_VECTOR = [1.0] + [0.0] * (VECTOR_DIM - 1)
ORTHOGONAL_VECTOR = [0.0] * (VECTOR_DIM - 1) + [1.0]


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


def process_to_ready(
    document_id: str,
    monkeypatch: pytest.MonkeyPatch,
    vector: list[float],
    content: bytes = b"The Eiffel Tower is a famous landmark in Paris, France.",
) -> None:
    monkeypatch.setattr(ingestion_module, "_fetch_file", lambda key: content)

    def fake_embed(texts, *, correlation_id=None):
        return [vector for _ in texts]

    monkeypatch.setattr(ingestion_module, "embed", fake_embed)
    asyncio.run(ingestion_module.process_document({}, document_id))


def create_conversation(client: TestClient) -> str:
    response = client.post("/conversations")
    assert response.status_code == 201
    return response.json()["id"]


def ask(client: TestClient, conversation_id: str, question: str) -> str:
    response = client.post(
        f"/conversations/{conversation_id}/messages", json={"question": question}
    )
    assert response.status_code == 200
    return response.text


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


def refusing_chat_stream(calls: list[list[dict]]):
    """A chat_stream stub that would hand back a substantive, free answer
    if it were ever invoked -- tests assert it is not."""

    def fake_chat_stream(messages, **kwargs):
        calls.append(list(messages))
        yield "this must never be sent to the client"

    return fake_chat_stream


# ---------------------------------------------------------------------------
# AC-031: ready documents, but no chunk scores above the similarity
# threshold for this question -> fixed refusal, no citations, no model call.
# ---------------------------------------------------------------------------


def test_no_chunk_above_threshold_yields_refusal_with_no_citations_and_no_model_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch, MATCHING_VECTOR)
    conversation_id = create_conversation(client)

    # The question embeds to a vector orthogonal to every chunk's embedding,
    # so nothing clears SIMILARITY_THRESHOLD.
    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [ORTHOGONAL_VECTOR for _ in texts]
    )
    chat_stream_calls: list[list[dict]] = []
    monkeypatch.setattr(
        conversations_module, "chat_stream", refusing_chat_stream(chat_stream_calls)
    )

    raw_text = ask(client, conversation_id, "What does appendix 7 say about liability caps?")
    events = parse_sse(raw_text)

    assert chat_stream_calls == [], "the chat model must never be called when nothing is relevant"

    citations_events = [data for event, data in events if event == "citations"]
    done_events = [data for event, data in events if event == "done"]
    error_events = [data for event, data in events if event == "error"]

    assert error_events == []
    assert citations_events and citations_events[0]["citations"] == []
    assert done_events
    message = done_events[0]["message"]
    assert message["content"] == conversations_module.REFUSAL_MESSAGE
    assert message["citations"] == []

    # Persisted exactly as streamed: a reload shows the same refusal, still
    # with no citations.
    detail = client.get(f"/conversations/{conversation_id}").json()
    assistant_messages = [m for m in detail["messages"] if m["role"] == "assistant"]
    assert len(assistant_messages) == 1
    assert assistant_messages[0]["content"] == conversations_module.REFUSAL_MESSAGE
    assert assistant_messages[0]["citations"] == []


# ---------------------------------------------------------------------------
# AC-032: a well-known general-knowledge question none of the documents
# covers -> the refusal message, not the generally correct factual answer,
# even when the chat model is (hypothetically) willing to supply one.
# ---------------------------------------------------------------------------


def test_general_knowledge_question_gets_refusal_not_the_correct_factual_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(
        document_id,
        monkeypatch,
        MATCHING_VECTOR,
        content=b"Internal expense policy: reimbursements are processed within 10 business days.",
    )
    conversation_id = create_conversation(client)

    # The question embeds orthogonally to the (unrelated) uploaded document.
    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [ORTHOGONAL_VECTOR for _ in texts]
    )
    # Configured to answer correctly from general world knowledge *if*
    # called -- proving the refusal is not an accident of an empty model
    # response, but of the model never being asked at all.
    chat_stream_calls: list[list[dict]] = []

    def fake_chat_stream(messages, **kwargs):
        chat_stream_calls.append(list(messages))
        yield "The capital of France is Paris."

    monkeypatch.setattr(conversations_module, "chat_stream", fake_chat_stream)

    raw_text = ask(client, conversation_id, "What is the capital of France?")
    events = parse_sse(raw_text)
    done_events = [data for event, data in events if event == "done"]

    assert chat_stream_calls == [], "a general-knowledge question must never reach the chat model"
    assert done_events
    message = done_events[0]["message"]
    assert message["content"] == conversations_module.REFUSAL_MESSAGE
    assert "Paris" not in message["content"]
    assert message["citations"] == []


# ---------------------------------------------------------------------------
# AC-033: zero documents uploaded at all -> a distinct "nothing to search
# yet" message, no model call of any kind (not even an embedding call).
# ---------------------------------------------------------------------------


def test_zero_documents_yields_distinct_nothing_to_search_message_with_no_model_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    conversation_id = create_conversation(client)

    def embed_not_expected(texts, **kwargs):
        raise AssertionError("retrieval must not run when the caller has no documents at all")

    def chat_not_expected(messages, **kwargs):
        raise AssertionError("no chat call is expected with zero documents")

    def chat_stream_not_expected(messages, **kwargs):
        raise AssertionError("no chat_stream call is expected with zero documents")
        yield  # pragma: no cover - never reached; keeps this a generator

    monkeypatch.setattr(conversations_module, "embed", embed_not_expected)
    monkeypatch.setattr(conversations_module, "chat", chat_not_expected)
    monkeypatch.setattr(conversations_module, "chat_stream", chat_stream_not_expected)

    raw_text = ask(client, conversation_id, "What does my lease say about pets?")
    events = parse_sse(raw_text)
    done_events = [data for event, data in events if event == "done"]
    citations_events = [data for event, data in events if event == "citations"]

    assert done_events
    message = done_events[0]["message"]
    assert message["content"] == conversations_module.NO_DOCUMENTS_MESSAGE
    assert message["citations"] == []
    assert citations_events and citations_events[0]["citations"] == []

    # Distinct from the "I searched and found nothing relevant" refusal --
    # these must not be the same string, or a user cannot tell "upload
    # something" apart from "what you asked isn't covered".
    assert conversations_module.NO_DOCUMENTS_MESSAGE != conversations_module.REFUSAL_MESSAGE

    # And the prompt to upload is implied by this response being durable:
    # a reload shows the exact same message, not a retrieval attempt.
    detail = client.get(f"/conversations/{conversation_id}").json()
    assistant_messages = [m for m in detail["messages"] if m["role"] == "assistant"]
    assert len(assistant_messages) == 1
    assert assistant_messages[0]["content"] == conversations_module.NO_DOCUMENTS_MESSAGE
