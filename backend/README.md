# Backend

## Gemini configuration

Google Gemini is the only model provider this service speaks to, for both
embeddings and chat.

### Setting the API key

The key is entered **in the app**, on the Settings page (any signed-in
account can set it; one key is shared by the whole app). The app checks the
key with Gemini before saving it, stores it in the `app_settings` table, and
only ever shows its last four characters afterwards. Until a key is set the
app still starts and serves sign-in, but uploads fail with "No Gemini API key
is set" and chat replies with an instruction to add one.

`GEMINI_API_KEY` in the environment is an optional fallback, used only while
no key has been saved on the Settings page. The key is stored in the database
unencrypted, so treat database access and backups as access to the key.

### Required credential

The service requires a **paid-tier** Google Gemini API key. Google's free
tier for the Gemini API includes submitted content, including prompts and
responses, in the data Google may use to improve its products; the paid
(billed) tier's terms exclude submitted content from being used to train
Google's models. Only a key provisioned on the paid tier may be used here.

**Operator verification step before deploying:** in the Google AI Studio /
Google Cloud console, confirm the project backing the key has
billing enabled and is on the paid API tier, and that the "improve Google's
products" / training-on-your-content setting is confirmed off for that key,
per Google's current terms for paid API usage. Re-check this whenever the
key is rotated.

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | no | -- | Fallback for the paid-tier key described above, used only when no key has been saved on the Settings page. |
| `GEMINI_EMBEDDING_MODEL` | no | `gemini-embedding-001` | Gemini embedding model used by `app.gemini_client.embed`. Every call requests `output_dimensionality=768` to match the `chunks.embedding vector(768)` column. |
| `GEMINI_CHAT_MODEL` | no | `gemini-2.5-flash` | Gemini chat model used by `app.gemini_client.chat`. |
| `GEMINI_TIMEOUT_SECONDS` | no | `30` | Per-call time budget; a call exceeding this raises `GeminiProviderError` instead of hanging. |
| `GEMINI_MAX_RETRIES` | no | `3` | Attempts made before a failing call raises `GeminiProviderError`. |

`GET /health` reports `services.gemini`: whether a key is available from
either source. Signed in, `GET /settings/gemini` also says which source is in
effect and the two model names in use, without revealing the key.

### Logging

Gemini request and response payloads are never written to logs. Calls to
`app.gemini_client.embed` and `.chat` log only the model name, input/output
size counts, latency and a correlation id, and a `RedactPayloadFilter` on
the `app.gemini` logger strips any payload-shaped field as a second line of
defence. See `backend/tests/test_gemini.py` for the coverage.

### Single provider

`google-genai` is the only model-provider SDK this codebase imports or
lists in `requirements.txt`. Do not add a second provider without a new
ticket.
