"""Alembic environment. The database URL comes from DATABASE_URL (via app.config), never from alembic.ini."""
from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine

from app.config import get_settings
from app.db import Base
from app.models import db as _models  # noqa: F401  (registers every table on Base.metadata)

config = context.config
target_metadata = Base.metadata


def _opts() -> dict:
    # render_as_batch lets SQLite (local dev) apply ALTERs the same way as PostgreSQL.
    return {"target_metadata": target_metadata, "compare_type": True, "render_as_batch": True}


def run_migrations_offline() -> None:
    context.configure(url=get_settings().sqlalchemy_url, literal_binds=True, dialect_opts={"paramstyle": "named"}, **_opts())
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")  # supplied by app.migrate (startup and tests)
    if connection is not None:
        context.configure(connection=connection, **_opts())
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            context.configure(connection=conn, **_opts())
            with context.begin_transaction():
                context.run_migrations()
            conn.commit()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
