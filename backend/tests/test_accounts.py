"""Authentication, sessions, profile, password and account deletion."""
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.auth.passwords import hash_password, password_problems, verify_password
from app.auth.tokens import hash_token
from app.config import get_settings
from app.db import get_engine
from app.models.db import AuthSession, GenerationRun, SavedDataset, SavedSchema, User, utcnow
from sqlalchemy.orm import Session

from tests.conftest import PASSWORD, auth, signup

A = "/api/v1/auth"


def db() -> Session:
    return Session(get_engine())


# ------------------------------------------------------------------ signup / login
def test_signup_returns_session_and_never_exposes_secrets(api):
    r = api.post(f"{A}/signup", json={"name": "  Ada   Lovelace ", "email": " Ada@Example.COM ", "password": PASSWORD})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "ada@example.com" and body["user"]["name"] == "Ada Lovelace"
    assert body["user"]["has_password"] is True and body["user"]["has_google"] is False
    assert len(body["token"]) >= 40 and "password" not in r.text.lower().replace("has_password", "")
    assert "password_hash" not in r.text and "token_hash" not in r.text


def test_password_is_argon2id_and_token_is_stored_hashed(api):
    body = signup(api)
    with db() as s:
        u = s.scalar(select(User))
        assert u.password_hash.startswith("$argon2id$") and PASSWORD not in u.password_hash
        sess = s.scalar(select(AuthSession))
        assert sess.token_hash == hash_token(body["token"]) and sess.token_hash != body["token"]


def test_duplicate_email_rejected_case_insensitively(api):
    signup(api)
    r = api.post(f"{A}/signup", json={"name": "Other", "email": "ADA@example.com", "password": PASSWORD})
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


@pytest.mark.parametrize("pw,fragment", [("short1", "at least"), ("lettersonlylong", "letter and one number"),
                                         ("1234567890", "letter and one number"), ("aaaaaaaa11", "repetitive")])
def test_weak_passwords_rejected(api, pw, fragment):
    r = api.post(f"{A}/signup", json={"name": "Ada", "email": "ada@example.com", "password": pw})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "weak_password" and any(fragment in m for m in err["details"])


def test_password_must_not_contain_name_or_email():
    assert password_problems("adalovelace123", "x@y.co", "Ada Lovelace")
    assert password_problems("ada@example.com", "ada@example.com")
    assert not password_problems("correct-horse-42", "ada@example.com", "Ada Lovelace")


@pytest.mark.parametrize("body", [
    {"name": "", "email": "ada@example.com", "password": PASSWORD},
    {"name": "Ada", "email": "not-an-email", "password": PASSWORD},
    {"name": "Ada", "email": "ada@example.com"},
    {"name": "A" * 81, "email": "ada@example.com", "password": PASSWORD},
    {"name": "Ada", "email": "ada@example.com", "password": "x" * 129},
])
def test_signup_validation(api, body):
    r = api.post(f"{A}/signup", json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] in ("validation_error", "weak_password")


