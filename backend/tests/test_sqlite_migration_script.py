"""scripts/migrate_sqlite_to_postgres.py: copy, verify, stay safe. Target is SQLite, or PostgreSQL via TEST_DATABASE_URL."""
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.migrate import upgrade
from app.models.db import (AuthSession, Base, GenerationRun, SavedDataset, SavedSchema, User, utcnow)
from scripts.migrate_sqlite_to_postgres import MigrationError, file_digest, main, migrate, open_source


@pytest.fixture
def legacy(tmp_path) -> Path:
    """A SQLite file shaped like the pre-migration database (made by create_all, no alembic_version)."""
    path = tmp_path / "synthora.db"
    eng = create_engine(f"sqlite:///{path}")  # no foreign-key pragma: lets us plant an orphan like old data could have
    Base.metadata.create_all(eng)
    now = utcnow().replace(tzinfo=None)
    with Session(eng) as s:
        s.add_all([
            User(id="u1" + "0" * 30, email="ada@example.com", name="Ada", password_hash="$argon2id$v=19$fake-hash-ada",
                 preferences={"theme": "light"}, created_at=now),
            User(id="u2" + "0" * 30, email="grace@example.com", name="Grace", google_sub="g-123", email_verified=True,
                 preferences={}, created_at=now),
        ])
        s.flush()
        s.add_all([
            SavedSchema(id="s1" + "0" * 30, user_id="u1" + "0" * 30, name="Shop", plan={"tables": [1]},
                        created_at=now, updated_at=now),
            SavedDataset(id="d1" + "0" * 30, user_id="u1" + "0" * 30, name="Rows", tables=[{"name": "t", "rows": 2}],
                         total_rows=2, size_bytes=10, data_gz=b"\x1f\x8b-binary-\x00", created_at=now),
            GenerationRun(id="r1" + "0" * 30, user_id="u2" + "0" * 30, source_mode="prompt", domain="retail",
                          data_type="tabular", tables=1, rows=5, seed=1, duration_ms=9, validation_passed=True,
                          settings={}, plan={"p": 1}, created_at=now),
            AuthSession(id="a1" + "0" * 30, user_id="u1" + "0" * 30, token_hash="h" * 64, created_at=now,
                        last_used_at=now, expires_at=now + timedelta(days=3)),
            AuthSession(id="a2" + "0" * 30, user_id="u1" + "0" * 30, token_hash="i" * 64, created_at=now,
                        last_used_at=now, expires_at=now - timedelta(days=1)),  # expired: must not be copied
        ])
        s.commit()
    eng.dispose()
    return path


@pytest.fixture
def target(empty_engine):
    upgrade(empty_engine)
    return empty_engine


def counts(engine, *models):
    with Session(engine) as s:
        return {m.__tablename__: s.scalar(select(func.count()).select_from(m)) for m in models}


def test_copies_everything_valid_and_verifies(legacy, target):
    before = file_digest(legacy)
    rep = migrate(open_source(legacy), target)
    assert rep.ok
    assert counts(target, User, SavedSchema, SavedDataset, GenerationRun, AuthSession) == {
        "users": 2, "saved_schemas": 1, "saved_datasets": 1, "generation_runs": 1, "auth_sessions": 1}
    assert rep.skipped["auth_sessions"] == ["a2000000 (expired or sessions not requested)"]
    assert file_digest(legacy) == before  # the source file is byte-for-byte unchanged


def test_ownership_secrets_and_payloads_survive_exactly(legacy, target):
    migrate(open_source(legacy), target)
    with Session(target) as s:
        ada = s.get(User, "u1" + "0" * 30)
        assert ada.password_hash == "$argon2id$v=19$fake-hash-ada" and ada.preferences == {"theme": "light"}
        if target.dialect.name == "postgresql":  # timestamptz: naive SQLite values were stored as UTC instants
            assert ada.created_at.tzinfo is not None
        grace = s.scalar(select(User).where(User.email == "grace@example.com"))
        assert grace.google_sub == "g-123" and grace.email_verified is True
        ds = s.get(SavedDataset, "d1" + "0" * 30)
        assert ds.user_id == ada.id and ds.data_gz == b"\x1f\x8b-binary-\x00"
        assert s.get(GenerationRun, "r1" + "0" * 30).user_id == grace.id
        assert s.get(SavedSchema, "s1" + "0" * 30).plan == {"tables": [1]}
        assert s.get(AuthSession, "a1" + "0" * 30).user_id == ada.id


