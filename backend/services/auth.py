"""Simple session-cookie authentication for the dashboard.

Enabled only when RIVERFLOW_AUTH_USER and RIVERFLOW_AUTH_PASSWORD are set
(e.g. as environment variables on Render). Disabled by default so local
development works unchanged.

Session tokens are HMAC-signed with RIVERFLOW_AUTH_SECRET (or a per-process
random secret when unset, which logs everyone out on restart).
"""
import hashlib
import hmac
import os
import secrets
import time

COOKIE_NAME = "rf_session"
EXPIRY_S = 30 * 24 * 3600


def _config() -> tuple[str, str, str]:
    return (
        os.environ.get("RIVERFLOW_AUTH_USER", ""),
        os.environ.get("RIVERFLOW_AUTH_PASSWORD", ""),
        os.environ.get("RIVERFLOW_AUTH_SECRET") or secrets.token_hex(32),
    )


_USER, _PASSWORD, _SECRET = _config()


def enabled() -> bool:
    return bool(_USER and _PASSWORD)


def _sign(payload: str) -> str:
    return hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def check_credentials(username: str, password: str) -> bool:
    if not enabled():
        return False
    return hmac.compare_digest(username.encode(), _USER.encode()) and hmac.compare_digest(
        password.encode(), _PASSWORD.encode()
    )


def issue_token() -> str:
    expiry = int(time.time()) + EXPIRY_S
    payload = f"{_USER}|{expiry}"
    return f"{payload}|{_sign(payload)}"


def verify_token(token: str) -> str | None:
    if not enabled():
        return _USER or None
    try:
        user, expiry, signature = token.split("|", 2)
    except ValueError:
        return None
    try:
        if int(expiry) < time.time():
            return None
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _sign(f"{user}|{expiry}")):
        return None
    if not hmac.compare_digest(user, _USER):
        return None
    return user


def current_user() -> str | None:
    return _USER if enabled() else None
