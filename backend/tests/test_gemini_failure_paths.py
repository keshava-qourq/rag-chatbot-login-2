"""US-021-3: failure-path coverage for a Gemini outage, end to end.

Complements `test_grounded_ask_streaming.py` (which already covers a
mid-stream `GeminiProviderError`) with the cases that module does not
reach:

- a provider failure or timeout that happens *before* the first token (the
  chat stream never opens) still yields the one fixed `error` event and
  persists nothing for that turn;
- a retrieval-embedding failure ahead of the chat call behaves the same way;
- the same question, resubmitted after a failed turn, succeeds and persists
  exactly one turn -- nothing about the failed attempt lingers;
- no SSE payload or response body -- for either the chat endpoint or a
  failed document's `failure_reason` -- ever contains the provider's own
  exception text, a stack-trace fragment, or anything that looks like a key;
- an embedding failure during ingestion retries a bounded number of times
  with a backoff between attempts (exercising the real
  `app.gemini_client.embed` retry loop, not a stub that bypasses it) before
  the document is marked `failed` with a plain-language reason.

`app.gemini_client`'s client seam (`_get_client`) is patched directly for
the ingestion-retry test, so the real retry/backoff/timeout code in
`embed()` runs; every other test here stubs the higher-level
`app.routers.conversations` seams exactly as the sibling test modules do.
"""

from __future__ import annotations

import asyncio
import io
import json
import uuid

import pytest
from fastapi.testclient import TestClient

import app.gemini_client as gemini_client
import app.ingestion as ingestion_module
import app.routers.conversations as conversations_module
import app.routers.documents as documents_module
from app.database import SessionLocal
from app.gemini_client import GeminiProviderError
from app.main import app
from app.models import Chunk, Document, Message

STRONG_PASSWORD = "Str0ngPass!"
VECTOR_DIM = 768
MATCHING_VECTOR = [1.0] + [0.0] * (VECTOR_DIM - 1)

# A provider-shaped failure string: looks like a real SDK error (a
# stack-trace fragment and something key-shaped), never a plain "it broke".
# Nothing derived from this may ever reach a client-visible payload.
_PROVIDER_SECRET_FRAGMENT = "AIzaSyFAKE1234567890abcdefKEYFRAGMENT"
_STACK_TRACE_FRAGMENT = "Traceback (most recent call last):"
_RAW_PROVIDER_ERROR_TEXT = (
    f"{_STACK_TRACE_FRAGMENT} google.genai.errors.ServerError: upstream 503 "
    f"while using credential {_PROVIDER_SECRET_FRAGMENT}"
)


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
    content: bytes = b"The Eiffel Tower is a famous landmark in Paris, France.",
) -> None:
    monkeypatch.setattr(ingestion_module, "_fetch_file", lambda key: content)

    def fake_embed(texts, *, correlation_id=None):
        return [MATCHING_VECTOR for _ in texts]

    monkeypatch.setattr(ingestion_module, "embed", fake_embed)
    asyncio.run(ingestion_module.process_document({}, document_id))


def create_conversation(client: TestClient) -> str:
    response = client.post("/conversations")
    assert response.status_code == 201
    return response.json()["id"]


def ask(client: TestClient, conversation_id: str, question: str):
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


def persisted_messages(client: TestClient, conversation_id: str) -> list[dict]:
    detail = client.get(f"/conversations/{conversation_id}").json()
    return detail["messages"]


# ---------------------------------------------------------------------------
# A failure (or timeout) before the first token is handed back -- the chat
# stream never opens -- still yields the one fixed error event, and
# persists nothing for that turn.
# ---------------------------------------------------------------------------


def test_chat_stream_failing_before_the_first_token_yields_error_and_persists_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    conversation_id = create_conversation(client)

    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts]
    )

    def never_opens(messages, **kwargs):
        raise GeminiProviderError(_RAW_PROVIDER_ERROR_TEXT)
        yield  # pragma: no cover - unreachable; keeps this a generator function

    monkeypatch.setattr(conversations_module, "chat_stream", never_opens)

    response = ask(client, conversation_id, "Where is the Eiffel Tower?")
    assert response.status_code == 200
    events = parse_sse(response.text)

    error_events = [data for event, data in events if event == "error"]
    done_events = [data for event, data in events if event == "done"]
    assert error_events
    assert error_events[0]["message"] == conversations_module.ASSISTANT_UNAVAILABLE_MESSAGE
    assert done_events == []

    assert persisted_messages(client, conversation_id) == []