def test_dry_run_writes_nothing(legacy, target):
    rep = migrate(open_source(legacy), target, dry_run=True)
    assert rep.ok and rep.dry_run and rep.copied["users"] == 2
    assert counts(target, User, SavedSchema)["users"] == 0


def test_refuses_a_non_empty_target_without_merge_and_is_repeatable_with_it(legacy, target):
    migrate(open_source(legacy), target)
    with pytest.raises(MigrationError, match="--merge"):
        migrate(open_source(legacy), target)
    rep = migrate(open_source(legacy), target, merge=True)  # re-run: nothing new, nothing duplicated
    assert rep.ok and not rep.copied
    assert counts(target, User, SavedSchema, SavedDataset, GenerationRun, AuthSession)["users"] == 2
    assert counts(target, SavedSchema)["saved_schemas"] == 1


def test_merge_never_overwrites_or_hijacks_an_existing_account(legacy, target):
    with Session(target) as s:  # a different person already registered ada@example.com in the target
        s.add(User(id="x" * 32, email="ada@example.com", name="Someone Else", password_hash="theirs", preferences={}))
        s.commit()
    rep = migrate(open_source(legacy), target, merge=True)
    assert rep.ok
    with Session(target) as s:
        existing = s.scalar(select(User).where(User.email == "ada@example.com"))
        assert existing.id == "x" * 32 and existing.password_hash == "theirs"
        assert s.get(SavedSchema, "s1" + "0" * 30) is None  # ada's rows were NOT attached to the other account
    assert any("another target account" in x for x in rep.skipped["users"])
    assert any("owner was not migrated" in x for x in rep.skipped["saved_schemas"])


def test_orphans_abort_the_run_and_leave_the_target_untouched(legacy, target):
    eng = create_engine(f"sqlite:///{legacy}")
    now = utcnow().replace(tzinfo=None)
    with Session(eng) as s:
        s.add(SavedSchema(id="o" * 32, user_id="nobody" + "0" * 26, name="Orphan", plan={}, created_at=now, updated_at=now))
        s.commit()
    eng.dispose()
    with pytest.raises(MigrationError, match="without an owner"):
        migrate(open_source(legacy), target)
    assert counts(target, User)["users"] == 0  # all-or-nothing
    rep = migrate(open_source(legacy), target, skip_invalid=True)
    assert rep.ok and any("owner not found" in x for x in rep.skipped["saved_schemas"])
    assert counts(target, SavedSchema)["saved_schemas"] == 1


def test_no_sessions_flag(legacy, target):
    migrate(open_source(legacy), target, copy_sessions=False)
    assert counts(target, AuthSession)["auth_sessions"] == 0


def test_requires_a_migrated_target(legacy, empty_engine):
    with pytest.raises(MigrationError, match="alembic upgrade head"):
        migrate(open_source(legacy), empty_engine)


def test_missing_source_is_an_error(tmp_path):
    with pytest.raises(MigrationError, match="not found"):
        open_source(tmp_path / "nope.db")


def test_cli_refuses_sqlite_target_and_prints_no_secrets(legacy, tmp_path, capsys):
    assert main(["--source", str(legacy), "--target", f"sqlite:///{tmp_path / 'x.db'}"]) == 2
    assert "PostgreSQL" in capsys.readouterr().err


def test_cli_end_to_end_report_has_counts_but_no_pii_or_hashes(legacy, target, capsys, monkeypatch):
    import scripts.migrate_sqlite_to_postgres as mod

    monkeypatch.setattr(mod, "create_engine", lambda *a, **k: target)  # reuse the prepared empty target
    monkeypatch.setattr(target, "dispose", lambda: None)
    assert main(["--source", str(legacy), "--target", "postgresql://u:p@h/db"]) == 0
    out = capsys.readouterr().out
    assert "Migration committed" in out and "users" in out and "unchanged" in out
    for secret in ("ada@example.com", "grace@example.com", "argon2id", "fake-hash", "hhhh"):
        assert secret not in out
