"""Transaction rollback and safe handling of database failures."""
import logging

import pytest
from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.db import get_db, session_factory
from app.main import app
from app.models.db import SavedSchema


# ------------------------------------------------------------------ transactions and failures
def test_uncommitted_work_is_rolled_back_when_a_request_fails(api):
    gen = get_db()
    s = next(gen)
    s.add(SavedSchema(workspace_id="a" * 32, name="Ghost", plan={}))
    s.flush()
    with pytest.raises(RuntimeError):
        gen.throw(RuntimeError("handler failed"))
    with session_factory()() as check:
        assert check.scalar(select(func.count()).select_from(SavedSchema)) == 0


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
