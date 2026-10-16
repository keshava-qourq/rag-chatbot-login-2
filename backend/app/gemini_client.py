"""The single Gemini client module.

The approved architecture names exactly one model provider. Every embedding
or chat call in this codebase goes through `embed`, `chat` and `chat_stream`
here -- this is the only module that imports the `google-genai` SDK, so
there is exactly one place that enforces the required configuration, retries
a flaky call behind a hard timeout, and redacts what reaches the logs.

The API key is entered on the app's Settings page and stored in
`app_settings` (see `app.routers.settings`); `GEMINI_API_KEY` in the
environment is only a fallback for when no key has been saved there.
"""

from __future__ import annotations

import concurrent.futures
import logging
import os
import time
import uuid
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.models import AppSetting

GEMINI_API_KEY_VAR = "GEMINI_API_KEY"

# The `app_settings.name` the Settings page stores the key under.
GEMINI_API_KEY_SETTING = "gemini_api_key"

# Documented defaults: the current generally-available Gemini embedding and
# chat models, read fresh from the environment on every call so a change to
# the environment (or a test's monkeypatch) takes effect without reimporting
# this module.
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"
DEFAULT_CHAT_MODEL = "gemini-2.5-flash"
DEFAULT_MAX_RETRIES = 3
DEFAULT_TIMEOUT_SECONDS = 30.0

# Chat compares a question's embedding with each stored chunk's (see
# app.routers.conversations), so every embedding this module returns is
# requested at exactly this dimensionality regardless of the embedding
# model's native output size.
EMBEDDING_OUTPUT_DIMENSIONALITY = 768

# A single shared pool backs the hard per-call timeout below. Not a context
# manager: shutting it down would block waiting for a hung call to finish,
# which defeats the point of timing it out.
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix="gemini")


class GeminiConfigurationError(RuntimeError):
    """Raised when a Gemini call is attempted with no API key configured.

    The app starts without a key (it is entered on the Settings page), so
    callers check `is_configured()` before reaching for the
    model and show a "set a key" message instead of hitting this.
    """


class GeminiKeyRejectedError(RuntimeError):
    """Raised by `verify_api_key` when Gemini refuses a candidate key."""


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


def _stored_api_key() -> str | None:
    """The key saved on the Settings page, or None when there is none.

    Read fresh on every call, not cached: the API and the arq worker are
    separate processes, and a key saved through one must take effect in the
    other without a restart. A primary-key lookup is negligible next to the
    Gemini call it precedes.
    """
    try:
        with SessionLocal() as session:
            setting = session.get(AppSetting, GEMINI_API_KEY_SETTING)
            return setting.value if setting is not None else None
    except SQLAlchemyError:
        # e.g. the table does not exist yet in a process that never ran
        # `create_all`. Treated as "nothing saved" so the environment
        # fallback still applies.
        logger.warning("could not read the stored Gemini API key")
        return None


def resolve_api_key() -> tuple[str | None, str | None]:
    """`(key, source)`: the Settings-page key first, then `GEMINI_API_KEY`.

    `source` is `"app"`, `"environment"`, or None when neither is set.
    """
    stored = _stored_api_key()
    if stored:
        return stored, "app"
    env_key = os.getenv(GEMINI_API_KEY_VAR)
    if env_key:
        return env_key, "environment"
    return None, None


