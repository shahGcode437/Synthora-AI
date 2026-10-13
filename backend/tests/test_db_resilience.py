"""Shared rate limiting, transaction rollback and safe handling of database failures."""
import logging

import pytest
from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.auth.ratelimit import limiter
from app.config import get_settings
from app.db import get_db, session_factory
from app.main import app
from app.models.db import RateLimitEvent, User
from tests.conftest import PASSWORD, signup
from tests.test_accounts import db

A = "/api/v1/auth"


# ------------------------------------------------------------------ shared (database) rate limiting
@pytest.fixture
def shared_limits(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_backend", "database")


def test_database_rate_limit_blocks_and_sends_retry_after(api, shared_limits):
    for _ in range(8):
        api.post(f"{A}/login", json={"email": "ghost@example.com", "password": "wrong-password-1"})
    r = api.post(f"{A}/login", json={"email": "ghost@example.com", "password": "wrong-password-1"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"
    assert int(r.headers["retry-after"]) >= 1


def test_database_rate_limit_is_shared_between_instances(api, shared_limits):
    for _ in range(8):
        api.post(f"{A}/login", json={"email": "ghost@example.com", "password": "wrong-password-1"})
    limiter.reset()  # a different process has its own memory: only the database remembers
    r = api.post(f"{A}/login", json={"email": "ghost@example.com", "password": "wrong-password-1"})
    assert r.status_code == 429


def test_database_rate_limit_stores_no_emails_or_ips(api, shared_limits):
    api.post(f"{A}/login", json={"email": "private.person@example.com", "password": "wrong-password-1"})
    with db() as s:
        rows = s.scalars(select(RateLimitEvent)).all()
    assert rows and all(len(r.key) == 64 and "private" not in r.key and "." not in r.key for r in rows)


def test_database_rate_limit_falls_back_to_memory_when_the_table_fails(api, shared_limits, monkeypatch, caplog):
    import app.auth.ratelimit as rl

    def boom(*a, **k):
        raise OperationalError("SELECT", {}, Exception("connection refused"))

    monkeypatch.setattr(rl, "_db_check", boom)
    with caplog.at_level(logging.WARNING):
        for _ in range(8):
            api.post(f"{A}/login", json={"email": "ghost@example.com", "password": "wrong-password-1"})
        r = api.post(f"{A}/login", json={"email": "ghost@example.com", "password": "wrong-password-1"})
    assert r.status_code == 429  # still limited, by the in-memory fallback
    assert "in-memory limiter" in caplog.text


# ------------------------------------------------------------------ transactions and failures
def test_uncommitted_work_is_rolled_back_when_a_request_fails():
    gen = get_db()
    s = next(gen)
    s.add(User(email="ghost@example.com", name="Ghost", preferences={}))
    s.flush()
    with pytest.raises(RuntimeError):
        gen.throw(RuntimeError("handler failed"))
    with session_factory()() as check:
        assert check.scalar(select(func.count()).select_from(User)) == 0


def test_the_unique_email_constraint_is_enforced_by_the_database(api):
    signup(api)
    with db() as s:
        s.add(User(email="ada@example.com", name="Dup", preferences={}))
        with pytest.raises(IntegrityError):
            s.commit()


def test_a_losing_concurrent_signup_gets_a_clean_409(api, monkeypatch):
    """Both requests pass the 'email free?' check; the unique index rejects the second insert."""
    signup(api)
    import app.api.v1.auth as auth_mod

    real_scalar = Session.scalar
    bypassed = []

    def pretend_free(self, stmt, *a, **k):
        if "users.id" in str(stmt) and "users.email" in str(stmt) and "FROM users" in str(stmt) and "password" not in str(stmt):
            bypassed.append(1)
            return None
        return real_scalar(self, stmt, *a, **k)

    monkeypatch.setattr(Session, "scalar", pretend_free)
    r = api.post(f"{A}/signup", json={"name": "Ada Lovelace", "email": "ada@example.com", "password": PASSWORD})
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"
    assert bypassed, "the pre-check was not bypassed, so the unique index was never exercised"
    assert auth_mod


def test_database_outage_returns_503_without_leaking_connection_details(api, caplog):
    secret = "postgresql://synthora:hunter2@db.internal:5432/prod"

    @app.get("/__test/db-down")
    def _down(_: Session = Depends(get_db)):
        raise OperationalError("SELECT 1", {}, Exception(f"could not connect to {secret}"))

    try:
        with caplog.at_level(logging.ERROR):
            r = api.get("/__test/db-down")
    finally:
        app.router.routes[:] = [x for x in app.router.routes if getattr(x, "path", "") != "/__test/db-down"]
    assert r.status_code == 503 and r.json()["error"]["code"] == "database_unavailable"
    assert r.headers["retry-after"] == "5"
    assert "hunter2" not in r.text and "hunter2" not in caplog.text


def test_integrity_errors_become_409_not_500(api):
    @app.get("/__test/dup")
    def _dup(_: Session = Depends(get_db)):
        raise IntegrityError("INSERT", {}, Exception("duplicate key value violates unique constraint"))

    try:
        r = api.get("/__test/dup")
    finally:
        app.router.routes[:] = [x for x in app.router.routes if getattr(x, "path", "") != "/__test/dup"]
    assert r.status_code == 409 and r.json()["error"]["code"] == "conflict"
