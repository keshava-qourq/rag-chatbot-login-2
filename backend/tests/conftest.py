"""Test-session configuration.

A placeholder `GEMINI_API_KEY` is set so every Gemini call path is configured
via the environment fallback (see `app.gemini_client.resolve_api_key`); tests
that exercise the missing-key path remove it explicitly. Nothing here talks to
Gemini for real -- tests stub `embed`/`chat`/`chat_stream` or the client seam.

The suite runs against a throwaway SQLite file unless `DATABASE_URL` is
already set, rather than the `./app.db` a local dev server uses -- otherwise
a test run would write its users into the dev database and could overwrite
the Gemini API key saved on the Settings page. Both are set before any test
module (in particular `app.database`) is imported.
"""

import os
import tempfile

os.environ.setdefault("GEMINI_API_KEY", "test-placeholder-key")
os.environ.setdefault(
    "DATABASE_URL", f"sqlite:///{os.path.join(tempfile.mkdtemp(prefix='app-tests-'), 'app.db')}"
)
