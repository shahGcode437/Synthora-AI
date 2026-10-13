"""Browser session cookie and CSRF protection.

The browser holds the session only in an HttpOnly cookie, so page scripts (and therefore XSS) cannot read or
copy the token. Because browsers attach cookies automatically, state-changing requests that authenticate by
cookie must also prove they came from our frontend:

1. `X-CSRF-Token` must equal csrf_token_for(session token). The value is derived from the session token, is
   delivered to the signed-in page in the JSON body of login/signup/google/session, and is kept in memory only.
   A third-party site can neither read it (cross-origin) nor compute it (it never sees the session token).
2. If the request carries an `Origin` header it must be one of the allowed frontend origins.

Requests that authenticate with `Authorization: Bearer` (API clients, tests) are not ambient and skip both.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime

from fastapi import Request, Response

from app.auth.errors import ApiError
from app.config import get_settings

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CSRF_HEADER = "x-csrf-token"


def csrf_token_for(session_token: str) -> str:
    return hashlib.sha256(b"synthora-csrf:" + session_token.encode()).hexdigest()


def _is_https(request: Request) -> bool:
    s = get_settings()
    if s.trust_proxy and request.headers.get("x-forwarded-proto", "").split(",")[0].strip() == "https":
        return True
    return request.url.scheme == "https"


def _secure(request: Request) -> bool:
    s = get_settings()
    if s.session_cookie_samesite == "none":
        return True  # browsers reject SameSite=None without Secure
    return s.session_cookie_secure if s.session_cookie_secure is not None else _is_https(request)


def set_session_cookie(response: Response, request: Request, token: str, expires_at: datetime) -> None:
    s = get_settings()
    max_age = max(0, int((expires_at - datetime.now(expires_at.tzinfo)).total_seconds()))
    response.set_cookie(
        s.session_cookie_name, token, max_age=max_age, httponly=True, secure=_secure(request),
        samesite=s.session_cookie_samesite, domain=s.session_cookie_domain or None, path="/",
    )


def clear_session_cookie(response: Response, request: Request) -> None:
    s = get_settings()
    response.delete_cookie(
        s.session_cookie_name, httponly=True, secure=_secure(request), samesite=s.session_cookie_samesite,
        domain=s.session_cookie_domain or None, path="/",
    )


def cookie_token(request: Request) -> str | None:
    return request.cookies.get(get_settings().session_cookie_name) or None


def verify_csrf(request: Request, session_token: str) -> None:
    """Raise 403 unless a cookie-authenticated, state-changing request proves it came from our frontend."""
    if request.method in SAFE_METHODS:
        return
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in get_settings().cors_origin_list:
        raise ApiError(403, "csrf_failed", "This request came from an origin that is not allowed.")
    sent = request.headers.get(CSRF_HEADER, "")
    if not sent or not hmac.compare_digest(sent, csrf_token_for(session_token)):
        raise ApiError(403, "csrf_failed", "The security token is missing or invalid. Reload the page and try again.")
