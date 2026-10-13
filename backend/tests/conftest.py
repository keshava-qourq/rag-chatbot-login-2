"""Test-session configuration.

Google Gemini is the only configured model provider, and the app refuses to
start without `GEMINI_API_KEY` (see `app.gemini_client`). Every test in this
suite runs against a started app, so this sets a placeholder credential
before any test module -- in particular `app.main` -- is imported. Tests that
exercise the missing-key path do so explicitly, restoring this afterwards.
"""

import os

os.environ.setdefault("GEMINI_API_KEY", "test-placeholder-key")
