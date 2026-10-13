"""The single Gemini client module.

The approved architecture names exactly one model provider. Every embedding
or chat call in this codebase goes through `embed` and `chat` here -- this is
the only module that imports `google.generativeai`, so there is exactly one
place that enforces the required configuration, retries a flaky call behind
a hard timeout, and redacts what reaches the logs.
"""

from __future__ import annotations

import concurrent.futures
import logging
import os
import time
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import google.generativeai as genai

GEMINI_API_KEY_VAR = "GEMINI_API_KEY"

# Documented defaults: the current generally-available Gemini embedding and
# chat models, read fresh from the environment on every call so a change to
# the environment (or a test's monkeypatch) takes effect without reimporting
# this module.
DEFAULT_EMBEDDING_MODEL = "models/text-embedding-004"
DEFAULT_CHAT_MODEL = "models/gemini-1.5-flash"
DEFAULT_MAX_RETRIES = 3
DEFAULT_TIMEOUT_SECONDS = 30.0

# A single shared pool backs the hard per-call timeout below. Not a context
# manager: shutting it down would block waiting for a hung call to finish,
# which defeats the point of timing it out.
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix="gemini")


class GeminiConfigurationError(RuntimeError):
    """Raised when a required Gemini environment variable is missing.

    Raised at app import time (via `get_config` in `app.main`) so the app
    fails to start rather than serving requests it cannot fulfil.
    """


class GeminiProviderError(RuntimeError):
    """Raised when Gemini cannot be reached, times out, or keeps failing.

    Every call that reaches the provider is retried and time-limited; once
    those are exhausted this is what callers see instead of a hung request.
    """


@dataclass(frozen=True)
class GeminiConfig:
    """Gemini configuration for one call, resolved fresh from the environment."""

    api_key: str
    embedding_model: str
    chat_model: str
    timeout_seconds: float
    max_retries: int


