"""Request dependencies: resolve the signed-in user from the session cookie or `Authorization: Bearer <token>`."""
from __future__ import annotations

from datetime import timedelta

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.cookies import cookie_token, verify_csrf
from app.auth.errors import ApiError, not_authenticated
from app.auth.tokens import hash_token
from app.config import get_settings
from app.db import get_db
from app.models.db import AuthSession, User, aware, utcnow


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def resolve_session(db: Session, token: str) -> tuple[User, AuthSession]:
    sess = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if sess is None or aware(sess.expires_at) <= utcnow():
        raise not_authenticated("Your session has expired. Please sign in again.")
    user = db.get(User, sess.user_id)
    if user is None:
        raise not_authenticated()
    if utcnow() - aware(sess.last_used_at) > timedelta(minutes=5):  # avoid a write on every request
        sess.last_used_at = utcnow()
        db.commit()
    return user, sess


def raw_token(request: Request) -> str | None:
    """The session token presented by this request (bearer header first, then the session cookie)."""
    return _bearer(request) or cookie_token(request)


def authenticate(request: Request, db: Session) -> tuple[User, AuthSession, str] | None:
    """(user, session, token) for a valid session, None for an anonymous request.

    An invalid *bearer* token is an error so API clients learn it expired. An invalid or stale *cookie* is treated
    as anonymous: a browser may still hold a cookie for a session revoked elsewhere, and that must not break the
    public generator. Cookie-authenticated unsafe requests additionally pass the CSRF check."""
    bearer = _bearer(request)
    if bearer:
        user, sess = resolve_session(db, bearer)
        return user, sess, bearer
    cookie = cookie_token(request)
    if not cookie:
        return None
    try:
        user, sess = resolve_session(db, cookie)
    except ApiError:
        return None
    verify_csrf(request, cookie)
    return user, sess, cookie


def current_session(request: Request, db: Session = Depends(get_db)) -> tuple[User, AuthSession]:
    found = authenticate(request, db)
    if not found:
        raise not_authenticated()
    return found[0], found[1]


def current_user(pair: tuple[User, AuthSession] = Depends(current_session)) -> User:
    return pair[0]


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    found = authenticate(request, db)
    return found[0] if found else None


def ai_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Gate for analyze / generate / export: optional by default, mandatory when AUTH_REQUIRED_FOR_AI is on."""
    user = optional_user(request, db)
    if user is None and get_settings().auth_required_for_ai:
        raise not_authenticated("Sign in to use Synthora AI.")
    return user
