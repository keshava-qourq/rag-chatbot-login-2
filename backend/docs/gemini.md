# Gemini: the only configured model provider

The approved architecture names Google Gemini as the sole model provider for
both embeddings and chat completions. `app/gemini_client.py` is the only
module that imports the `google-generativeai` SDK; no other provider SDK is
added to `requirements.txt`, and nothing else in this codebase should reach a
model API directly.

## Required credential

The deployment must use a **paid-tier** Gemini API key. The free tier's terms
permit Google to use submitted prompts and responses to improve its models;
the paid tier's terms exclude submitted content from training. Using a free
key would mean every document chunk and user question handled by this app
could be used as training data, which this product cannot accept.

Before deploying:

1. Create the API key against a Google Cloud project with billing enabled
   (not an AI Studio free-tier key).
2. Confirm the active terms for that key explicitly exclude submitted
   content from use in model training/improvement (Google's published terms
   for paid API usage, as opposed to the free tier).

**Verification step for the operator:** after deploying, call `GET /health`
and confirm `services.gemini` is `true`. This only confirms the credential is
present and the process started -- the terms check in step 2 above is a
one-time step the operator performs when the key is created, since the API
does not expose a machine-checkable "training excluded" flag.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | yes | none -- the app refuses to start without it | The paid-tier credential described above. |
| `GEMINI_EMBEDDING_MODEL` | no | `models/text-embedding-004` | Model used by `gemini_client.embed`. |
| `GEMINI_CHAT_MODEL` | no | `models/gemini-1.5-flash` | Model used by `gemini_client.chat`. |
| `GEMINI_MAX_RETRIES` | no | `3` | Attempts before a provider outage surfaces as `GeminiProviderError` instead of hanging. |
| `GEMINI_TIMEOUT_SECONDS` | no | `30` | Per-attempt hard timeout enforced around every Gemini call. |

## Startup behaviour

`app.main` calls `gemini_client.get_config()` at import time. A deployment
missing `GEMINI_API_KEY` raises `GeminiConfigurationError` naming the missing
variable before a single route is registered -- the process does not start,
let alone serve a request. `GET /health` additionally reports
`services.gemini` so the operator can confirm the running process sees the
credential.

## Logging

Calls to Gemini log only `model`, `input_size`/`output_size`, `latency_ms`,
`correlation_id` and `attempt`. A `logging.Filter` (`RedactPayloadFilter`)
strips any payload-shaped field (prompt, response, content, etc.) from a
record before it reaches a handler, so a request or response body is never
written to the logs even in plaintext by accident.
