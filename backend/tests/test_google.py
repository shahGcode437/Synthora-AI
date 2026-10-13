"""Google sign-in. The Google network call is stubbed; account logic and token checks are real."""
import pytest
from google.auth.exceptions import GoogleAuthError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1 import auth as auth_mod
from app.auth import google as google_mod
from app.auth.errors import ApiError
from app.auth.google import GoogleIdentity, verify_google_credential
from app.config import get_settings
from app.db import get_engine
from app.models.db import AuthSession, User

from tests.conftest import PASSWORD, auth, signup

CRED = {"credential": "x" * 40}
CID = "test-client-id.apps.googleusercontent.com"


def identity(**kw) -> GoogleIdentity:
    base = dict(sub="google-sub-1", email="gina@example.com", email_verified=True, name="Gina G", picture="https://img/x.png")
    return GoogleIdentity(**{**base, **kw})


@pytest.fixture
def as_google(monkeypatch):
    def set_identity(ident: GoogleIdentity):
        monkeypatch.setattr(auth_mod, "verify_google_credential", lambda credential, client_id: ident)
    return set_identity


# ------------------------------------------------------------------ endpoint behaviour
def test_new_google_user_is_created_and_verified(api, as_google):
    as_google(identity())
    r = api.post("/api/v1/auth/google", json=CRED)
    assert r.status_code == 200
    u = r.json()["user"]
    assert u["email"] == "gina@example.com" and u["has_google"] and not u["has_password"] and u["email_verified"]
    assert u["avatar_url"] == "https://img/x.png" and r.json()["token"]


def test_same_google_account_signs_into_the_same_user(api, as_google):
    as_google(identity())
    a = api.post("/api/v1/auth/google", json=CRED).json()["user"]["id"]
    b = api.post("/api/v1/auth/google", json=CRED).json()["user"]["id"]
    assert a == b
    with Session(get_engine()) as s:
        assert len(s.scalars(select(User)).all()) == 1


def test_unverified_google_email_is_refused(api, as_google):
    as_google(identity(email_verified=False))
    r = api.post("/api/v1/auth/google", json=CRED)
    assert r.status_code == 403 and r.json()["error"]["code"] == "email_not_verified"


def test_linking_to_an_existing_password_account_removes_the_password_and_sessions(api, as_google):
    """Password sign-ups are unverified, so a squatter could have pre-registered the address."""
    squat = signup(api, email="gina@example.com", name="Squatter")
    assert api.get("/api/v1/auth/me", headers=auth(squat["token"])).status_code == 200
    as_google(identity())
    r = api.post("/api/v1/auth/google", json=CRED)
    assert r.status_code == 200 and r.json()["user"]["id"] == squat["user"]["id"]   # same account, now Google-verified
    assert r.json()["user"]["has_password"] is False
    assert api.get("/api/v1/auth/me", headers=auth(squat["token"])).status_code == 401           # squatter session gone
    assert api.post("/api/v1/auth/login", json={"email": "gina@example.com", "password": PASSWORD}).status_code == 401


def test_a_verified_account_keeps_its_password_across_google_sign_ins(api, as_google):
    """Only UNVERIFIED password accounts are hardened; a Google-verified account that added a password keeps it."""
    as_google(identity())
    tok = api.post("/api/v1/auth/google", json=CRED).json()["token"]
    assert api.post("/api/v1/auth/change-password", json={"new_password": "my-new-password-5"},
                    headers=auth(tok)).status_code == 204
    again = api.post("/api/v1/auth/google", json=CRED)                      # same Google identity signs in again
    assert again.status_code == 200 and again.json()["user"]["has_password"] is True
    assert api.get("/api/v1/auth/me", headers=auth(tok)).status_code == 200  # earlier session untouched
    assert api.post("/api/v1/auth/login", json={"email": "gina@example.com", "password": "my-new-password-5"}).status_code == 200


def test_google_not_configured_returns_503(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "google_client_id", "")
    r = api.post("/api/v1/auth/google", json=CRED)
    assert r.status_code == 503 and r.json()["error"]["code"] == "google_not_configured"


