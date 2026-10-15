"""Settings routes: GET/PUT/DELETE /settings/gemini.

The Gemini API key is one app-wide value, entered on the Settings page by any
signed-in account and used for every account's uploads and chat. It is stored
in `app_settings` (see `app.models.AppSetting`) and read by
`app.gemini_client.resolve_api_key`, which falls back to `GEMINI_API_KEY` in
the environment when nothing has been saved here.

The key never leaves the server once saved: every response carries only its
last four characters, and nothing here logs it.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app.gemini_client import (
    GEMINI_API_KEY_SETTING,
    GeminiKeyRejectedError,
    GeminiProviderError,
    gemini_status,
    resolve_api_key,
    verify_api_key,
)
from app.models import AppSetting, User
from app.schemas import GeminiKeyRequest, GeminiSettingsResponse
from app.security import get_current_user

router = APIRouter(tags=["settings"])

logger = logging.getLogger("app.settings")

# Module-level singletons so route signatures satisfy B008 (no function call
# as an argument default) while still resolving per-request via FastAPI's
# dependency injection.
_DBDependency = Depends(get_db)
_CurrentUserDependency = Depends(get_current_user)

KEY_REJECTED_MESSAGE = "Gemini rejected this API key. Check that it is correct and try again."
KEY_UNVERIFIABLE_MESSAGE = (
    "Couldn't reach Gemini to check this API key, so it was not saved. "
    "Please try again in a moment."
)

_KEY_HINT_LENGTH = 4


def _settings_response(db: DBSession) -> GeminiSettingsResponse:
    api_key, source = resolve_api_key()
    status_ = gemini_status()
    stored = db.get(AppSetting, GEMINI_API_KEY_SETTING) if source == "app" else None
    return GeminiSettingsResponse(
        configured=api_key is not None,
        source=source,
        key_hint=api_key[-_KEY_HINT_LENGTH:] if api_key else None,
        updated_at=stored.updated_at if stored else None,
        updated_by=stored.updated_by.email if stored and stored.updated_by else None,
        chat_model=str(status_["chat_model"]),
        embedding_model=str(status_["embedding_model"]),
    )


@router.get("/settings/gemini", response_model=GeminiSettingsResponse)
async def get_gemini_settings(
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> GeminiSettingsResponse:
    return _settings_response(db)


@router.put("/settings/gemini", response_model=GeminiSettingsResponse)
async def save_gemini_key(
    payload: GeminiKeyRequest,
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> GeminiSettingsResponse:
    """Check the key with Gemini, then save it for the whole app.

    A key Gemini refuses is never saved, so a typo cannot silently break
    every account's uploads and chat.
    """
    try:
        # A network call bounded by the Gemini timeout -- off the event loop.
        await run_in_threadpool(verify_api_key, payload.api_key)
    except GeminiKeyRejectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=KEY_REJECTED_MESSAGE
        ) from exc
    except GeminiProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=KEY_UNVERIFIABLE_MESSAGE
        ) from exc

    setting = db.get(AppSetting, GEMINI_API_KEY_SETTING)
    if setting is None:
        setting = AppSetting(name=GEMINI_API_KEY_SETTING)
        db.add(setting)
    setting.value = payload.api_key
    setting.updated_by_user_id = user.id
    # Set explicitly: re-saving the same key by the same account changes no
    # column, so `onupdate` alone would leave the old timestamp in place.
    setting.updated_at = datetime.now(UTC)
    db.commit()
    logger.info("gemini api key saved in app settings by user %s", user.id)
    return _settings_response(db)


@router.delete("/settings/gemini", response_model=GeminiSettingsResponse)
async def remove_gemini_key(
    user: User = _CurrentUserDependency,
    db: DBSession = _DBDependency,
) -> GeminiSettingsResponse:
    """Remove the saved key. `GEMINI_API_KEY`, if set, takes over again."""
    setting = db.get(AppSetting, GEMINI_API_KEY_SETTING)
    if setting is not None:
        db.delete(setting)
        db.commit()
        logger.info("gemini api key removed from app settings by user %s", user.id)
    return _settings_response(db)
