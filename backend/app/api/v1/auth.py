"""Accounts: sign up, sign in (password or Google), sessions, profile, password, account deletion."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.cookies import clear_session_cookie, csrf_token_for, set_session_cookie
from app.auth.deps import current_session, current_user, raw_token
from app.auth.errors import ApiError
from app.auth.google import verify_google_credential
from app.auth.passwords import hash_password, needs_rehash, password_problems, verify_password
from app.auth.ratelimit import enforce
from app.auth.tokens import new_token
from app.config import get_settings
from app.db import get_db
from app.models.accounts import (
    AuthResponse, ChangePasswordRequest, DeleteAccountRequest, GoogleLoginRequest, LoginRequest, ProfilePatch,
    SessionOut, SignupRequest, UserOut,
)
from app.models.db import AuthSession, GenerationRun, SavedDataset, SavedSchema, User, aware, utcnow

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

def _invalid() -> ApiError:
    return ApiError(401, "invalid_credentials", "Invalid email or password.")


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, email=u.email, name=u.name, avatar_url=u.avatar_url, has_password=bool(u.password_hash),
        has_google=bool(u.google_sub), email_verified=u.email_verified, created_at=u.created_at,
        last_login_at=u.last_login_at, preferences=u.preferences or {},
    )


def _issue_session(db: Session, user: User, request: Request, response: Response) -> AuthResponse:
    now = utcnow()
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at < now))
    raw, digest = new_token()
    expires = now + timedelta(days=get_settings().session_ttl_days)
    db.add(AuthSession(user_id=user.id, token_hash=digest, expires_at=expires,
                       user_agent=(request.headers.get("user-agent") or "")[:200] or None))
    user.last_login_at = now
    db.commit()
    set_session_cookie(response, request, raw, expires)
    return AuthResponse(user=user_out(user), token=raw, csrf_token=csrf_token_for(raw), expires_at=expires)


def _revoke_all(db: Session, user_id: str, keep: str | None = None) -> None:
    q = delete(AuthSession).where(AuthSession.user_id == user_id)
    if keep:
        q = q.where(AuthSession.id != keep)
    db.execute(q)


@router.post("/signup", status_code=201, response_model=AuthResponse)
def signup(req: SignupRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    enforce(request, "signup", 10, 3600)
    problems = password_problems(req.password, req.email, req.name)
    if problems:
        raise ApiError(422, "weak_password", problems[0], details=problems)
    if db.scalar(select(User.id).where(User.email == req.email)):
        raise ApiError(409, "email_taken", "An account with this email already exists. Try signing in.")
    user = User(email=req.email, name=req.name, password_hash=hash_password(req.password), preferences={})
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # two simultaneous sign-ups for one address: the unique index decides
        db.rollback()
        raise ApiError(409, "email_taken", "An account with this email already exists. Try signing in.") from None
    return _issue_session(db, user, request, response)


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    enforce(request, "login", 30, 300)
    enforce(request, "login-account", 8, 300, extra=req.email)
    user = db.scalar(select(User).where(User.email == req.email))
    ok = verify_password(user.password_hash if user else None, req.password)  # same cost for unknown emails
    if not user or not ok:
        raise _invalid()
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(req.password)
    return _issue_session(db, user, request, response)


@router.post("/google", response_model=AuthResponse)
def google_login(req: GoogleLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    enforce(request, "google", 30, 300)
    ident = verify_google_credential(req.credential, get_settings().google_client_id)
    if not ident.email_verified:
        raise ApiError(403, "email_not_verified", "Your Google email address is not verified.")

    user = db.scalar(select(User).where(User.google_sub == ident.sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == ident.email))
        if user is None:
            user = User(email=ident.email, name=ident.name, google_sub=ident.sub, email_verified=True,
                        avatar_url=ident.picture, preferences={})
            db.add(user)
            db.flush()
        else:
            # Link the Google identity to the existing account. Password sign-ups are not email-verified, so an
            # attacker could have pre-registered this address: drop that password and every existing session.
            if user.password_hash and not user.email_verified:
                user.password_hash = None
                _revoke_all(db, user.id)
            user.google_sub = ident.sub
            user.email_verified = True
            user.avatar_url = user.avatar_url or ident.picture
    elif ident.picture and user.avatar_url != ident.picture:
        user.avatar_url = ident.picture
    return _issue_session(db, user, request, response)


@router.post("/logout", status_code=204)
def logout(request: Request, pair=Depends(current_session), db: Session = Depends(get_db)) -> Response:
    db.execute(delete(AuthSession).where(AuthSession.id == pair[1].id))
    db.commit()
    resp = Response(status_code=204)
    clear_session_cookie(resp, request)
    return resp


@router.get("/session", response_model=AuthResponse)
def session_state(request: Request, pair=Depends(current_session)) -> AuthResponse:
    """Who is signed in, plus the CSRF token the page must echo back. Called when the app loads, because the
    HttpOnly cookie itself is invisible to scripts. The bearer token field is empty for cookie sessions."""
    user, sess = pair
    token = raw_token(request) or ""
    return AuthResponse(user=user_out(user), token="" if not request.headers.get("authorization") else token,
                        csrf_token=csrf_token_for(token), expires_at=sess.expires_at)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(patch: ProfilePatch, user: User = Depends(current_user), db: Session = Depends(get_db)) -> UserOut:
    if patch.name is not None:
        user.name = patch.name
    if patch.preferences is not None:
        user.preferences = patch.preferences.model_dump()
    db.commit()
    return user_out(user)


@router.post("/change-password", status_code=204)
def change_password(req: ChangePasswordRequest, request: Request, pair=Depends(current_session),
                    db: Session = Depends(get_db)) -> Response:
    user, sess = pair
    enforce(request, "change-password", 6, 900, extra=user.id)
    if user.password_hash and not verify_password(user.password_hash, req.current_password or ""):
        raise ApiError(403, "wrong_password", "Your current password is incorrect.")
    problems = password_problems(req.new_password, user.email, user.name)
    if problems:
        raise ApiError(422, "weak_password", problems[0], details=problems)
    user.password_hash = hash_password(req.new_password)
    _revoke_all(db, user.id, keep=sess.id)  # sign out every other device
    db.commit()
    return Response(status_code=204)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(pair=Depends(current_session), db: Session = Depends(get_db)) -> list[SessionOut]:
    user, current = pair
    rows = db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at > utcnow())
                      .order_by(AuthSession.last_used_at.desc())).all()
    return [SessionOut(id=s.id, created_at=s.created_at, last_used_at=s.last_used_at, expires_at=s.expires_at,
                       user_agent=s.user_agent, current=s.id == current.id) for s in rows if aware(s.expires_at) > utcnow()]


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: str, pair=Depends(current_session), db: Session = Depends(get_db)) -> Response:
    user, _ = pair
    res = db.execute(delete(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == user.id))
    db.commit()
    if res.rowcount == 0:
        raise ApiError(404, "not_found", "Session not found.")
    return Response(status_code=204)


@router.delete("/sessions", status_code=204)
def revoke_other_sessions(pair=Depends(current_session), db: Session = Depends(get_db)) -> Response:
    user, sess = pair
    _revoke_all(db, user.id, keep=sess.id)
    db.commit()
    return Response(status_code=204)


@router.post("/delete-account", status_code=204)
def delete_account(req: DeleteAccountRequest, request: Request, user: User = Depends(current_user),
                   db: Session = Depends(get_db)) -> Response:
    """POST (not DELETE) so the confirmation travels in a body that every HTTP client and proxy preserves."""
    enforce(request, "delete-account", 5, 900, extra=user.id)
    if user.password_hash:
        if not verify_password(user.password_hash, req.password or ""):
            raise ApiError(403, "wrong_password", "Your password is incorrect.")
    elif (req.confirm_email or "").strip().lower() != user.email:
        raise ApiError(403, "confirmation_mismatch", "Type your account email address to confirm.")
    for model in (AuthSession, GenerationRun, SavedSchema, SavedDataset):
        db.execute(delete(model).where(model.user_id == user.id))
    db.delete(user)
    db.commit()
    resp = Response(status_code=204)
    clear_session_cookie(resp, request)
    return resp