def test_login_success_and_generic_failure(api):
    signup(api)
    ok = api.post(f"{A}/login", json={"email": "ADA@example.com", "password": PASSWORD})
    assert ok.status_code == 200 and ok.json()["token"]
    wrong = api.post(f"{A}/login", json={"email": "ada@example.com", "password": "wrong-password-1"})
    unknown = api.post(f"{A}/login", json={"email": "nobody@example.com", "password": "wrong-password-1"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()  # identical: no account enumeration through login
    assert wrong.json()["error"]["code"] == "invalid_credentials"


def test_verify_password_behaviour():
    h = hash_password(PASSWORD)
    assert verify_password(h, PASSWORD) and not verify_password(h, PASSWORD + "x")
    assert not verify_password(None, PASSWORD) and not verify_password("not-a-hash", PASSWORD)


# ------------------------------------------------------------------ sessions
def test_me_requires_a_valid_token(api, user):
    assert api.get(f"{A}/me", headers=user["h"]).json()["email"] == "ada@example.com"
    r = api.get(f"{A}/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "not_authenticated"
    assert r.headers["www-authenticate"] == "Bearer"
    assert api.get(f"{A}/me", headers=auth("garbage-token")).status_code == 401
    assert api.get(f"{A}/me", headers={"Authorization": "Basic abc"}).status_code == 401


def test_expired_session_is_rejected(api, user):
    with db() as s:
        sess = s.scalar(select(AuthSession))
        sess.expires_at = utcnow() - timedelta(seconds=1)
        s.commit()
    r = api.get(f"{A}/me", headers=user["h"])
    assert r.status_code == 401 and "expired" in r.json()["error"]["message"].lower()


def test_session_lifetime_follows_settings(api):
    body = signup(api)
    from datetime import datetime
    exp = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
    days = (exp - utcnow().replace(tzinfo=exp.tzinfo)).total_seconds() / 86400
    assert abs(days - get_settings().session_ttl_days) < 0.01


def test_logout_revokes_only_that_session(api, user):
    second = api.post(f"{A}/login", json={"email": "ada@example.com", "password": PASSWORD}).json()["token"]
    assert api.post(f"{A}/logout", headers=user["h"]).status_code == 204
    assert api.get(f"{A}/me", headers=user["h"]).status_code == 401
    assert api.get(f"{A}/me", headers=auth(second)).status_code == 200


def test_list_and_revoke_sessions(api, user):
    t2 = api.post(f"{A}/login", json={"email": "ada@example.com", "password": PASSWORD},
                  headers={"User-Agent": "TestBrowser/1.0"}).json()["token"]
    rows = api.get(f"{A}/sessions", headers=user["h"]).json()
    assert len(rows) == 2 and sum(r["current"] for r in rows) == 1
    other_id = next(r["id"] for r in rows if not r["current"])
    assert any(r["user_agent"] == "TestBrowser/1.0" for r in rows)
    assert api.delete(f"{A}/sessions/{other_id}", headers=user["h"]).status_code == 204
    assert api.get(f"{A}/me", headers=auth(t2)).status_code == 401
    assert api.delete(f"{A}/sessions/{other_id}", headers=user["h"]).status_code == 404


def test_cannot_revoke_another_users_session(api, user, other):
    with db() as s:
        theirs = s.scalar(select(AuthSession).where(AuthSession.user_id == other["user"]["id"])).id
    assert api.delete(f"{A}/sessions/{theirs}", headers=user["h"]).status_code == 404
    assert api.get(f"{A}/me", headers=other["h"]).status_code == 200


def test_revoke_all_other_sessions(api, user):
    for _ in range(2):
        api.post(f"{A}/login", json={"email": "ada@example.com", "password": PASSWORD})
    assert api.delete(f"{A}/sessions", headers=user["h"]).status_code == 204
    rows = api.get(f"{A}/sessions", headers=user["h"]).json()
    assert len(rows) == 1 and rows[0]["current"]


# ------------------------------------------------------------------ profile / preferences
def test_update_name_and_preferences(api, user):
    prefs = {"workspace_name": "Lab", "locale": "en_PK", "rows": "500", "edge": "high", "privacy": "safe_default",
             "seed": "42", "export_format": "zip", "theme": "light", "density": "compact", "animations": False, "depth": "reduced"}
    r = api.patch(f"{A}/me", json={"name": "Ada L.", "preferences": prefs}, headers=user["h"])
    assert r.status_code == 200 and r.json()["name"] == "Ada L." and r.json()["preferences"] == prefs
    assert api.get(f"{A}/me", headers=user["h"]).json()["preferences"]["theme"] == "light"


@pytest.mark.parametrize("bad", [{"theme": "neon"}, {"rows": "12abc"}, {"unknown_key": 1}, {"export_format": "xlsx"}])
def test_preferences_are_validated(api, user, bad):
    assert api.patch(f"{A}/me", json={"preferences": bad}, headers=user["h"]).status_code == 422


def test_email_cannot_be_changed_through_profile(api, user):
    r = api.patch(f"{A}/me", json={"email": "evil@example.com", "name": "Ada"}, headers=user["h"])
    assert r.status_code == 200 and r.json()["email"] == "ada@example.com"


# ------------------------------------------------------------------ password change / delete account
def test_change_password_flow(api, user):
    other_device = api.post(f"{A}/login", json={"email": "ada@example.com", "password": PASSWORD}).json()["token"]
    new = "another-secret-77"
    assert api.post(f"{A}/change-password", json={"current_password": "nope-nope-1", "new_password": new},
                    headers=user["h"]).status_code == 403
    assert api.post(f"{A}/change-password", json={"current_password": PASSWORD, "new_password": "weak"},
                    headers=user["h"]).status_code == 422
    assert api.post(f"{A}/change-password", json={"current_password": PASSWORD, "new_password": new},
                    headers=user["h"]).status_code == 204
    assert api.get(f"{A}/me", headers=user["h"]).status_code == 200          # this session stays
    assert api.get(f"{A}/me", headers=auth(other_device)).status_code == 401  # other devices are signed out
    assert api.post(f"{A}/login", json={"email": "ada@example.com", "password": PASSWORD}).status_code == 401
    assert api.post(f"{A}/login", json={"email": "ada@example.com", "password": new}).status_code == 200


def test_delete_account_removes_everything(api, user, plan):
    h = user["h"]
    api.post("/api/v1/generate", json={"plan": plan, "seed": 1}, headers=h)
    api.post("/api/v1/schemas", json={"name": "S", "plan": plan}, headers=h)
    api.post("/api/v1/datasets", json={"name": "D", "data": {"t": [{"a": 1}]}}, headers=h)
    assert api.post(f"{A}/delete-account", json={"password": "wrong-pass-11"}, headers=h).status_code == 403
    assert api.post(f"{A}/delete-account", json={"password": PASSWORD}, headers=h).status_code == 204
    assert api.get(f"{A}/me", headers=h).status_code == 401
    with db() as s:
        for model in (User, AuthSession, GenerationRun, SavedSchema, SavedDataset):
            assert s.scalar(select(model)) is None, model.__name__
    assert api.post(f"{A}/login", json={"email": "ada@example.com", "password": PASSWORD}).status_code == 401


def test_delete_account_does_not_touch_other_users(api, user, other, plan):
    api.post("/api/v1/schemas", json={"name": "Keep", "plan": plan}, headers=other["h"])
    api.post(f"{A}/delete-account", json={"password": PASSWORD}, headers=user["h"])
    assert len(api.get("/api/v1/schemas", headers=other["h"]).json()) == 1


# ------------------------------------------------------------------ rate limiting
def test_login_is_rate_limited_per_account_with_retry_after(api):
    signup(api)
    codes = [api.post(f"{A}/login", json={"email": "ada@example.com", "password": "bad-password-1"}).status_code
             for _ in range(9)]
    assert codes[:8] == [401] * 8 and codes[8] == 429
    r = api.post(f"{A}/login", json={"email": "ada@example.com", "password": PASSWORD})  # even the right password
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
    assert r.json()["error"]["code"] == "rate_limited"
    # a different account is unaffected
    signup(api, email="grace@example.com", name="Grace")
    assert api.post(f"{A}/login", json={"email": "grace@example.com", "password": PASSWORD}).status_code == 200


def test_signup_is_rate_limited(api):
    codes = [api.post(f"{A}/signup", json={"name": "N", "email": f"u{i}@example.com", "password": "weak"}).status_code
             for i in range(12)]
    assert codes[:10] == [422] * 10 and codes[10:] == [429, 429]


def test_rate_limiting_can_be_disabled(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", False)
    signup(api)
    assert all(api.post(f"{A}/login", json={"email": "ada@example.com", "password": "bad-password-1"}).status_code == 401
               for _ in range(12))


def test_forwarded_for_only_trusted_when_configured(api, monkeypatch):
    signup(api)
    hdr = lambda ip: {"X-Forwarded-For": ip}  # noqa: E731
    body = {"email": "ada@example.com", "password": "bad-password-1"}
    for _ in range(8):
        api.post(f"{A}/login", json=body, headers=hdr("1.1.1.1"))
    assert api.post(f"{A}/login", json=body, headers=hdr("2.2.2.2")).status_code == 429   # header ignored: same client
    from app.auth.ratelimit import limiter
    limiter.reset()
    monkeypatch.setattr(get_settings(), "trust_proxy", True)
    for _ in range(8):
        api.post(f"{A}/login", json=body, headers=hdr("1.1.1.1"))
    assert api.post(f"{A}/login", json=body, headers=hdr("2.2.2.2")).status_code == 401   # distinct client behind proxy


# ------------------------------------------------------------------ AUTH_REQUIRED_FOR_AI
def test_ai_endpoints_can_require_sign_in(api, user, plan, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_required_for_ai", True)
    for path, body in [("/api/v1/generate", {"plan": plan}), ("/api/v1/analyze", {"mode": "prompt", "prompt": "x"}),
                       ("/api/v1/export", {"data": {"t": [{"a": 1}]}, "format": "json"})]:
        r = api.post(path, json=body)
        assert r.status_code == 401 and r.json()["error"]["code"] == "not_authenticated", path
    assert api.post("/api/v1/generate", json={"plan": plan, "seed": 1}, headers=user["h"]).status_code == 200
    assert api.post("/api/v1/export", json={"data": {"t": [{"a": 1}]}, "format": "json"}, headers=user["h"]).status_code == 200
    sample = api.post("/api/v1/analyze/sample", files={"file": ("a.csv", b"a\n1\n", "text/csv")})
    assert sample.status_code == 401


def test_anonymous_use_is_allowed_by_default(api, plan):
    assert api.post("/api/v1/generate", json={"plan": plan, "seed": 1}).status_code == 200
    assert api.post("/api/v1/export", json={"data": {"t": [{"a": 1}]}, "format": "json"}).status_code == 200


def test_expired_token_on_an_open_endpoint_is_reported_not_ignored(api, plan):
    r = api.post("/api/v1/generate", json={"plan": plan}, headers=auth("stale-token"))
    assert r.status_code == 401   # the client learns its session ended instead of silently losing history


def test_pre_registered_password_account_is_hardened_when_google_links(api, monkeypatch):
    """Covered in test_google.py; here: google-only accounts can set a password without a current one."""
    from app.api.v1 import auth as auth_mod
    from app.auth.google import GoogleIdentity
    monkeypatch.setattr(auth_mod, "verify_google_credential", lambda c, cid: GoogleIdentity(
        sub="sub-1", email="g@example.com", email_verified=True, name="Gina", picture=None))
    tok = api.post(f"{A}/google", json={"credential": "x" * 30}).json()["token"]
    h = auth(tok)
    assert api.get(f"{A}/me", headers=h).json()["has_password"] is False
    assert api.post(f"{A}/change-password", json={"new_password": "brand-new-pass-9"}, headers=h).status_code == 204
    assert api.post(f"{A}/login", json={"email": "g@example.com", "password": "brand-new-pass-9"}).status_code == 200
