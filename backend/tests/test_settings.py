"""The app-wide Gemini API key entered on the Settings page.

Covers GET/PUT/DELETE /settings/gemini, the precedence of a saved key over
the `GEMINI_API_KEY` environment fallback, and what chat and ingestion do
when neither is set. Gemini itself is never called: `verify_api_key` runs
against a fake client patched in at `app.gemini_client._get_client`.
"""

import asyncio
import io
import json
import uuid

import pytest
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors
from sqlalchemy import delete

import app.gemini_client as gemini_client
import app.ingestion as ingestion_module
import app.routers.conversations as conversations_module
import app.routers.documents as documents_module
from app.database import SessionLocal
from app.gemini_client import GEMINI_API_KEY_SETTING, get_config, resolve_api_key
from app.main import app
from app.models import AppSetting
from app.routers.conversations import NOT_CONFIGURED_MESSAGE
from app.routers.settings import KEY_REJECTED_MESSAGE, KEY_UNVERIFIABLE_MESSAGE

STRONG_PASSWORD = "Str0ngPass!"
ENV_KEY = "test-placeholder-key"
NEW_KEY = "AIzaSy-a-brand-new-key-9876"


def _clear_saved_key() -> None:
    with SessionLocal() as session:
        session.execute(delete(AppSetting).where(AppSetting.name == GEMINI_API_KEY_SETTING))
        session.commit()


@pytest.fixture(autouse=True)
def no_saved_key(monkeypatch: pytest.MonkeyPatch):
    """Every test starts from the environment fallback alone, and leaves no
    saved key behind for a later test module to pick up."""
    monkeypatch.setenv("GEMINI_API_KEY", ENV_KEY)
    _clear_saved_key()
    yield
    _clear_saved_key()


@pytest.fixture(autouse=True)
def stub_s3_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(documents_module, "_store_file", lambda key, data, content_type: None)


class _FakeModels:
    """Stands in for `genai.Client(...).models` -- only `get` is used."""

    def __init__(self, get=None) -> None:
        self._get = get
        self.get_calls: list[str] = []

    def get(self, *, model):
        self.get_calls.append(model)
        if self._get is not None:
            return self._get(model=model)
        return object()


class _FakeClient:
    def __init__(self, models: _FakeModels) -> None:
        self.models = models


def patch_gemini(monkeypatch: pytest.MonkeyPatch, models: _FakeModels) -> list[str]:
    """Route every client build to `models`; returns the api keys it was built with."""
    keys: list[str] = []

    def fake_get_client(config):
        keys.append(config.api_key)
        return _FakeClient(models)

    monkeypatch.setattr(gemini_client, "_get_client", fake_get_client)
    return keys


def signed_up_client() -> tuple[TestClient, str]:
    client = TestClient(app, base_url="https://testserver")
    email = f"user-{uuid.uuid4().hex}@example.com"
    response = client.post("/auth/signup", json={"email": email, "password": STRONG_PASSWORD})
    assert response.status_code == 201
    return client, email


def test_settings_routes_require_sign_in() -> None:
    client = TestClient(app, base_url="https://testserver")

    assert client.get("/settings/gemini").status_code == 401
    assert client.put("/settings/gemini", json={"api_key": NEW_KEY}).status_code == 401
    assert client.delete("/settings/gemini").status_code == 401


def test_get_reports_the_environment_fallback_without_exposing_the_key() -> None:
    client, _ = signed_up_client()

    response = client.get("/settings/gemini")

    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert body["source"] == "environment"
    assert body["key_hint"] == ENV_KEY[-4:]
    assert body["updated_at"] is None
    assert body["updated_by"] is None
    assert body["chat_model"] == gemini_client.DEFAULT_CHAT_MODEL
    assert ENV_KEY not in response.text


