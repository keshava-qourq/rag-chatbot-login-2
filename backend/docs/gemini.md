# Gemini: the only configured model provider

The approved architecture names Google Gemini as the sole model provider for
both embeddings and chat completions. `app/gemini_client.py` is the only
module that imports the `google-genai` SDK; no other provider SDK is added
to `requirements.txt`, and nothing else in this codebase should reach a
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

**Verification step for the operator:** after deploying, sign in, open the
Settings page and save the key (the app checks it with Gemini before saving),
then confirm `GET /health` reports `services.gemini` as `true`. This only
confirms a working credential is present -- the terms check in step 2 above
is a one-time step the operator performs when the key is created, since the
API does not expose a machine-checkable "training excluded" flag.

## Where the key comes from

The key is entered on the app's Settings page, by any signed-in account, and
shared by the whole app. `PUT /settings/gemini` checks it with one metadata
lookup of the chat model (no tokens billed) and saves it to `app_settings`
only if Gemini accepts it; `DELETE /settings/gemini` removes it. No response
ever carries more than its last four characters. The value is stored in the
database unencrypted, so database access and backups are access to the key.

`app.gemini_client.resolve_api_key` reads it fresh on every call -- the API
and the arq worker are separate processes, and a newly saved key must reach
both without a restart -- and falls back to `GEMINI_API_KEY` when no key has
been saved.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | no | none | Fallback for the paid-tier credential described above, used only while no key is saved on the Settings page. |
| `GEMINI_EMBEDDING_MODEL` | no | `gemini-embedding-001` | Model used by `gemini_client.embed`. Every call requests `output_dimensionality=768` so every stored chunk embedding has the same length regardless of the model's native size. |
| `GEMINI_CHAT_MODEL` | no | `gemini-2.5-flash` | Model used by `gemini_client.chat`. |
| `GEMINI_MAX_RETRIES` | no | `3` | Attempts before a provider outage surfaces as `GeminiProviderError` instead of hanging. |
| `GEMINI_TIMEOUT_SECONDS` | no | `30` | Per-attempt hard timeout enforced around every Gemini call. |

## Behaviour without a key

The app starts without a key, since the key is entered after sign-in. Until
one is set, `GET /health` reports `services.gemini` as `false`, a document
upload is marked failed with "No Gemini API key is set - add one on the
Settings page, then retry.", and a chat question is answered with an error
pointing at the Settings page -- the model is never called and nothing is
persisted. A Gemini call made with no key raises `GeminiConfigurationError`.

## Logging

Calls to Gemini log only `model`, `input_size`/`output_size`, `latency_ms`,
`correlation_id` and `attempt`. A `logging.Filter` (`RedactPayloadFilter`)
strips any payload-shaped field (prompt, response, content, etc.) from a
record before it reaches a handler, so a request or response body is never
written to the logs even in plaintext by accident.
