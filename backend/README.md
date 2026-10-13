# Backend

## Gemini configuration

Google Gemini is the only model provider this service speaks to, for both
embeddings and chat. The app refuses to start without it configured.

### Required credential

The service requires a **paid-tier** Google Gemini API key. Google's free
tier for the Gemini API includes submitted content, including prompts and
responses, in the data Google may use to improve its products; the paid
(billed) tier's terms exclude submitted content from being used to train
Google's models. Only a key provisioned on the paid tier may be used here.

**Operator verification step before deploying:** in the Google AI Studio /
Google Cloud console, confirm the project backing `GEMINI_API_KEY` has
billing enabled and is on the paid API tier, and that the "improve Google's
products" / training-on-your-content setting is confirmed off for that key,
per Google's current terms for paid API usage. Re-check this whenever the
key is rotated.

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | yes | -- | The paid-tier Gemini API key described above. Startup raises `GeminiConfigurationError` and the app does not serve requests without it. |
| `GEMINI_EMBEDDING_MODEL` | no | `models/text-embedding-004` | Gemini embedding model used by `app.gemini_client.embed`. |
| `GEMINI_CHAT_MODEL` | no | `models/gemini-1.5-flash` | Gemini chat model used by `app.gemini_client.chat`. |
| `GEMINI_TIMEOUT_SECONDS` | no | `30` | Per-call time budget; a call exceeding this raises `GeminiProviderError` instead of hanging. |
| `GEMINI_MAX_RETRIES` | no | `3` | Attempts made before a failing call raises `GeminiProviderError`. |

`GET /health` reports `gemini.configured` and, when configured, the two
model names currently in effect -- a quick way to confirm a deployment
picked up the intended configuration without reading logs.

### Logging

Gemini request and response payloads are never written to logs. Calls to
`app.gemini_client.embed` and `.chat` log only the model name, input/output
size counts, latency and a correlation id, and a `RedactPayloadFilter` on
the `app.gemini` logger strips any payload-shaped field as a second line of
defence. See `backend/tests/test_gemini.py` for the coverage.

### Single provider

`google-generativeai` is the only model-provider SDK this codebase imports
or lists in `requirements.txt`. Do not add a second provider without a new
ticket.