def _config_for(api_key: str) -> GeminiConfig:
    return GeminiConfig(
        api_key=api_key,
        embedding_model=os.getenv("GEMINI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL),
        chat_model=os.getenv("GEMINI_CHAT_MODEL", DEFAULT_CHAT_MODEL),
        timeout_seconds=float(os.getenv("GEMINI_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)),
        max_retries=int(os.getenv("GEMINI_MAX_RETRIES", DEFAULT_MAX_RETRIES)),
    )


def get_config() -> GeminiConfig:
    """Resolve the configuration for one call, or raise a clear error.

    Raising here -- rather than returning a half-configured object -- means
    no call ever reaches the SDK without a key.
    """
    api_key, _source = resolve_api_key()
    if not api_key:
        raise GeminiConfigurationError(
            "No Gemini API key is configured. Add one on the Settings page "
            f"(or set {GEMINI_API_KEY_VAR} as a fallback). See backend/docs/gemini.md."
        )
    return _config_for(api_key)


def is_configured() -> bool:
    """Whether any Gemini API key is available for the next call."""
    api_key, _source = resolve_api_key()
    return bool(api_key)


def gemini_status() -> dict[str, object]:
    """Whether Gemini is configured, where the key comes from, and the models.

    Never includes the key itself.
    """
    api_key, source = resolve_api_key()
    config = _config_for(api_key or "")
    return {
        "configured": bool(api_key),
        "source": source,
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


_client: genai.Client | None = None
_client_key: str | None = None


def _get_client(config: GeminiConfig) -> genai.Client:
    """The shared `genai.Client`, rebuilt only when the api key changes.

    A thin seam tests patch directly, so test doubles never have to impersonate
    the real `google-genai` SDK's constructor or transport.
    """
    global _client, _client_key
    if _client is None or _client_key != config.api_key:
        _client = genai.Client(api_key=config.api_key)
        _client_key = config.api_key
    return _client


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


# HTTP statuses that mean Gemini looked at the key and said no. Anything else
# (a 404 for a misnamed model, a 429, a 5xx, a network error) says nothing
# about the key, so it is reported as "could not verify" instead.
_KEY_REJECTED_STATUSES = {400, 401, 403}


def verify_api_key(api_key: str) -> None:
    """Confirm Gemini accepts `api_key` before the Settings page saves it.

    One metadata lookup of the configured chat model -- no tokens are
    generated or billed. Raises `GeminiKeyRejectedError` when Gemini refuses
    the key, and `GeminiProviderError` when it cannot be reached at all.
    """
    config = _config_for(api_key)
    client = _get_client(config)
    try:
        _call_with_timeout(client.models.get, config.timeout_seconds, model=config.chat_model)
    except genai_errors.ClientError as exc:
        if exc.code in _KEY_REJECTED_STATUSES:
            raise GeminiKeyRejectedError(f"Gemini rejected the API key ({exc.code})") from exc
        raise GeminiProviderError(f"could not verify the API key ({exc.code})") from exc
    except Exception as exc:  # noqa: BLE001 -- normalised to GeminiProviderError
        raise GeminiProviderError("could not reach Gemini to verify the API key") from exc


def embed(texts: Sequence[str], *, correlation_id: str | None = None) -> list[list[float]]:
    """Embed one or more texts with the configured Gemini embedding model.

    Every embedding is requested at `EMBEDDING_OUTPUT_DIMENSIONALITY` (768)
    so every vector is comparable with the ones already stored in `chunks`.
    """
    config = get_config()
    client = _get_client(config)
    correlation_id = correlation_id or str(uuid.uuid4())
    texts = list(texts)

    last_error: Exception | None = None
    for attempt in range(1, config.max_retries + 1):
        start = time.monotonic()
        try:
            response = _call_with_timeout(
                client.models.embed_content,
                config.timeout_seconds,
                model=config.embedding_model,
                contents=texts,
                config=types.EmbedContentConfig(
                    output_dimensionality=EMBEDDING_OUTPUT_DIMENSIONALITY
                ),
            )
            latency_ms = (time.monotonic() - start) * 1000
            embeddings = [list(embedding.values) for embedding in response.embeddings]
            _log_call(
                "gemini embed call",
                logging.INFO,
                model=config.embedding_model,
                correlation_id=correlation_id,
                attempt=attempt,
                input_size=len(texts),
                latency_ms=round(latency_ms, 2),
            )
            return embeddings
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
    client = _get_client(config)
    correlation_id = correlation_id or str(uuid.uuid4())
    contents = [
        types.Content(role=m["role"], parts=[types.Part(text=m["content"])]) for m in messages
    ]

    last_error: Exception | None = None
    for attempt in range(1, config.max_retries + 1):
        start = time.monotonic()
        try:
            response = _call_with_timeout(
                client.models.generate_content,
                config.timeout_seconds,
                model=config.chat_model,
                contents=contents,
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


def chat_stream(
    messages: Sequence[Mapping[str, str]],
    *,
    correlation_id: str | None = None,
) -> Iterator[str]:
    """Generate a chat completion as a stream of text deltas.

    Only opening the stream is retried behind the same timeout/retry
    contract as `chat`; once the first token has been handed to the caller a
    failure is raised as `GeminiProviderError` rather than retried --
    retrying mid-stream would duplicate tokens the caller (the conversations
    endpoint) has already forwarded downstream.
    """
    config = get_config()
    client = _get_client(config)
    correlation_id = correlation_id or str(uuid.uuid4())
    contents = [
        types.Content(role=m["role"], parts=[types.Part(text=m["content"])]) for m in messages
    ]

    last_error: Exception | None = None
    stream = None
    for attempt in range(1, config.max_retries + 1):
        try:
            stream = _call_with_timeout(
                client.models.generate_content_stream,
                config.timeout_seconds,
                model=config.chat_model,
                contents=contents,
            )
            break
        except Exception as exc:  # noqa: BLE001 -- normalised below
            last_error = exc
            _log_call(
                "gemini chat stream open failed",
                logging.WARNING,
                model=config.chat_model,
                correlation_id=correlation_id,
                attempt=attempt,
                input_size=len(messages),
            )
            if attempt < config.max_retries:
                time.sleep(0.5 * attempt)

    if stream is None:
        raise GeminiProviderError(
            f"Gemini chat stream call failed after {config.max_retries} attempts: {last_error}"
        ) from last_error

    output_size = 0
    start = time.monotonic()
    try:
        for chunk in stream:
            text = getattr(chunk, "text", None) or ""
            if not text:
                continue
            output_size += len(text)
            yield text
    except Exception as exc:  # noqa: BLE001 -- normalised to GeminiProviderError
        raise GeminiProviderError(f"Gemini chat stream failed mid-stream: {exc}") from exc
    finally:
        latency_ms = (time.monotonic() - start) * 1000
        _log_call(
            "gemini chat stream call",
            logging.INFO,
            model=config.chat_model,
            correlation_id=correlation_id,
            attempt=1,
            input_size=len(messages),
            output_size=output_size,
            latency_ms=round(latency_ms, 2),
        )


__all__ = [
    "GEMINI_API_KEY_VAR",
    "GEMINI_API_KEY_SETTING",
    "DEFAULT_EMBEDDING_MODEL",
    "DEFAULT_CHAT_MODEL",
    "DEFAULT_MAX_RETRIES",
    "DEFAULT_TIMEOUT_SECONDS",
    "EMBEDDING_OUTPUT_DIMENSIONALITY",
    "GeminiConfig",
    "GeminiConfigurationError",
    "GeminiKeyRejectedError",
    "GeminiProviderError",
    "RedactPayloadFilter",
    "get_config",
    "gemini_status",
    "is_configured",
    "resolve_api_key",
    "verify_api_key",
    "embed",
    "chat",
    "chat_stream",
    "logger",
]