def test_google_credential_is_validated_and_rate_limited(api, as_google):
    assert api.post("/api/v1/auth/google", json={"credential": "short"}).status_code == 422
    as_google(identity())
    codes = [api.post("/api/v1/auth/google", json=CRED).status_code for _ in range(32)]
    assert codes[:30] == [200] * 30 and codes[30:] == [429, 429]


def test_google_session_works_like_any_other(api, as_google):
    as_google(identity())
    tok = api.post("/api/v1/auth/google", json=CRED).json()["token"]
    assert api.get("/api/v1/auth/me", headers=auth(tok)).json()["email"] == "gina@example.com"
    assert api.post("/api/v1/auth/logout", headers=auth(tok)).status_code == 204
    assert api.get("/api/v1/auth/me", headers=auth(tok)).status_code == 401
    # sign-in with Google again creates a new session for the same user
    assert api.post("/api/v1/auth/google", json=CRED).status_code == 200


def test_google_delete_account_needs_the_email_not_a_password(api, as_google):
    as_google(identity())
    tok = api.post("/api/v1/auth/google", json=CRED).json()["token"]
    h = auth(tok)
    assert api.post("/api/v1/auth/delete-account", json={}, headers=h).status_code == 403
    assert api.post("/api/v1/auth/delete-account", json={"confirm_email": "wrong@example.com"}, headers=h).status_code == 403
    assert api.post("/api/v1/auth/delete-account", json={"confirm_email": "GINA@example.com"}, headers=h).status_code == 204
    with Session(get_engine()) as s:
        assert s.scalar(select(User)) is None and s.scalar(select(AuthSession)) is None


# ------------------------------------------------------------------ token verification (the real function)
def test_verify_requires_a_client_id():
    with pytest.raises(ApiError) as ei:
        verify_google_credential("tok", "")
    assert ei.value.status == 503


def test_verify_accepts_a_valid_token(monkeypatch):
    seen = {}

    def fake(token, request, audience):
        seen.update(token=token, audience=audience)
        return {"iss": "https://accounts.google.com", "sub": "123", "email": "Ann@Example.com", "email_verified": True,
                "name": "Ann", "picture": "p"}

    monkeypatch.setattr(google_mod.id_token, "verify_oauth2_token", fake)
    ident = verify_google_credential("tok", CID)
    assert seen == {"token": "tok", "audience": CID}            # audience is OUR client id
    assert ident.email == "ann@example.com" and ident.email_verified and ident.sub == "123"


@pytest.mark.parametrize("exc", [ValueError("bad"), GoogleAuthError("bad")])
def test_verify_rejects_invalid_tokens(monkeypatch, exc):
    def boom(*a, **k):
        raise exc
    monkeypatch.setattr(google_mod.id_token, "verify_oauth2_token", boom)
    with pytest.raises(ApiError) as ei:
        verify_google_credential("tok", CID)
    assert ei.value.status == 401 and ei.value.code == "invalid_google_token"


def test_verify_rejects_wrong_issuer_and_missing_claims(monkeypatch):
    for info in ({"iss": "https://evil.example", "sub": "1", "email": "a@b.co"},
                 {"iss": "accounts.google.com", "email": "a@b.co"},
                 {"iss": "accounts.google.com", "sub": "1"}):
        monkeypatch.setattr(google_mod.id_token, "verify_oauth2_token", lambda *a, _i=info, **k: _i)
        with pytest.raises(ApiError) as ei:
            verify_google_credential("tok", CID)
        assert ei.value.status == 401


def test_verify_reports_network_failure_as_unavailable(monkeypatch):
    def boom(*a, **k):
        raise ConnectionError("no network")
    monkeypatch.setattr(google_mod.id_token, "verify_oauth2_token", boom)
    with pytest.raises(ApiError) as ei:
        verify_google_credential("tok", CID)
    assert ei.value.status == 503 and ei.value.code == "google_unavailable"
