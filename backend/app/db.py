"""Database layer (SQLAlchemy 2). PostgreSQL in production, SQLite for local dev and fast tests.

The schema is owned by Alembic (`backend/migrations`): see `app/migrate.py` and docs/DATABASE_SETUP.md.
Nothing here creates tables.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_factory: sessionmaker[Session] | None = None


def _build_engine(url: str) -> Engine:
    s = get_settings()
    if url.startswith("sqlite"):
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url or url in ("sqlite://", "sqlite:///"):
            kwargs["poolclass"] = StaticPool  # one shared in-memory connection (tests)
        engine = create_engine(url, **kwargs)

        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _):  # SQLite ignores foreign keys unless enabled per connection
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return engine
    return create_engine(
        url,
        pool_pre_ping=True,                      # drop connections the server or a proxy closed while idle
        pool_size=s.db_pool_size,
        max_overflow=s.db_max_overflow,
        pool_timeout=s.db_pool_timeout_s,        # fail fast (-> 503) instead of hanging when the pool is exhausted
        pool_recycle=s.db_pool_recycle_s,
        connect_args={"connect_timeout": s.db_connect_timeout_s} if url.startswith("postgresql") else {},
    )


def configure_engine(url: str | None = None) -> Engine:
    """(Re)create the global engine. Tests call this with an in-memory SQLite URL or TEST_DATABASE_URL."""
    global _engine, _factory
    if _engine is not None:
        _engine.dispose()
    _engine = _build_engine(url or get_settings().sqlalchemy_url)
    _factory = sessionmaker(bind=_engine, expire_on_commit=False, autoflush=False)
    return _engine


def get_engine() -> Engine:
    return _engine or configure_engine()


def session_factory() -> sessionmaker[Session]:
    if _factory is None:
        configure_engine()
    assert _factory is not None
    return _factory


def get_db() -> Iterator[Session]:
    """One session per request. Whatever the handler did not commit is rolled back, and the connection is
    always returned to the pool, including when the handler raises."""
    db = session_factory()()
    try:
        yield db
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """Startup: apply migrations (if DB_AUTO_MIGRATE / SQLite) or verify the database is already at head."""
    from app.migrate import ensure_schema

    ensure_schema(get_engine(), auto=get_settings().auto_migrate)


def dispose_engine() -> None:
    global _engine, _factory
    if _engine is not None:
        _engine.dispose()
    _engine = _factory = None