def test_get_reports_not_configured_when_no_key_is_set_anywhere(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    client, _ = signed_up_client()

    body = client.get("/settings/gemini").json()

    assert body["configured"] is False
    assert body["source"] is None
    assert body["key_hint"] is None


def test_put_verifies_the_key_then_saves_it_for_every_gemini_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    models = _FakeModels()
    built_with = patch_gemini(monkeypatch, models)
    client, email = signed_up_client()

    response = client.put("/settings/gemini", json={"api_key": f"  {NEW_KEY}  "})

    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert body["source"] == "app"
    assert body["key_hint"] == NEW_KEY[-4:]
    assert body["updated_by"] == email
    assert body["updated_at"] is not None
    assert NEW_KEY not in response.text

    # Verified with Gemini, whitespace stripped, before being saved...
    assert built_with == [NEW_KEY]
    assert models.get_calls == [gemini_client.DEFAULT_CHAT_MODEL]
    # ...and the saved key now wins over the environment fallback.
    assert get_config().api_key == NEW_KEY
    assert resolve_api_key() == (NEW_KEY, "app")


def test_saved_key_is_shared_across_accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_gemini(monkeypatch, _FakeModels())
    first, first_email = signed_up_client()
    second, _ = signed_up_client()

    assert first.put("/settings/gemini", json={"api_key": NEW_KEY}).status_code == 200

    body = second.get("/settings/gemini").json()
    assert body["source"] == "app"
    assert body["key_hint"] == NEW_KEY[-4:]
    assert body["updated_by"] == first_email


def test_a_key_gemini_rejects_is_not_saved(monkeypatch: pytest.MonkeyPatch) -> None:
    def rejects(**_kwargs):
        raise genai_errors.ClientError(
            400, {"error": {"code": 400, "message": "API key not valid.", "status": "INVALID"}}
        )

    patch_gemini(monkeypatch, _FakeModels(get=rejects))
    client, _ = signed_up_client()

    response = client.put("/settings/gemini", json={"api_key": NEW_KEY})

    assert response.status_code == 422
    assert response.json()["detail"] == KEY_REJECTED_MESSAGE
    assert resolve_api_key() == (ENV_KEY, "environment")


def test_a_key_that_cannot_be_checked_is_not_saved(monkeypatch: pytest.MonkeyPatch) -> None:
    def unreachable(**_kwargs):
        raise ConnectionError("provider unreachable")

    patch_gemini(monkeypatch, _FakeModels(get=unreachable))
    client, _ = signed_up_client()

    response = client.put("/settings/gemini", json={"api_key": NEW_KEY})

    assert response.status_code == 502
    assert response.json()["detail"] == KEY_UNVERIFIABLE_MESSAGE
    assert resolve_api_key() == (ENV_KEY, "environment")


def test_a_rate_limited_check_is_reported_as_unverifiable_not_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def rate_limited(**_kwargs):
        raise genai_errors.ClientError(429, {"error": {"code": 429, "message": "slow down"}})

    patch_gemini(monkeypatch, _FakeModels(get=rate_limited))
    client, _ = signed_up_client()

    response = client.put("/settings/gemini", json={"api_key": NEW_KEY})

    assert response.status_code == 502


def test_a_blank_key_is_rejected_without_calling_gemini(monkeypatch: pytest.MonkeyPatch) -> None:
    built_with = patch_gemini(monkeypatch, _FakeModels())
    client, _ = signed_up_client()

    response = client.put("/settings/gemini", json={"api_key": "   "})

    assert response.status_code == 422
    assert built_with == []


def test_delete_removes_the_saved_key_and_the_environment_takes_over(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patch_gemini(monkeypatch, _FakeModels())
    client, _ = signed_up_client()
    assert client.put("/settings/gemini", json={"api_key": NEW_KEY}).status_code == 200

    response = client.delete("/settings/gemini")

    assert response.status_code == 200
    assert response.json()["source"] == "environment"
    assert resolve_api_key() == (ENV_KEY, "environment")


def test_health_reports_a_saved_key_as_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_gemini(monkeypatch, _FakeModels())
    client, _ = signed_up_client()
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert client.get("/health").json()["services"]["gemini"] is False

    assert client.put("/settings/gemini", json={"api_key": NEW_KEY}).status_code == 200

    assert client.get("/health").json()["services"]["gemini"] is True


def _upload(client: TestClient) -> str:
    response = client.post(
        "/documents", files={"files": ("notes.txt", io.BytesIO(b"hello world"), "text/plain")}
    )
    assert response.status_code == 201
    return response.json()[0]["id"]


def test_ingestion_without_any_key_fails_with_a_settings_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(ingestion_module, "_fetch_file", lambda key: b"The sky is blue.")
    client, _ = signed_up_client()
    document_id = _upload(client)

    # The real `embed` runs, so this is the actual missing-key path.
    asyncio.run(ingestion_module.process_document({}, document_id))

    [document] = [d for d in client.get("/documents").json() if d["id"] == document_id]
    assert document["status"] == "failed"
    assert "Settings" in document["failure_reason"]


def test_asking_without_any_key_explains_how_to_fix_it_and_persists_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _ = signed_up_client()
    document_id = _upload(client)
    monkeypatch.setattr(ingestion_module, "_fetch_file", lambda key: b"The sky is blue.")
    monkeypatch.setattr(ingestion_module, "embed", lambda texts, **_: [[1.0] * 768 for _ in texts])
    asyncio.run(ingestion_module.process_document({}, document_id))

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    def must_not_be_called(*_args, **_kwargs):
        raise AssertionError("the model must not be called without a key")

    monkeypatch.setattr(conversations_module, "chat_stream", must_not_be_called)
    monkeypatch.setattr(conversations_module, "chat", must_not_be_called)
    conversation_id = client.post("/conversations").json()["id"]

    response = client.post(
        f"/conversations/{conversation_id}/messages", json={"question": "What colour is the sky?"}
    )

    events = [
        (block.split("\n")[0].removeprefix("event: "), block.split("\n")[1])
        for block in response.text.strip().split("\n\n")
    ]
    assert len(events) == 1
    event_type, data_line = events[0]
    assert event_type == "error"
    assert json.loads(data_line.removeprefix("data: "))["message"] == NOT_CONFIGURED_MESSAGE
    assert client.get(f"/conversations/{conversation_id}").json()["messages"] == []
