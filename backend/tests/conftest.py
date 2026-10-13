"""Shared fixtures: an isolated in-memory database per test, and anonymous workspaces."""
import json
import os
import uuid
from pathlib import Path

# Tests that touch the database without the `api` fixture must never create a file next to the code.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or "sqlite://"  # before app.config is first imported

import pytest
from sqlalchemy import create_engine, text
from fastapi.testclient import TestClient

from app.config import get_settings
from app.config import Settings
from app.db import configure_engine, get_engine, init_db
from app.main import app

PLAN_FILE = Path(__file__).parent / "fixtures" / "plan_a.json"


@pytest.fixture
def plan() -> dict:
    return json.loads(PLAN_FILE.read_text(encoding="utf-8"))


# Set TEST_DATABASE_URL to run this whole suite against PostgreSQL, e.g.
#   postgresql://synthora:synthora@localhost:5433/synthora_test
# The database is wiped (every table dropped) before the run, so its name must contain "test".
PG_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
_pg_ready = False


def _sqlalchemy_url(url: str) -> str:
    return Settings(database_url=url).sqlalchemy_url


def _prepare_postgres() -> None:
    """Once per run: start from an empty database and apply the real migrations."""
    global _pg_ready
    from sqlalchemy import text

    if "test" not in PG_URL.rsplit("/", 1)[-1].lower():
        pytest.exit("TEST_DATABASE_URL must point at a database whose name contains 'test': it is wiped.", 2)
    engine = configure_engine(_sqlalchemy_url(PG_URL))
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE"))
        c.execute(text("CREATE SCHEMA public"))
    init_db()
    _pg_ready = True


def _clear_tables() -> None:
    from sqlalchemy import text

    from app.db import Base

    names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with get_engine().begin() as c:
        c.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))


@pytest.fixture
def api(monkeypatch) -> TestClient:
    """Fresh database (in-memory SQLite, or TEST_DATABASE_URL PostgreSQL), empty rate limiter, default settings."""
    if PG_URL:
        if not _pg_ready:
            _prepare_postgres()
        configure_engine(_sqlalchemy_url(PG_URL))
        _clear_tables()
        monkeypatch.setattr(get_settings(), "database_url", PG_URL)
    else:
        configure_engine("sqlite://")
        init_db()
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def workspace_headers(ws: str | None = None) -> dict:
    return {"X-Workspace-Id": ws or uuid.uuid4().hex}


@pytest.fixture
def user(api) -> dict:
    """One anonymous workspace: {'h': headers}. (Named `user` for brevity; there are no accounts.)"""
    return {"h": workspace_headers()}


@pytest.fixture
def other(api) -> dict:
    return {"h": workspace_headers()}


@pytest.fixture
def empty_engine(tmp_path):
    """A brand-new, empty database: a temp SQLite file, or an empty schema in the PostgreSQL test database."""
    if PG_URL:
        admin = create_engine(_sqlalchemy_url(PG_URL))
        with admin.begin() as c:
            c.execute(text("DROP SCHEMA IF EXISTS mig_test CASCADE"))
            c.execute(text("CREATE SCHEMA mig_test"))
        engine = create_engine(_sqlalchemy_url(PG_URL), connect_args={"options": "-csearch_path=mig_test"})
        yield engine
        engine.dispose()
        with admin.begin() as c:
            c.execute(text("DROP SCHEMA IF EXISTS mig_test CASCADE"))
        admin.dispose()
    else:
        engine = create_engine(f"sqlite:///{tmp_path / 'm.db'}")
        yield engine
        engine.dispose()