def get_config() -> GeminiConfig:
    """Resolve configuration from the environment, or raise a clear error.

    Raising here -- rather than returning a half-configured object -- is what
    lets `app.main` fail fast at import time when `GEMINI_API_KEY` is unset.
    """
    api_key = os.getenv(GEMINI_API_KEY_VAR)
    if not api_key:
        raise GeminiConfigurationError(
            f"{GEMINI_API_KEY_VAR} is not set. Google Gemini is the only configured "
            "model provider, so the app cannot start without it. See "
            "backend/docs/gemini.md for the required credential and how to verify it."
        )
    return GeminiConfig(
        api_key=api_key,
        embedding_model=os.getenv("GEMINI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL),
        chat_model=os.getenv("GEMINI_CHAT_MODEL", DEFAULT_CHAT_MODEL),
        timeout_seconds=float(os.getenv("GEMINI_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)),
        max_retries=int(os.getenv("GEMINI_MAX_RETRIES", DEFAULT_MAX_RETRIES)),
    )


def gemini_status() -> dict[str, object]:
    """What `/health` reports: whether Gemini is configured, and with what."""
    if not os.getenv(GEMINI_API_KEY_VAR):
        return {"configured": False}
    config = get_config()
    return {
        "configured": True,
        "embedding_model": config.embedding_model,
        "chat_model": config.chat_model,
    }


# Fields a log record is allowed to carry for a Gemini call: model, token/size
# counts, latency and a correlation id. Call sites here only ever attach
# these; the filter below is the enforcement layer that does not trust that
# to stay true.
_ALLOWED_EXTRA_KEYS = {
    "model",
    "token_count",
    "input_size",
    "output_size",
    "latency_ms",
    "correlation_id",
    "attempt",
}

# Attribute names that must never reach a handler in plaintext.
_FORBIDDEN_KEYS = {
    "prompt",
    "payload",
    "request_body",
    "response_body",
    "response_text",
    "text",
    "content",
    "texts",
    "messages",
    "message_text",
    "response",
}


class RedactPayloadFilter(logging.Filter):
    """Strips request/response payload fields from every record it sees.

    Enforced at the logging layer rather than trusted to call sites: any
    attribute on the record matching a forbidden key is replaced with a
    redaction marker before the record reaches a handler.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(vars(record).keys()):
            if key in _FORBIDDEN_KEYS:
                record.__dict__[key] = "[REDACTED]"
        return True


def _build_logger() -> logging.Logger:
    log = logging.getLogger("app.gemini")
    if not any(isinstance(f, RedactPayloadFilter) for f in log.filters):
        log.addFilter(RedactPayloadFilter())
    return log


logger = _build_logger()


def _log_call(event: str, level: int, **fields: object) -> None:
    extra = {k: v for k, v in fields.items() if k in _ALLOWED_EXTRA_KEYS}
    logger.log(level, event, extra=extra)


_configured_key: str | None = None


def _ensure_configured(config: GeminiConfig) -> None:
    global _configured_key
    if _configured_key != config.api_key:
        genai.configure(api_key=config.api_key)
        _configured_key = config.api_key


def _call_with_timeout(fn, timeout: float, *args, **kwargs):
    """Run `fn(*args, **kwargs)` on a worker thread, bounded by `timeout`.

    A provider outage or a hung connection must surface as a typed error
    rather than block the caller forever; `future.result(timeout=...)` is
    what enforces that even when the underlying SDK call has no timeout of
    its own.
    """
    future = _executor.submit(fn, *args, **kwargs)
    try:
        return future.result(timeout=timeout)
    except concurrent.futures.TimeoutError as exc:
        raise TimeoutError(f"Gemini call exceeded its {timeout}s timeout") from exc


def embed(texts: Sequence[str], *, correlation_id: str | None = None) -> list[list[float]]:
    """Embed one or more texts with the configured Gemini embedding model."""
    config = get_config()
    _ensure_configured(config)
    correlation_id = correlation_id or str(uuid.uuid4())
    texts = list(texts)

    last_error: Exception | None = None
    for attempt in range(1, config.max_retries + 1):
        start = time.monotonic()
        try:
            response = _call_with_timeout(
                genai.embed_content,
                config.timeout_seconds,
                model=config.embedding_model,
                content=texts,
            )
            latency_ms = (time.monotonic() - start) * 1000
            embeddings = response["embedding"]
            if texts and embeddings and isinstance(embeddings[0], (int, float)):
                # The SDK returns a flat vector for a single text, and a list
                # of vectors for a batch; normalise to always return a batch.
                embeddings = [embeddings]
            _log_call(
                "gemini embed call",
                logging.INFO,
                model=config.embedding_model,
                correlation_id=correlation_id,
                attempt=attempt,
                input_size=len(texts),
                latency_ms=round(latency_ms, 2),
            )
            return list(embeddings)
        except Exception as exc:  # noqa: BLE001 -- normalised to GeminiProviderError below
            last_error = exc
            latency_ms = (time.monotonic() - start) * 1000
            _log_call(
                "gemini embed call failed",
                logging.WARNING,
                model=config.embedding_model,
                correlation_id=correlation_id,
                attempt=attempt,
                input_size=len(texts),
                latency_ms=round(latency_ms, 2),
            )
            if attempt < config.max_retries:
                time.sleep(0.5 * attempt)

    raise GeminiProviderError(
        f"Gemini embedding call failed after {config.max_retries} attempts: {last_error}"
    ) from last_error


def chat(
    messages: Sequence[Mapping[str, str]],
    *,
    correlation_id: str | None = None,
) -> str:
    """Generate a chat completion with the configured Gemini chat model.

    `messages` is a sequence of `{"role": ..., "content": ...}` mappings,
    oldest first, matching the shape `models.Message` already stores.
    """
    config = get_config()
    _ensure_configured(config)
    correlation_id = correlation_id or str(uuid.uuid4())
    contents = [{"role": m["role"], "parts": [m["content"]]} for m in messages]

    last_error: Exception | None = None
    for attempt in range(1, config.max_retries + 1):
        start = time.monotonic()
        try:
            model = genai.GenerativeModel(config.chat_model)
            response = _call_with_timeout(
                model.generate_content,
                config.timeout_seconds,
                contents,
            )
            latency_ms = (time.monotonic() - start) * 1000
            text = response.text or ""
            _log_call(
                "gemini chat call",
                logging.INFO,
                model=config.chat_model,
                correlation_id=correlation_id,
                attempt=attempt,
                input_size=len(messages),
                output_size=len(text),
                latency_ms=round(latency_ms, 2),
            )
            return text
        except Exception as exc:  # noqa: BLE001 -- normalised to GeminiProviderError below
            last_error = exc
            latency_ms = (time.monotonic() - start) * 1000
            _log_call(
                "gemini chat call failed",
                logging.WARNING,
                model=config.chat_model,
                correlation_id=correlation_id,
                attempt=attempt,
                input_size=len(messages),
                latency_ms=round(latency_ms, 2),
            )
            if attempt < config.max_retries:
                time.sleep(0.5 * attempt)

    raise GeminiProviderError(
        f"Gemini chat call failed after {config.max_retries} attempts: {last_error}"
    ) from last_error


__all__ = [
    "GEMINI_API_KEY_VAR",
    "DEFAULT_EMBEDDING_MODEL",
    "DEFAULT_CHAT_MODEL",
    "DEFAULT_MAX_RETRIES",
    "DEFAULT_TIMEOUT_SECONDS",
    "GeminiConfig",
    "GeminiConfigurationError",
    "GeminiProviderError",
    "RedactPayloadFilter",
    "get_config",
    "gemini_status",
    "embed",
    "chat",
    "logger",
]
