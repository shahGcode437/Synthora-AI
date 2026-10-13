# Saved work, database, migrations and deployment

Synthora has **no accounts and no login**. Everything works on first open: describe or upload data, review the plan, generate, preview, validate and export.

## What is saved, and where
- **History, saved schemas (plans) and saved datasets** are stored in the backend database and belong to an **anonymous workspace**: a random 128-bit id that each browser creates for itself (`localStorage` key `synthora.workspace.v1`) and sends in the `X-Workspace-Id` header. Clearing site data creates a new, empty workspace.
- The id is an identifier, **not a password**. Anyone who obtains it can read and delete that workspace, so do not treat saved datasets as private on a public deployment. Generated data is synthetic, and nothing sensitive should be uploaded to a shared instance regardless.
- Settings (theme, defaults) are stored only in the browser.
- Generation itself (`analyze`, `generate`, `export`) needs no workspace id. A `generate` call that carries one is recorded in that workspace's history (plan and validation summary only, never the rows).
- Limits per workspace: `MAX_HISTORY_PER_WORKSPACE` (300), `MAX_SCHEMAS_PER_WORKSPACE` (50), `MAX_DATASETS_PER_WORKSPACE` (10), `MAX_DATASET_BYTES` (10 MB).

## Database
- **Local default:** SQLite at `backend/synthora.db` (same file whichever directory you start the server from). Migrations are applied automatically at startup.
- **Production:** PostgreSQL via `DATABASE_URL`. One SQLAlchemy 2 layer serves both; the schema is owned by **Alembic** (`backend/migrations`). The app never creates tables itself.
- **Tables:** `generation_runs`, `saved_schemas`, `saved_datasets`, each with `workspace_id` (indexed; history and datasets also have a `(workspace_id, created_at)` index). Every query filters by `workspace_id`; another workspace's item returns 404.

### Existing local databases
- A database created by an earlier version (it has `users` / `auth_sessions` tables and no migration history) is **refused, not modified**: the app prints "has NOT been touched". Delete it if its data is disposable, or keep it as a backup and start fresh. Account data cannot be carried over because accounts no longer exist.
- The migration history was squashed to one revision (`0001`) for the account-free schema. Nothing had been deployed with data on the previous revisions.

### URL format
```
postgresql://USER:PASSWORD@HOST:5432/DBNAME        # postgres:// is also accepted
postgresql://...?sslmode=require                    # external connections
```
The app rewrites these to the `psycopg` v3 driver; you never type the driver.

### Initialise and upgrade (from `backend/`, with `DATABASE_URL` set)
```
alembic upgrade head      # empty database: creates everything; current database: no-op
alembic current           # applied revision
```
Startup behaviour (`DB_AUTO_MIGRATE`): SQLite migrates automatically. For PostgreSQL either set `DB_AUTO_MIGRATE=true` (applies pending migrations at startup, serialised by an advisory lock), or run `alembic upgrade head` in the start command and leave it unset (startup then only verifies the schema and refuses to start if it is behind).

### Changing the schema safely
1. Edit `backend/app/models/db.py`.
2. `alembic revision --autogenerate -m "describe change"` and **review the generated file**.
3. `pytest backend/tests/test_migrations.py` fails if models and migrations drift.
4. Prefer additive, backwards-compatible steps. Never run `alembic downgrade` against production data without a backup.

## Render (backend)
- Root directory `backend`; build `pip install -r requirements.txt`.
- Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment: `DATABASE_URL` (Render Postgres **Internal Database URL**), LLM keys, optional `CORS_ORIGINS`. Without `DATABASE_URL` it falls back to SQLite on the ephemeral disk: everything works, but saved work vanishes on each deploy.
- Pool: keep `DB_POOL_SIZE + DB_MAX_OVERFLOW` below your plan's connection limit.

## Vercel (frontend, root `frontend/`)
`VITE_API_BASE_URL` = the Render URL. Nothing else is required. The browser calls the backend directly (CORS allows the Vercel origin and `localhost:5173`; credentials are not used).

## Backup and restore (PostgreSQL)
- Prefer the provider's automated backups; test a restore once.
- Manual: `pg_dump --format=custom --no-owner "$DATABASE_URL" > synthora-$(date +%F).dump`
- Restore into an empty database: `pg_restore --no-owner --dbname "$TARGET_URL" file.dump`, then `alembic current`.
- Dumps hold user data: keep them encrypted and out of the repository.

## Database credentials
The URL (with password) lives only in the host's environment settings, never in git (`.env` is ignored), never in `alembic.ini`, and never in logs (errors are logged by type only). Use a separate throwaway database for tests; the suite wipes whatever `TEST_DATABASE_URL` points at and refuses names without `test`. If a URL leaks, rotate the password.

## Tests
```
cd backend && .venv/Scripts/python -m pytest -q                                  # SQLite (in-memory), real migrations
cd backend && TEST_DATABASE_URL=postgresql://user:pass@localhost:5433/synthora_test python -m pytest -q   # PostgreSQL
cd frontend && npx tsc --noEmit && npx vitest run && npm run build
```
The default run uses SQLite. **PostgreSQL-specific behaviour (advisory locks, `TRUNCATE`, timestamptz, psycopg pooling) has not been executed in these test runs**; the PostgreSQL DDL was only rendered offline (`alembic upgrade head --sql`). Run the PostgreSQL command (for example against `docker run -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=synthora_test -p 5433:5432 postgres:16`) before relying on it.

## Endpoints
`history` (GET list / GET `/{id}` / DELETE `/{id}` / DELETE all), `overview`, `schemas` (+`/{id}`), `datasets` (+`/{id}`, `/{id}/data`) under `/api/v1`, all requiring `X-Workspace-Id`.
Error codes: `workspace_required`, `invalid_workspace` (400), `not_found` (404), `limit_reached` (409), `invalid_dataset` (422), `dataset_too_large` (413), `conflict` (409), `database_unavailable` (503, `Retry-After`), `database_error`.
