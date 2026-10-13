"""Schema management on top of Alembic.

- `upgrade(engine)`      apply every pending migration (safe to run repeatedly and from several instances at once:
                         on PostgreSQL a session-level advisory lock serialises concurrent runners).
- `ensure_schema(...)`   what the app does at startup: upgrade when auto-migration is on, otherwise verify that the
                         database is already at the latest revision and refuse to start if it is not.
"""
from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
_LOCK_KEY = 7_340_011_265  # arbitrary constant: "synthora migrations"


class SchemaNotReady(RuntimeError):
    """The database is missing migrations. Run `alembic upgrade head` (or set DB_AUTO_MIGRATE=true)."""


class LegacyDatabase(SchemaNotReady):
    """Tables exist but were never versioned (created by an older release). Never modified automatically."""


def _check_not_legacy(conn) -> None:
    names = set(inspect(conn).get_table_names())
    if "alembic_version" not in names and names & {"users", "auth_sessions", "saved_schemas"}:
        raise LegacyDatabase(
            "This database has application tables but no migration history (it was created before migrations "
            "existed). It has NOT been touched. If it only holds disposable data, delete it; otherwise copy its data "
            "into a fresh database with `python -m scripts.migrate_sqlite_to_postgres` (see docs/AUTH_SETUP.md)."
        )


def alembic_config(connection=None) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    if connection is not None:
        cfg.attributes["connection"] = connection
    return cfg


def head_revision() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def current_revision(engine: Engine) -> str | None:
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def upgrade(engine: Engine, revision: str = "head") -> None:
    with engine.connect() as conn:
        _check_not_legacy(conn)
        locked = conn.dialect.name == "postgresql"
        if locked:
            conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _LOCK_KEY})
            conn.commit()
        try:
            command.upgrade(alembic_config(conn), revision)
            conn.commit()
        finally:
            if locked:
                conn.rollback()
                conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _LOCK_KEY})
                conn.commit()


def downgrade(engine: Engine, revision: str) -> None:
    with engine.connect() as conn:
        command.downgrade(alembic_config(conn), revision)
        conn.commit()


def ensure_schema(engine: Engine, auto: bool) -> None:
    if auto:
        upgrade(engine)
        logger.info("Database schema is at revision %s", current_revision(engine))
        return
    with engine.connect() as conn:
        _check_not_legacy(conn)
    have, want = current_revision(engine), head_revision()
    if have != want:
        raise SchemaNotReady(
            f"Database schema is at revision {have or 'none'} but this release needs {want}. "
            "Run `alembic upgrade head` from backend/ (or set DB_AUTO_MIGRATE=true) and restart."
        )
