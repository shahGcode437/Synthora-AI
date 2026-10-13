"""Copy accounts and saved data from a legacy SQLite file into a migrated target database (PostgreSQL).

    cd backend
    DATABASE_URL=postgresql://... python -m scripts.migrate_sqlite_to_postgres --source ../synthora.db --dry-run
    DATABASE_URL=postgresql://... python -m scripts.migrate_sqlite_to_postgres --source ../synthora.db

Safety properties
- The source is opened read-only and its SHA-256 is compared before and after: it is never modified.
- The target must already be at the latest Alembic revision (`alembic upgrade head`). Nothing is created here.
- Everything is written in ONE transaction: any error rolls the target back untouched.
- The target must be empty unless --merge is given; --merge never overwrites an existing id or e-mail.
- Expired sessions are not copied (use --no-sessions to copy none). Rate-limit counters are never copied.
- Rows whose owner does not exist abort the run unless --skip-invalid is given, and are then listed (never silent).
- After writing, counts per table and per user are verified, foreign keys are checked, and password hashes are
  compared by digest. Output contains counts and short ids only: no e-mails, hashes, tokens or credentials.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.config import Settings
from app.migrate import SchemaNotReady, ensure_schema
from app.models.db import AuthSession, GenerationRun, SavedDataset, SavedSchema, User, aware, utcnow

# Parents before children (foreign keys).
OWNED = (SavedSchema, SavedDataset, GenerationRun, AuthSession)
TABLES = (User, *OWNED)


class MigrationError(RuntimeError):
    pass


@dataclass
class Report:
    source_counts: dict[str, int] = field(default_factory=dict)
    copied: dict[str, int] = field(default_factory=dict)
    skipped: dict[str, list[str]] = field(default_factory=dict)  # table -> short ids with the reason
    target_counts: dict[str, int] = field(default_factory=dict)
    dry_run: bool = False
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def file_digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def open_source(path: Path) -> Engine:
    if not path.is_file():
        raise MigrationError(f"Source database not found: {path}")
    return create_engine(f"sqlite:///file:{path.resolve().as_posix()}?mode=ro&uri=true")


def _short(i: str) -> str:
    return i[:8]


def _clone(model, row):
    return model(**{c.key: getattr(row, c.key) for c in model.__table__.columns})


def _normalise(obj) -> None:
    """SQLite hands back naive datetimes; they were always UTC."""
    for c in obj.__table__.columns:
        v = getattr(obj, c.key)
        if hasattr(v, "tzinfo") and v is not None:
            setattr(obj, c.key, aware(v))


def migrate(source: Engine, target: Engine, *, dry_run: bool = False, merge: bool = False, skip_invalid: bool = False,
            copy_sessions: bool = True) -> Report:
    rep = Report(dry_run=dry_run)
    try:
        ensure_schema(target, auto=False)
    except SchemaNotReady as e:
        raise MigrationError(str(e)) from None

    with Session(source) as src, Session(target) as dst:
        for m in TABLES:
            rep.source_counts[m.__tablename__] = src.scalar(select(func.count()).select_from(m)) or 0

        existing_users = dst.scalar(select(func.count()).select_from(User)) or 0
        if existing_users and not merge:
            raise MigrationError("The target already contains users. Re-run with --merge to add missing rows "
                                 "(existing ids and e-mails are never overwritten).")

        have_ids = {m: set(dst.scalars(select(m.id))) for m in TABLES}
        have_emails = set(dst.scalars(select(User.email)))
        user_ids: set[str] = set()      # every user in the source
        present: set[str] = set()       # source users that now exist in the target under the same id
        now = utcnow()

        def skip(table: str, row_id: str, why: str) -> None:
            rep.skipped.setdefault(table, []).append(f"{_short(row_id)} ({why})")

        try:
            for u in src.scalars(select(User)):
                user_ids.add(u.id)
                if u.id in have_ids[User]:
                    present.add(u.id)
                    skip("users", u.id, "id already in target")
                elif u.email in have_emails:
                    skip("users", u.id, "e-mail already used by another target account")
                else:
                    present.add(u.id)
                    obj = _clone(User, u)
                    _normalise(obj)
                    dst.add(obj)
                    have_emails.add(u.email)
                    rep.copied["users"] = rep.copied.get("users", 0) + 1
            dst.flush()

            for m in OWNED:
                name = m.__tablename__
                for row in src.scalars(select(m)):
                    if row.user_id not in user_ids:
                        skip(name, row.id, "owner not found in source")
                        continue
                    if m is AuthSession and (not copy_sessions or aware(row.expires_at) <= now):
                        skip(name, row.id, "expired or sessions not requested")
                        continue
                    if row.id in have_ids[m]:
                        skip(name, row.id, "id already in target")
                        continue
                    if row.user_id not in present:
                        skip(name, row.id, "its owner was not migrated")
                        continue
                    obj = _clone(m, row)
                    _normalise(obj)
                    dst.add(obj)
                    rep.copied[name] = rep.copied.get(name, 0) + 1
            dst.flush()

            orphans = [f"{t}: {', '.join(v)}" for t, v in rep.skipped.items()
                       if any("owner not found" in x for x in v)]
            if orphans and not skip_invalid:
                raise MigrationError("Rows without an owner were found (" + "; ".join(orphans) + "). "
                                     "Inspect them, or re-run with --skip-invalid to leave them behind.")

            _verify(src, dst, rep, merge)
            if rep.problems:
                raise MigrationError("Verification failed: " + " | ".join(rep.problems))
        except BaseException:
            dst.rollback()
            raise
        if dry_run:
            dst.rollback()
        else:
            dst.commit()
            with Session(target) as check:  # re-verify from a fresh connection after the commit
                rep.target_counts = {m.__tablename__: check.scalar(select(func.count()).select_from(m)) or 0
                                     for m in TABLES}
    return rep


def _verify(src: Session, dst: Session, rep: Report, merge: bool) -> None:
    """Checks run inside the (uncommitted) transaction, so a failure never reaches the target."""
    for m in TABLES:
        name = m.__tablename__
        wrote = rep.copied.get(name, 0)
        left_behind = len(rep.skipped.get(name, []))
        if wrote + left_behind != rep.source_counts[name]:
            rep.problems.append(f"{name}: {rep.source_counts[name]} in source but {wrote} copied + {left_behind} skipped")
        rep.target_counts[name] = dst.scalar(select(func.count()).select_from(m)) or 0
        if not merge and rep.target_counts[name] != wrote:
            rep.problems.append(f"{name}: target holds {rep.target_counts[name]} rows, expected {wrote}")

    # Foreign keys: nothing owned by a missing user.
    for m in OWNED:
        orphans = dst.scalar(select(func.count()).select_from(m).where(~m.user_id.in_(select(User.id)))) or 0
        if orphans:
            rep.problems.append(f"{m.__tablename__}: {orphans} rows reference a missing user")

    # Ownership and secrets: same owner, identical hash (compared by digest, never printed).
    for u in src.scalars(select(User)):
        t = dst.get(User, u.id)
        if t is None:
            continue  # skipped (merge), already accounted for
        if (t.email, t.google_sub) != (u.email, u.google_sub):
            rep.problems.append(f"user {_short(u.id)}: identity changed during copy")
        if hashlib.sha256((u.password_hash or "").encode()).digest() != hashlib.sha256((t.password_hash or "").encode()).digest():
            rep.problems.append(f"user {_short(u.id)}: password hash differs after copy")
        for m in (SavedSchema, SavedDataset, GenerationRun):
            a = src.scalar(select(func.count()).select_from(m).where(m.user_id == u.id)) or 0
            b = dst.scalar(select(func.count()).select_from(m).where(m.user_id == u.id)) or 0
            if b > a or (b < a and not rep.skipped.get(m.__tablename__)):
                rep.problems.append(f"user {_short(u.id)}: {m.__tablename__} {a} in source vs {b} in target")


def render(rep: Report) -> str:
    lines = [("DRY RUN: nothing was written to the target." if rep.dry_run else "Migration committed.")]
    lines.append(f"{'table':<20}{'source':>8}{'copied':>8}{'skipped':>9}{'target':>8}")
    for m in TABLES:
        n = m.__tablename__
        lines.append(f"{n:<20}{rep.source_counts.get(n, 0):>8}{rep.copied.get(n, 0):>8}"
                     f"{len(rep.skipped.get(n, [])):>9}{rep.target_counts.get(n, 0):>8}")
    for t, items in rep.skipped.items():
        for i in items:
            lines.append(f"  skipped {t}: {i}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", required=True, type=Path, help="path to the legacy synthora.db")
    ap.add_argument("--target", help="target SQLAlchemy/Postgres URL (default: DATABASE_URL from the environment)")
    ap.add_argument("--allow-sqlite-target", action="store_true", help="local use: migrate into a fresh SQLite file")
    ap.add_argument("--dry-run", action="store_true", help="do everything and verify, then roll back")
    ap.add_argument("--merge", action="store_true", help="allow a non-empty target; existing ids/e-mails are kept")
    ap.add_argument("--skip-invalid", action="store_true", help="leave behind rows whose owner is missing (listed)")
    ap.add_argument("--no-sessions", action="store_true", help="do not copy login sessions")
    a = ap.parse_args(argv)

    target_url = Settings(database_url=a.target).sqlalchemy_url if a.target else Settings().sqlalchemy_url
    if target_url.startswith("sqlite") and not a.allow_sqlite_target:
        print("Refusing to migrate into SQLite: set DATABASE_URL (or --target) to the PostgreSQL URL.", file=sys.stderr)
        return 2
    before = file_digest(a.source)
    target = create_engine(target_url, pool_pre_ping=True)
    try:
        rep = migrate(open_source(a.source), target, dry_run=a.dry_run, merge=a.merge, skip_invalid=a.skip_invalid,
                      copy_sessions=not a.no_sessions)
    except MigrationError as e:
        print(f"ABORTED, target unchanged: {e}", file=sys.stderr)
        return 1
    finally:
        target.dispose()
    if file_digest(a.source) != before:
        print("WARNING: the source file changed while migrating (is the old server still running?).", file=sys.stderr)
        return 3
    print(render(rep))
    print("Source database left untouched (checksum unchanged).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
