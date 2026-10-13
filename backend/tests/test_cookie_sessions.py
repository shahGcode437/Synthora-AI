"""Browser sessions: HttpOnly cookie + CSRF header + Origin check. Bearer clients are unaffected."""
from sqlalchemy import select

from app.auth.cookies import csrf_token_for
from app.config import get_settings
from app.models.db import AuthSession
from tests.conftest import PASSWORD, auth, signup
from tests.test_accounts import db

A = "/api/v1/auth"
ORIGIN = {"Origin": "http://localhost:5173"}


def browser_signup(api, email="web@example.com"):
    r = api.post(f"{A}/signup", json={"name": "Web User", "email": email, "password": PASSWORD}, headers=ORIGIN)
    assert r.status_code == 201, r.text
    return r


def test_signup_sets_an_httponly_cookie_and_a_csrf_token(api):
    r = browser_signup(api)
    cookie = r.headers["set-cookie"].lower()
    assert "synthora_session=" in cookie and "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie
    body = r.json()
    assert body["csrf_token"] == csrf_token_for(body["token"])
    assert body["csrf_token"] != body["token"]


def test_cookie_is_secure_over_https_and_forced_secure_for_cross_site(api, monkeypatch):
    r = api.post(f"{A}/signup", json={"name": "Sec User", "email": "s1@example.com", "password": PASSWORD},
                 headers={"X-Forwarded-Proto": "https"})
    assert "secure" not in r.headers["set-cookie"].lower()  # proxy header ignored unless TRUST_PROXY
    monkeypatch.setattr(get_settings(), "trust_proxy", True)
    r = api.post(f"{A}/signup", json={"name": "Sec User", "email": "s2@example.com", "password": PASSWORD},
                 headers={"X-Forwarded-Proto": "https"})
    assert "secure" in r.headers["set-cookie"].lower()
    monkeypatch.setattr(get_settings(), "session_cookie_samesite", "none")
    r = api.post(f"{A}/signup", json={"name": "Sec User", "email": "s3@example.com", "password": PASSWORD})
    c = r.headers["set-cookie"].lower()
    assert "secure" in c and "samesite=none" in c


def test_cookie_authenticates_reads_without_any_extra_header(api):
    browser_signup(api)
    r = api.get(f"{A}/me")
    assert r.status_code == 200 and r.json()["email"] == "web@example.com"
    s = api.get(f"{A}/session").json()
    assert s["user"]["email"] == "web@example.com" and s["csrf_token"] and s["token"] == ""  # cookie: no token in JS


def test_state_changing_requests_need_the_csrf_header(api):
    token = browser_signup(api).json()["csrf_token"]
    body = {"name": "Renamed"}
    no_header = api.patch(f"{A}/me", json=body, headers=ORIGIN)
    assert no_header.status_code == 403 and no_header.json()["error"]["code"] == "csrf_failed"
    wrong = api.patch(f"{A}/me", json=body, headers={**ORIGIN, "X-CSRF-Token": "0" * 64})
    assert wrong.status_code == 403
    ok = api.patch(f"{A}/me", json=body, headers={**ORIGIN, "X-CSRF-Token": token})
    assert ok.status_code == 200 and ok.json()["name"] == "Renamed"


def test_foreign_origin_is_rejected_even_with_a_valid_csrf_token(api):
    token = browser_signup(api).json()["csrf_token"]
    r = api.patch(f"{A}/me", json={"name": "Evil"}, headers={"Origin": "https://evil.example", "X-CSRF-Token": token})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    assert api.get(f"{A}/me").json()["name"] == "Web User"


def test_csrf_token_of_another_session_does_not_work(api):
    browser_signup(api)
    other = api.post(f"{A}/signup", json={"name": "Other", "email": "o@example.com", "password": PASSWORD}).json()
    api.cookies.clear()
    api.post(f"{A}/login", json={"email": "web@example.com", "password": PASSWORD})
    r = api.patch(f"{A}/me", json={"name": "X Y"}, headers={"X-CSRF-Token": other["csrf_token"]})
    assert r.status_code == 403


def test_bearer_requests_are_not_subject_to_csrf(api):
    u = signup(api)
    r = api.patch(f"{A}/me", json={"name": "Bearer Name"}, headers=auth(u["token"]))
    assert r.status_code == 200


def test_logout_revokes_the_session_and_clears_the_cookie(api):
    token = browser_signup(api).json()["csrf_token"]
    r = api.post(f"{A}/logout", headers={**ORIGIN, "X-CSRF-Token": token})
    assert r.status_code == 204
    assert 'synthora_session=""' in r.headers["set-cookie"] or "max-age=0" in r.headers["set-cookie"].lower()
    with db() as s:
        assert s.scalar(select(AuthSession)) is None
    assert api.get(f"{A}/me").status_code == 401


def test_logout_without_csrf_is_refused_and_keeps_the_session(api):
    browser_signup(api)
    assert api.post(f"{A}/logout", headers=ORIGIN).status_code == 403
    assert api.get(f"{A}/me").status_code == 200


def test_stale_cookie_degrades_to_anonymous_for_the_public_generator_but_not_for_account_pages(api, plan):
    token = browser_signup(api).json()["csrf_token"]
    with db() as s:  # the session is revoked elsewhere; the browser still holds the cookie
        s.query(AuthSession).delete()
        s.commit()
    assert api.get(f"{A}/me").status_code == 401
    r = api.post("/api/v1/generate", json={"plan": plan, "seed": 1}, headers={**ORIGIN, "X-CSRF-Token": token})
    assert r.status_code == 200  # anonymous generation still works


def test_cookie_generation_is_recorded_in_history_for_the_cookie_user(api, plan):
    token = browser_signup(api).json()["csrf_token"]
    h = {**ORIGIN, "X-CSRF-Token": token}
    assert api.post("/api/v1/generate", json={"plan": plan, "seed": 3}, headers=h).status_code == 200
    assert api.get("/api/v1/history").json()["total"] == 1
    assert api.post("/api/v1/generate", json={"plan": plan, "seed": 3}, headers=ORIGIN).status_code == 403  # no CSRF


def test_delete_account_clears_the_cookie(api):
    token = browser_signup(api).json()["csrf_token"]
    r = api.post(f"{A}/delete-account", json={"password": PASSWORD}, headers={**ORIGIN, "X-CSRF-Token": token})
    assert r.status_code == 204 and "synthora_session" in r.headers["set-cookie"]
    assert api.get(f"{A}/me").status_code == 401
