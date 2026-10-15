"""Coverage for the Gemini client module: configuration, redaction, retries."""

import importlib
import logging
import sys
from pathlib import Path

import pytest

from app import gemini_client
from app.gemini_client import (
    DEFAULT_CHAT_MODEL,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_MAX_RETRIES,
    DEFAULT_TIMEOUT_SECONDS,
    EMBEDDING_OUTPUT_DIMENSIONALITY,
    GeminiConfigurationError,
    GeminiProviderError,
    RedactPayloadFilter,
    chat,
    embed,
    gemini_status,
    get_config,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


class _FakeEmbedding:
    def __init__(self, values: list[float]) -> None:
        self.values = values


class _FakeEmbedResponse:
    def __init__(self, vectors: list[list[float]]) -> None:
        self.embeddings = [_FakeEmbedding(v) for v in vectors]


class _FakeChatResponse:
    def __init__(self, text: str) -> None:
        self.text = text


class _FakeModels:
    """Stands in for `genai.Client(...).models`."""

    def __init__(self, embed_content=None, generate_content=None) -> None:
        self._embed_content = embed_content
        self._generate_content = generate_content
        self.embed_calls: list[dict] = []
        self.generate_calls: list[dict] = []

    def embed_content(self, *, model, contents, config=None):
        self.embed_calls.append({"model": model, "contents": contents, "config": config})
        if self._embed_content is not None:
            return self._embed_content(model=model, contents=contents, config=config)
        return _FakeEmbedResponse([[0.1] * EMBEDDING_OUTPUT_DIMENSIONALITY])

    def generate_content(self, *, model, contents):
        self.generate_calls.append({"model": model, "contents": contents})
        if self._generate_content is not None:
            return self._generate_content(model=model, contents=contents)
        return _FakeChatResponse("a reply")


class _FakeClient:
    def __init__(self, models: _FakeModels) -> None:
        self.models = models


def _patch_client(monkeypatch: pytest.MonkeyPatch, models: _FakeModels) -> None:
    fake_client = _FakeClient(models)
    monkeypatch.setattr(gemini_client, "_get_client", lambda config: fake_client)


def test_missing_key_raises_named_configuration_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    with pytest.raises(GeminiConfigurationError, match="GEMINI_API_KEY"):
        get_config()


def test_defaults_are_documented(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    for var in (
        "GEMINI_EMBEDDING_MODEL",
        "GEMINI_CHAT_MODEL",
        "GEMINI_TIMEOUT_SECONDS",
        "GEMINI_MAX_RETRIES",
    ):
        monkeypatch.delenv(var, raising=False)

    config = get_config()

    assert config.embedding_model == DEFAULT_EMBEDDING_MODEL
    assert config.chat_model == DEFAULT_CHAT_MODEL
    assert config.timeout_seconds == DEFAULT_TIMEOUT_SECONDS
    assert config.max_retries == DEFAULT_MAX_RETRIES
    assert DEFAULT_EMBEDDING_MODEL == "gemini-embedding-001"
    assert DEFAULT_CHAT_MODEL == "gemini-2.5-flash"


def test_env_vars_override_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    monkeypatch.setenv("GEMINI_EMBEDDING_MODEL", "models/custom-embed")
    monkeypatch.setenv("GEMINI_CHAT_MODEL", "models/custom-chat")
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", "5")
    monkeypatch.setenv("GEMINI_MAX_RETRIES", "1")

    config = get_config()

    assert config.embedding_model == "models/custom-embed"
    assert config.chat_model == "models/custom-chat"
    assert config.timeout_seconds == 5.0
    assert config.max_retries == 1


def test_gemini_status_reflects_configuration_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    status = gemini_status()
    assert status["configured"] is False
    assert status["source"] is None

    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    status = gemini_status()
    assert status["configured"] is True
    assert status["source"] == "environment"
    assert status["embedding_model"] == DEFAULT_EMBEDDING_MODEL
    assert status["chat_model"] == DEFAULT_CHAT_MODEL
    assert "a-key" not in str(status)


def test_app_starts_without_gemini_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """The key is entered on the Settings page after sign-in, so the service
    has to come up -- and serve the sign-in and settings routes -- without
    one; /health reports Gemini as not configured until then."""
    from fastapi.testclient import TestClient

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    sys.modules.pop("app.main", None)

    try:
        main = importlib.import_module("app.main")
        response = TestClient(main.app).get("/health")
        assert response.status_code == 200
        assert response.json()["services"]["gemini"] is False
    finally:
        # Leave sys.modules sane for any test collected after this one.
        sys.modules.pop("app.main", None)
        monkeypatch.setenv("GEMINI_API_KEY", "test-placeholder-key")
        importlib.import_module("app.main")


def test_redact_payload_filter_strips_sensitive_fields() -> None:
    record = logging.LogRecord(
        name="app.gemini",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="gemini call ok",
        args=(),
        exc_info=None,
    )
    record.prompt = "the user's secret question"
    record.response_text = "the model's secret answer"

    assert RedactPayloadFilter().filter(record) is True
    assert record.prompt == "[REDACTED]"
    assert record.response_text == "[REDACTED]"


def test_logs_never_contain_request_or_response_text(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")

    secret_question = "what is the launch code"
    secret_answer = "the launch code is 42"

    _patch_client(
        monkeypatch,
        _FakeModels(generate_content=lambda **_kwargs: _FakeChatResponse(secret_answer)),
    )

    with caplog.at_level(logging.INFO, logger="app.gemini"):
        result = chat([{"role": "user", "content": secret_question}])

    assert result == secret_answer
    log_text = caplog.text
    assert secret_question not in log_text
    assert secret_answer not in log_text


def test_chat_log_contains_model_name_and_latency_but_not_question(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """AC-064: the user's question never reaches a log record, but the model
    name and a latency measurement do -- otherwise the log is useless for
    diagnosing a slow or misconfigured call."""
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    monkeypatch.setenv("GEMINI_CHAT_MODEL", "models/custom-chat-for-logs")

    secret_question = "what is my bank balance"

    _patch_client(
        monkeypatch,
        _FakeModels(
            generate_content=lambda **_kwargs: _FakeChatResponse(
                "a redacted-from-the-question answer"
            )
        ),
    )

    with caplog.at_level(logging.INFO, logger="app.gemini"):
        chat([{"role": "user", "content": secret_question}])

    records = [r for r in caplog.records if r.name == "app.gemini"]
    assert records, "expected at least one log record for the chat call"
    assert secret_question not in caplog.text

    record = records[0]
    assert getattr(record, "model", None) == "models/custom-chat-for-logs"
    assert getattr(record, "latency_ms", None) is not None


def test_embed_log_contains_model_name_and_latency_but_not_document_text(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """AC-064, the embed side: the document text never reaches a log record,
    but the model name and a latency measurement do."""
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    monkeypatch.setenv("GEMINI_EMBEDDING_MODEL", "models/custom-embed-for-logs")

    secret_document_text = "the confidential quarterly earnings are $42 million"

    _patch_client(monkeypatch, _FakeModels())

    with caplog.at_level(logging.INFO, logger="app.gemini"):
        embed([secret_document_text])

    records = [r for r in caplog.records if r.name == "app.gemini"]
    assert records, "expected at least one log record for the embed call"
    assert secret_document_text not in caplog.text

    record = records[0]
    assert getattr(record, "model", None) == "models/custom-embed-for-logs"
    assert getattr(record, "latency_ms", None) is not None


def test_embed_returns_vectors_for_batch_input(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    _patch_client(
        monkeypatch,
        _FakeModels(embed_content=lambda **_kwargs: _FakeEmbedResponse([[0.1, 0.2], [0.3, 0.4]])),
    )

    result = embed(["first", "second"])

    assert result == [[0.1, 0.2], [0.3, 0.4]]


def test_embed_returns_768_dimension_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    """Retry note: every embedding must come back at 768 dimensions so it
    matches every chunk embedding already stored, and the
    `output_dimensionality` request must actually be sent to the model."""
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    models = _FakeModels()
    _patch_client(monkeypatch, models)

    result = embed(["some document text"])

    assert len(result) == 1
    assert len(result[0]) == EMBEDDING_OUTPUT_DIMENSIONALITY

    assert models.embed_calls[0]["config"].output_dimensionality == EMBEDDING_OUTPUT_DIMENSIONALITY


def test_embed_calls_the_configured_embedding_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """AC-062: `embed()` passes the configured embedding model name to the
    stubbed client, not a hardcoded or default-only value."""
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    monkeypatch.setenv("GEMINI_EMBEDDING_MODEL", "models/a-specific-embed-model")

    models = _FakeModels()
    _patch_client(monkeypatch, models)

    embed(["some document text"])

    assert models.embed_calls[0]["model"] == "models/a-specific-embed-model"


def test_chat_calls_the_configured_chat_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """AC-062: `chat()` calls the Gemini client with the configured chat
    model name, not a hardcoded or default-only value."""
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    monkeypatch.setenv("GEMINI_CHAT_MODEL", "models/a-specific-chat-model")

    models = _FakeModels()
    _patch_client(monkeypatch, models)

    chat([{"role": "user", "content": "a question"}])

    assert models.generate_calls[0]["model"] == "models/a-specific-chat-model"


def test_no_other_model_provider_sdk_is_in_the_dependency_set() -> None:
    """AC-062: Google's Gemini SDK is the only model-provider SDK this
    codebase depends on. A second provider SDK slipping into
    requirements.txt, or being importable in this environment, would mean
    the "Gemini-only" contract is no longer actually enforced by what gets
    installed."""
    requirements_text = (REPO_ROOT / "backend" / "requirements.txt").read_text()

    forbidden_packages = (
        "openai",
        "anthropic",
        "cohere",
        "mistralai",
        "ai21",
        "together",
    )
    for package in forbidden_packages:
        assert package not in requirements_text.lower(), (
            f"found forbidden provider package '{package}' in requirements.txt"
        )

    for module_name in ("openai", "anthropic", "cohere"):
        with pytest.raises(ModuleNotFoundError):
            importlib.import_module(module_name)


def test_docs_state_the_paid_tier_no_training_credential_requirement_and_env_vars() -> None:
    """AC-063: the deployment docs must tell an operator the credential has
    to be a paid-tier key whose terms exclude training on submitted content,
    and must name the environment variables involved -- otherwise a
    deployment can silently use a free-tier key."""
    docs_text = "\n".join(
        (REPO_ROOT / relative_path).read_text()
        for relative_path in ("backend/README.md", "backend/docs/gemini.md")
    ).lower()

    assert "paid-tier" in docs_text or "paid tier" in docs_text
    assert "training" in docs_text

    for env_var in (
        "GEMINI_API_KEY",
        "GEMINI_EMBEDDING_MODEL",
        "GEMINI_CHAT_MODEL",
    ):
        assert env_var.lower() in docs_text, f"{env_var} is not documented"


def test_embed_retries_then_raises_typed_error_on_persistent_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    monkeypatch.setenv("GEMINI_MAX_RETRIES", "2")
    monkeypatch.setattr(gemini_client.time, "sleep", lambda _seconds: None)

    attempts = {"count": 0}

    def _always_fails(**_kwargs):
        attempts["count"] += 1
        raise ConnectionError("provider unreachable")

    _patch_client(monkeypatch, _FakeModels(embed_content=_always_fails))

    with pytest.raises(GeminiProviderError):
        embed(["hello"])

    assert attempts["count"] == 2


def test_slow_call_times_out_as_typed_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "a-key")
    monkeypatch.setenv("GEMINI_MAX_RETRIES", "1")
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", "0.05")

    def _hangs(**_kwargs):
        import time as _time

        _time.sleep(1)
        return _FakeEmbedResponse([[0.1, 0.2]])

    _patch_client(monkeypatch, _FakeModels(embed_content=_hangs))

    with pytest.raises(GeminiProviderError):
        embed(["hello"])
