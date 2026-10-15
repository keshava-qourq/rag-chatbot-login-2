"""Behavioural tests for conversation-context follow-ups (US-013-1/US-013-2).

Covers AC-040 (a follow-up with a pronoun or implicit reference is resolved
against the same conversation's recent history before retrieval, and the
*text actually embedded for retrieval* carries the intended subject),
AC-041 (the answer to a resolved follow-up is grounded only in retrieved
chunks and carries citations, and the refusal path still applies when
nothing scores above the similarity threshold) and AC-042 (a first question
in a brand-new conversation never uses any other conversation's messages,
including another conversation owned by the same user).

`app.gemini_client.embed`/`chat`/`chat_stream` are never called for real:
every test here stubs the module-level seams in `app.routers.conversations`
(and, for getting a document to `ready`, in `app.ingestion`) so nothing in
this module makes a network call. Assertions are made on the text actually
passed to the retrieval embed call and on the SSE events the endpoint
streams back -- never on any particular wording a stubbed model "said".
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

# Two embedding vectors, deliberately orthogonal, standing in for "matches
# the document" and "matches nothing in the document" without needing a
# real embedding model.
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


def fake_chat_stream_factory(answer: str, calls: list[list[dict]]):
    def fake_chat_stream(messages, **kwargs):
        calls.append(list(messages))
        yield answer

    return fake_chat_stream


# ---------------------------------------------------------------------------
# AC-040: a follow-up is resolved against this conversation's history before
# retrieval, and the text embedded for retrieval carries the resolved
# subject rather than the literal pronoun.
# ---------------------------------------------------------------------------


def test_followup_question_is_resolved_before_retrieval_embed_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch, MATCHING_VECTOR)
    conversation_id = create_conversation(client)

    embed_calls: list[str] = []

    def fake_embed(texts, *, correlation_id=None):
        embed_calls.append(texts[0])
        return [MATCHING_VECTOR for _ in texts]

    monkeypatch.setattr(conversations_module, "embed", fake_embed)
    first_turn_chat_stream_calls: list[list[dict]] = []
    monkeypatch.setattr(
        conversations_module,
        "chat_stream",
        fake_chat_stream_factory(
            "The Eiffel Tower is in Paris. [[1]]", first_turn_chat_stream_calls
        ),
    )

    # First question: no history yet, so history-resolution must not even
    # be invoked -- fail loudly if it is.
    history_resolution_calls: list[list[dict]] = []

    def chat_not_expected(messages, **kwargs):
        history_resolution_calls.append(list(messages))
        raise AssertionError("history resolution must not run when there is no history yet")

    monkeypatch.setattr(conversations_module, "chat", chat_not_expected)

    ask(client, conversation_id, "Tell me about the Eiffel Tower.")

    assert history_resolution_calls == []
    assert embed_calls == ["Tell me about the Eiffel Tower."]

    # Second (follow-up) question: history now exists, so resolution runs
    # and retrieval must embed the *resolved* standalone question, not the
    # literal pronoun.
    def fake_chat_resolution(messages, **kwargs):
        return "How tall is the Eiffel Tower?"

    monkeypatch.setattr(conversations_module, "chat", fake_chat_resolution)
    second_turn_chat_stream_calls: list[list[dict]] = []
    monkeypatch.setattr(
        conversations_module,
        "chat_stream",
        fake_chat_stream_factory("It is 330 metres tall. [[1]]", second_turn_chat_stream_calls),
    )

    ask(client, conversation_id, "How tall is it?")

    assert len(embed_calls) == 2
    resolved_text_sent_to_retrieval = embed_calls[1]
    assert "Eiffel Tower" in resolved_text_sent_to_retrieval
    assert resolved_text_sent_to_retrieval != "How tall is it?"


# ---------------------------------------------------------------------------
# AC-041: the answer to a resolved follow-up is grounded only in retrieved
# chunks and carries citations; the refusal path still applies when nothing
# scores above the threshold.
# ---------------------------------------------------------------------------


def test_grounded_answer_to_resolved_followup_carries_citations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch, MATCHING_VECTOR)
    conversation_id = create_conversation(client)

    monkeypatch.setattr(
        conversations_module,
        "embed",
        lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts],
    )
    monkeypatch.setattr(
        conversations_module,
        "chat_stream",
        fake_chat_stream_factory("The Eiffel Tower is in Paris. [[1]]", []),
    )
    monkeypatch.setattr(conversations_module, "chat", lambda messages, **kwargs: "unused")

    ask(client, conversation_id, "Tell me about the Eiffel Tower.")

    monkeypatch.setattr(
        conversations_module,
        "chat",
        lambda messages, **kwargs: "How tall is the Eiffel Tower?",
    )
    monkeypatch.setattr(
        conversations_module,
        "chat_stream",
        fake_chat_stream_factory("It is 330 metres tall. [[1]]", []),
    )

    raw_text = ask(client, conversation_id, "How tall is it?")
    events = parse_sse(raw_text)

    citations_events = [data for event, data in events if event == "citations"]
    done_events = [data for event, data in events if event == "done"]
    assert citations_events, "expected a citations event"
    assert citations_events[0]["citations"], "expected at least one citation"
    citation = citations_events[0]["citations"][0]
    assert citation["document"] == "notes.txt"

    assert done_events
    message = done_events[0]["message"]
    assert message["citations"], "the persisted assistant message must carry the citation"
    assert "330 metres" in message["content"]


def test_refusal_still_applies_for_resolved_followup_with_no_chunk_above_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch, MATCHING_VECTOR)
    conversation_id = create_conversation(client)

    monkeypatch.setattr(
        conversations_module,
        "embed",
        lambda texts, **kwargs: [MATCHING_VECTOR for _ in texts],
    )
    first_turn_chat_stream_calls: list[list[dict]] = []
    monkeypatch.setattr(
        conversations_module,
        "chat_stream",
        fake_chat_stream_factory(
            "The Eiffel Tower is in Paris. [[1]]", first_turn_chat_stream_calls
        ),
    )
    monkeypatch.setattr(conversations_module, "chat", lambda messages, **kwargs: "unused")

    ask(client, conversation_id, "Tell me about the Eiffel Tower.")

    # The follow-up resolves fine, but retrieval for the resolved question
    # scores nothing above the threshold -- the model must never be called.
    monkeypatch.setattr(
        conversations_module,
        "chat",
        lambda messages, **kwargs: "What is the capital of a country with no documents?",
    )
    monkeypatch.setattr(
        conversations_module,
        "embed",
        lambda texts, **kwargs: [ORTHOGONAL_VECTOR for _ in texts],
    )
    second_turn_chat_stream_calls: list[list[dict]] = []
    monkeypatch.setattr(
        conversations_module,
        "chat_stream",
        fake_chat_stream_factory("this must never be sent", second_turn_chat_stream_calls),
    )

    raw_text = ask(client, conversation_id, "What about that other place?")
    events = parse_sse(raw_text)

    done_events = [data for event, data in events if event == "done"]
    citations_events = [data for event, data in events if event == "citations"]
    assert second_turn_chat_stream_calls == [], "the chat model must not be called on refusal"
    assert done_events
    assert done_events[0]["message"]["content"] == conversations_module.REFUSAL_MESSAGE
    assert citations_events
    assert citations_events[0]["citations"] == []


# ---------------------------------------------------------------------------
# AC-042: a first question in a brand-new conversation triggers no use of
# any other conversation's messages, including another conversation owned
# by the same user.
# ---------------------------------------------------------------------------


def test_first_question_in_new_conversation_ignores_other_conversations_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = signed_up_client()
    document_id = upload_and_get_id(client)
    process_to_ready(document_id, monkeypatch, MATCHING_VECTOR)

    embed_calls: list[str] = []

    def fake_embed(texts, *, correlation_id=None):
        embed_calls.append(texts[0])
        return [MATCHING_VECTOR for _ in texts]

    monkeypatch.setattr(conversations_module, "embed", fake_embed)
    monkeypatch.setattr(
        conversations_module,
        "chat_stream",
        fake_chat_stream_factory("The Eiffel Tower is in Paris. [[1]]", []),
    )
    monkeypatch.setattr(conversations_module, "chat", lambda messages, **kwargs: "unused")

    # Conversation A: real history, including a pronoun-bearing turn.
    conversation_a = create_conversation(client)
    ask(client, conversation_a, "Tell me about the Eiffel Tower.")
    ask(client, conversation_a, "How tall is it?")

    # Conversation B: brand new, same user. Its first question must not
    # trigger history resolution at all (there is no history for *this*
    # conversation), regardless of how much history the user has elsewhere.
    history_resolution_calls: list[list[dict]] = []

    def chat_not_expected(messages, **kwargs):
        history_resolution_calls.append(list(messages))
        raise AssertionError(
            "history resolution must not run for a brand-new conversation's first question"
        )

    monkeypatch.setattr(conversations_module, "chat", chat_not_expected)

    raw_question = "What about it?"
    conversation_b = create_conversation(client)
    ask(client, conversation_b, raw_question)

    assert history_resolution_calls == []
    assert embed_calls[-1] == raw_question