def test_chat_stream_timeout_yields_error_and_persists_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A timeout surfaces through the same typed `GeminiProviderError` the
    persistent-failure path does (see `app.gemini_client._call_with_timeout`
    and `test_gemini.py::test_slow_call_times_out_as_typed_error`); this
    asserts the conversations endpoint treats it identically: one fixed
    error event, nothing persisted."""
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    conversation_id = create_conversation(client)

    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts]
    )

    def timed_out(messages, **kwargs):
        raise GeminiProviderError("Gemini call exceeded its 30.0s timeout")
        yield  # pragma: no cover

    monkeypatch.setattr(conversations_module, "chat_stream", timed_out)

    response = ask(client, conversation_id, "Where is the Eiffel Tower?")
    events = parse_sse(response.text)

    error_events = [data for event, data in events if event == "error"]
    assert error_events
    assert error_events[0]["message"] == conversations_module.ASSISTANT_UNAVAILABLE_MESSAGE
    assert "timeout" not in error_events[0]["message"].lower()
    assert persisted_messages(client, conversation_id) == []


def test_retrieval_embedding_failure_yields_error_and_persists_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    conversation_id = create_conversation(client)

    def failing_embed(texts, **kwargs):
        raise GeminiProviderError(_RAW_PROVIDER_ERROR_TEXT)

    monkeypatch.setattr(conversations_module, "embed", failing_embed)

    def chat_stream_not_expected(messages, **kwargs):
        raise AssertionError("the chat model must never be called when retrieval itself failed")
        yield  # pragma: no cover

    monkeypatch.setattr(conversations_module, "chat_stream", chat_stream_not_expected)

    response = ask(client, conversation_id, "Where is the Eiffel Tower?")
    events = parse_sse(response.text)

    error_events = [data for event, data in events if event == "error"]
    assert error_events
    assert error_events[0]["message"] == conversations_module.ASSISTANT_UNAVAILABLE_MESSAGE
    assert persisted_messages(client, conversation_id) == []


# ---------------------------------------------------------------------------
# The same question, resubmitted after a failed turn, succeeds and persists
# exactly one turn -- nothing about the failed attempt is retried against
# the provider or left behind to make the retry behave differently.
# ---------------------------------------------------------------------------


def test_same_question_resubmitted_after_a_failure_succeeds_and_persists_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    conversation_id = create_conversation(client)

    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts]
    )

    attempts = {"count": 0}

    def flaky_chat_stream(messages, **kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise GeminiProviderError(_RAW_PROVIDER_ERROR_TEXT)
            yield  # pragma: no cover
        yield "The Eiffel Tower is in Paris [[1]]."

    monkeypatch.setattr(conversations_module, "chat_stream", flaky_chat_stream)

    question = "Where is the Eiffel Tower?"

    first = ask(client, conversation_id, question)
    first_events = parse_sse(first.text)
    assert [data for event, data in first_events if event == "error"]
    assert persisted_messages(client, conversation_id) == []

    second = ask(client, conversation_id, question)
    second_events = parse_sse(second.text)
    done_events = [data for event, data in second_events if event == "done"]
    assert done_events
    assert done_events[0]["message"]["content"] == "The Eiffel Tower is in Paris [[1]]."

    messages = persisted_messages(client, conversation_id)
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["content"] == question
    assert attempts["count"] == 2


# ---------------------------------------------------------------------------
# No SSE payload or response body ever carries the provider's own text, a
# stack trace, or a key fragment -- whatever `GeminiProviderError` actually
# said stops at the router boundary.
# ---------------------------------------------------------------------------


def test_sse_error_event_never_carries_provider_text_stack_trace_or_key_fragment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    conversation_id = create_conversation(client)

    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts]
    )

    def leaking_chat_stream(messages, **kwargs):
        raise GeminiProviderError(_RAW_PROVIDER_ERROR_TEXT)
        yield  # pragma: no cover

    monkeypatch.setattr(conversations_module, "chat_stream", leaking_chat_stream)

    response = ask(client, conversation_id, "Where is the Eiffel Tower?")

    assert _PROVIDER_SECRET_FRAGMENT not in response.text
    assert _STACK_TRACE_FRAGMENT not in response.text
    assert "google.genai" not in response.text
    assert "ServerError" not in response.text


def test_failed_document_response_never_carries_provider_text_stack_trace_or_key_fragment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)

    def boom(key: str) -> bytes:
        raise ingestion_module.IngestionError(_RAW_PROVIDER_ERROR_TEXT)

    monkeypatch.setattr(ingestion_module, "_fetch_file", boom)

    asyncio.run(ingestion_module.process_document({}, document_id))

    listed = client.get("/documents")
    assert _PROVIDER_SECRET_FRAGMENT not in listed.text
    assert _STACK_TRACE_FRAGMENT not in listed.text
    assert "google.genai" not in listed.text

    document = next(doc for doc in listed.json() if doc["id"] == document_id)
    assert document["status"] == "failed"
    assert document["failure_reason"]
    assert _PROVIDER_SECRET_FRAGMENT not in document["failure_reason"]
    assert _STACK_TRACE_FRAGMENT not in document["failure_reason"]


# ---------------------------------------------------------------------------
# Embedding failure during ingestion: the real `app.gemini_client.embed`
# retry/backoff loop runs (nothing here stubs `embed()` itself away), is
# bounded by `GEMINI_MAX_RETRIES`, sleeps between attempts, and the document
# ends `failed` with a plain-language reason -- never the provider's own
# exception text.
# ---------------------------------------------------------------------------


class _FakeEmbedModels:
    def __init__(self) -> None:
        self.call_count = 0

    def embed_content(self, *, model, contents, config=None):
        self.call_count += 1
        raise RuntimeError(_RAW_PROVIDER_ERROR_TEXT)


class _FakeClient:
    def __init__(self, models: _FakeEmbedModels) -> None:
        self.models = models


def test_embedding_failure_retries_a_bounded_number_of_times_with_backoff_then_fails_document(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MAX_RETRIES", "3")

    sleep_calls: list[float] = []
    monkeypatch.setattr(gemini_client.time, "sleep", lambda seconds: sleep_calls.append(seconds))

    fake_models = _FakeEmbedModels()
    monkeypatch.setattr(gemini_client, "_get_client", lambda config: _FakeClient(fake_models))

    client = signed_up_client()
    document_id = upload_and_get_id(client)
    monkeypatch.setattr(
        ingestion_module,
        "_fetch_file",
        lambda key: b"hello world, this is some real content to chunk and embed.",
    )

    asyncio.run(ingestion_module.process_document({}, document_id))

    # Bounded: exactly GEMINI_MAX_RETRIES attempts, not retried forever.
    assert fake_models.call_count == 3
    # Backoff between attempts, not a busy retry loop: one sleep per retry
    # short of the last attempt, each longer than the one before it
    # (app.gemini_client's `0.5 * attempt` schedule).
    assert len(sleep_calls) == 2
    assert sleep_calls == sorted(sleep_calls)
    assert sleep_calls[0] < sleep_calls[1]

    session = SessionLocal()
    try:
        document = session.get(Document, uuid.UUID(document_id))
        assert document.status == "failed"
        assert document.failure_reason == ingestion_module._PROVIDER_UNAVAILABLE_MESSAGE
        assert _PROVIDER_SECRET_FRAGMENT not in document.failure_reason
        assert _STACK_TRACE_FRAGMENT not in document.failure_reason

        # No partially-embedded chunk ever persisted for a document whose
        # embedding call never actually succeeded.
        chunks = session.query(Chunk).filter(Chunk.document_id == document.id).all()
        assert chunks == []
    finally:
        session.close()

    listed = client.get("/documents")
    assert _PROVIDER_SECRET_FRAGMENT not in listed.text
    assert _STACK_TRACE_FRAGMENT not in listed.text


def test_db_never_persists_a_user_or_assistant_message_for_a_failed_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Belt-and-braces check directly against the `Message` table (not just
    the API's view of it) that a failed turn leaves no row at all -- not a
    partially-written one, not a soft-deleted one."""
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch)
    conversation_id = create_conversation(client)

    monkeypatch.setattr(
        conversations_module, "embed", lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts]
    )

    def never_opens(messages, **kwargs):
        raise GeminiProviderError(_RAW_PROVIDER_ERROR_TEXT)
        yield  # pragma: no cover

    monkeypatch.setattr(conversations_module, "chat_stream", never_opens)

    ask(client, conversation_id, "Where is the Eiffel Tower?")

    session = SessionLocal()
    try:
        rows = (
            session.query(Message)
            .filter(Message.conversation_id == uuid.UUID(conversation_id))
            .all()
        )
        assert rows == []
    finally:
        session.close()
