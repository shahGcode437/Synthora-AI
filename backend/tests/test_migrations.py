"""Alembic migrations: apply from empty, repeat safely, match the ORM models, roll back, and gate startup.

Runs on SQLite by default and on PostgreSQL when TEST_DATABASE_URL is set (inside a throwaway schema)."""
import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

import app.db as dbmod
from app.config import get_settings
from app.db import Base
from app.main import app
from app.migrate import SchemaNotReady, current_revision, downgrade, ensure_schema, head_revision, upgrade

TABLES = {"users", "auth_sessions", "generation_runs", "saved_schemas", "saved_datasets", "rate_limit_events"}


@pytest.fixture
def swap_engine(empty_engine):
    """Point the application's global engine at the empty database for the duration of a test."""
    old_engine, old_factory = dbmod._engine, dbmod._factory
    def use() -> None:
        dbmod._engine = empty_engine
        dbmod._factory = dbmod.sessionmaker(bind=empty_engine, expire_on_commit=False, autoflush=False)

    use()
    empty_engine.use = use  # shutdown disposes the global engine, so a simulated reboot must point at it again
    yield empty_engine
    dbmod._engine, dbmod._factory = old_engine, old_factory


def test_upgrade_from_empty_creates_every_table_at_head(empty_engine):
    assert current_revision(empty_engine) is None
    upgrade(empty_engine)
    assert TABLES <= set(inspect(empty_engine).get_table_names())
    assert current_revision(empty_engine) == head_revision()


def test_upgrade_is_repeatable(empty_engine):
    upgrade(empty_engine)
    with empty_engine.begin() as c:
        c.execute(text("INSERT INTO users (id,email,name,email_verified,preferences,created_at) "
                       "VALUES ('u1','a@b.co','A',false,'{}',CURRENT_TIMESTAMP)"))
    upgrade(empty_engine)   # a second deploy must be a no-op and must not touch data
    upgrade(empty_engine)
    with empty_engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM users")).scalar() == 1
    assert current_revision(empty_engine) == head_revision()


def test_migrated_schema_matches_the_models(empty_engine):
    """No drift: a model change without a migration fails here."""
    upgrade(empty_engine)
    with empty_engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata)
    assert diff == [], f"models and migrations disagree: {diff}"


def test_constraints_and_indexes_exist(empty_engine):
    upgrade(empty_engine)
    insp = inspect(empty_engine)
    assert {tuple(i["column_names"]) for i in insp.get_indexes("users") if i["unique"]} >= {("email",)}
    assert any(i["unique"] and i["column_names"] == ["token_hash"] for i in insp.get_indexes("auth_sessions"))
    for t in ("auth_sessions", "generation_runs", "saved_schemas", "saved_datasets"):
        fks = insp.get_foreign_keys(t)
        assert fks and fks[0]["referred_table"] == "users" and fks[0]["options"].get("ondelete") == "CASCADE", t


def test_downgrade_then_upgrade_round_trips(empty_engine):
    upgrade(empty_engine)
    downgrade(empty_engine, "base")
    assert not (TABLES & set(inspect(empty_engine).get_table_names()))
    upgrade(empty_engine)
    assert TABLES <= set(inspect(empty_engine).get_table_names())


def test_database_foreign_keys_cascade(empty_engine):
    upgrade(empty_engine)
    with empty_engine.begin() as c:
        c.execute(text("PRAGMA foreign_keys=ON")) if empty_engine.dialect.name == "sqlite" else None
        c.execute(text("INSERT INTO users (id,email,name,email_verified,preferences,created_at) "
                       "VALUES ('u1','a@b.co','A',false,'{}',CURRENT_TIMESTAMP)"))
        c.execute(text("INSERT INTO saved_schemas (id,user_id,name,plan,created_at,updated_at) "
                       "VALUES ('s1','u1','n','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
        c.execute(text("DELETE FROM users WHERE id='u1'"))
        assert c.execute(text("SELECT count(*) FROM saved_schemas")).scalar() == 0


def test_ensure_schema_refuses_an_unmigrated_database(empty_engine):
    with pytest.raises(SchemaNotReady) as e:
        ensure_schema(empty_engine, auto=False)
    assert "alembic upgrade head" in str(e.value)
    ensure_schema(empty_engine, auto=True)
    ensure_schema(empty_engine, auto=False)  # now at head: verification passes


def test_app_starts_against_an_empty_database_and_restarts_cleanly(swap_engine, monkeypatch):
    monkeypatch.setattr(get_settings(), "db_auto_migrate", True)
    for _ in range(2):  # first boot migrates, second boot (repeated deployment) is a no-op
        swap_engine.use()
        with TestClient(app) as client:
            assert client.get("/health").json()["status"] == "ok"
            r = client.post("/api/v1/auth/signup", json={"name": "Ada Lovelace", "email": "boot@example.com",
                                                          "password": "correct-horse-42"})
            assert r.status_code in (201, 409)
    assert current_revision(swap_engine) == head_revision()


def test_app_refuses_to_start_on_an_unmigrated_database_when_auto_migrate_is_off(swap_engine, monkeypatch):
    monkeypatch.setattr(get_settings(), "db_auto_migrate", False)
    swap_engine.use()
    with pytest.raises(SchemaNotReady):
        with TestClient(app):
            pass


def test_a_legacy_unversioned_database_is_refused_and_left_untouched(empty_engine):
    from app.migrate import LegacyDatabase

    with empty_engine.begin() as c:
        c.execute(text("CREATE TABLE users (id VARCHAR(32) PRIMARY KEY, email VARCHAR(254))"))
        c.execute(text("INSERT INTO users VALUES ('u1','keep@me.co')"))
    for call in (lambda: upgrade(empty_engine), lambda: ensure_schema(empty_engine, auto=False), lambda: ensure_schema(empty_engine, auto=True)):
        with pytest.raises(LegacyDatabase, match="has NOT been touched"):
            call()
    with empty_engine.connect() as c:
        assert c.execute(text("SELECT email FROM users")).scalar() == "keep@me.co"
        assert "alembic_version" not in set(inspect(c).get_table_names())
