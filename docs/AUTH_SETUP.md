# Accounts, database, migrations and deployment

## Architecture in one page
- **Database:** PostgreSQL in production (`DATABASE_URL`), SQLite for local development and fast tests. One SQLAlchemy 2 layer (`backend/app/db.py`) serves both; the schema is owned by **Alembic** (`backend/migrations`). The app never creates tables itself.
- **Tables:** `users`, `auth_sessions`, `generation_runs`, `saved_schemas`, `saved_datasets`, `rate_limit_events`. Every user-owned table has `user_id` → `users.id ON DELETE CASCADE` and every query filters by it (other users' items return 404).
- **Sessions:** a random 256-bit token; only its SHA-256 is stored. Browsers get it in an **HttpOnly cookie** (never in `localStorage`); API clients can use `Authorization: Bearer`. Password hashing is Argon2id.
- **CSRF:** cookie-authenticated writes must send `X-CSRF-Token` (derived from the session token, delivered in the login/`/auth/session` JSON, kept in memory only) and, if an `Origin` header is present, it must be an allowed frontend origin. Bearer requests are exempt (not ambient).
- **Rate limits:** stored in the database (`rate_limit_events`, hashed keys) whenever `DATABASE_URL` is not SQLite, so all instances share them. If the database is unreachable the limiter falls back to per-process memory.

## Why the frontend now calls its own origin
An HttpOnly cookie is only sent to the site that set it. The Vercel frontend and the Render API are different sites, so a direct call would need a *third-party* cookie, which Safari and Firefox block. Instead the app calls `/api/...` on its own origin and the host forwards it to the backend:
- Development: Vite proxies `/api` and `/health` to `http://127.0.0.1:8000` (override with `DEV_BACKEND_URL`).
- Production: [`frontend/vercel.json`](../frontend/vercel.json) rewrites `/api/*` and `/health` to the Render URL. **Change that URL if your Render service name differs.**
- Alternative (not recommended): `VITE_API_PROXY=false` calls the backend directly; then set `SESSION_COOKIE_SAMESITE=none` on the backend and accept third-party-cookie blocking. Serving frontend and API under one parent domain (`app.example.com` / `api.example.com` with `SESSION_COOKIE_DOMAIN=.example.com`) also works.
- Unverified: long AI requests (up to 90 s) now pass through Vercel's proxy. Check one `analyze` call on a Vercel preview before relying on it for a demo; if it is cut off, use the same-parent-domain option.

## Environment variables

### Backend (Render)
| Variable | Value / purpose |
|---|---|
| `DATABASE_URL` | **Required in production.** PostgreSQL URL, see below. Defaults to a local SQLite file, which is wiped on every Render deploy. |
| `DB_AUTO_MIGRATE` | `true`: apply pending migrations at startup (advisory-locked, safe with several instances). Unset/`false` for PostgreSQL: startup only *verifies* the schema is current and refuses to start otherwise. SQLite defaults to auto. |
| `TRUST_PROXY` | `true` behind Render so rate limits use the real client IP. |
| `SESSION_COOKIE_SECURE` | `true` in production (otherwise Secure is inferred from the request scheme, which needs `TRUST_PROXY`). |
| `SESSION_COOKIE_SAMESITE` | `lax` (default). `none` only for a genuinely cross-site API (forces Secure). |
| `SESSION_COOKIE_DOMAIN`, `SESSION_COOKIE_NAME` | Optional. Empty domain = host-only cookie. |
| `SESSION_TTL_DAYS` | Session lifetime (default 7). |
| `GOOGLE_CLIENT_ID` | Optional; enables Google sign-in. |
| `AUTH_REQUIRED_FOR_AI` | `true` to require sign-in for analyze/generate/export. |
| `RATE_LIMIT_BACKEND` | `auto` (default: database on PostgreSQL), `database`, or `memory`. |
| `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT_S`, `DB_POOL_RECYCLE_S`, `DB_CONNECT_TIMEOUT_S` | Connection pool (defaults 5 / 5 / 10 / 1800 / 10). Keep `pool_size + max_overflow` per instance below your plan's connection limit. |
| `CORS_ORIGINS`, LLM keys, `MAX_*` | As in `backend/.env.example`. |

### Frontend (Vercel, root `frontend/`)
`VITE_API_BASE_URL` (display/docs link), `VITE_API_PROXY` (default `true`), `VITE_GOOGLE_CLIENT_ID` (optional).

## PostgreSQL
### Provision (Render)
1. Render dashboard → New → PostgreSQL. Pick a region next to your web service.
2. Copy the **Internal Database URL** (same region, private network) into the web service's `DATABASE_URL` env var. Check the plan: free instances have been time-limited and have no automatic backups; confirm current terms before relying on one for real data.

### URL format
```
postgresql://USER:PASSWORD@HOST:5432/DBNAME
postgres://...            # also accepted (Render style)
postgresql://...?sslmode=require   # for external connections
```
The app rewrites these to the `psycopg` v3 driver (`postgresql+psycopg://`); you never need to type the driver.

### Initialise a new database / apply changes
From `backend/`, with `DATABASE_URL` in the environment:
```
alembic upgrade head          # creates everything on an empty database; a no-op when already current
alembic current               # shows the applied revision
alembic history               # lists revisions
```
**Render start command** (works on the free tier, which has no pre-deploy hook):
```
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```
Re-deploys simply re-run it; with nothing pending it does nothing. Concurrent starters are serialised by a PostgreSQL advisory lock.

### Changing the schema safely
1. Edit the model in `backend/app/models/db.py`.
2. `alembic revision --autogenerate -m "add xyz"` → **review the generated file** (autogenerate misses data migrations, renames and some constraints) and commit it.
3. `pytest backend/tests/test_migrations.py`: a "no drift" test fails if models and migrations disagree.
4. Deploy: the start command applies it. Prefer additive, backwards-compatible steps (add nullable column → deploy code → backfill → add constraint) so a rollback of the app is safe. `alembic downgrade -1` exists for every revision but is for development; never run it against production data without a backup.

## Moving existing SQLite data
Inspected state at the time of writing: the local `synthora.db` held only test data (2 test accounts, 1 demo dataset). Nothing in it needs preserving, but the utility exists and is tested:
```
cd backend
alembic upgrade head                                   # target must be migrated first
python -m scripts.migrate_sqlite_to_postgres --source ../synthora.db --dry-run
python -m scripts.migrate_sqlite_to_postgres --source ../synthora.db
```
It opens the source read-only and proves it unchanged by checksum; writes in one transaction (any error rolls back); refuses a non-empty target unless `--merge` (which never overwrites an id or e-mail); skips expired sessions; aborts on rows with no owner unless `--skip-invalid` (and lists them); verifies counts per table and per user, foreign keys, and password-hash equality (by digest). Output contains counts and short ids only. Keep the SQLite file until you have verified the target.

A SQLite file created before migrations existed has tables but no version history; the app refuses to run migrations over it ("has NOT been touched"). Delete it if disposable, or migrate it with the utility (`--allow-sqlite-target` into a fresh file).

## Backup and restore
- Prefer the provider's automated backups / point-in-time recovery (paid plans). Test a restore at least once.
- Manual logical backup (store the file encrypted, outside the repo):
  ```
  pg_dump --format=custom --no-owner "$DATABASE_URL" > synthora-$(date +%F).dump
  ```
- Restore into an **empty** database, then confirm the app starts:
  ```
  pg_restore --no-owner --dbname "$TARGET_URL" synthora-2026-10-13.dump
  alembic current
  ```
- Backups contain password hashes and user data: treat them as secrets.

## Handling database credentials
- The URL (with password) lives only in the hosting provider's environment settings. It is never committed (`.env` is git-ignored), never printed (the app logs exception *types* only; the migration utility prints counts and short ids), and not placed in `alembic.ini`.
- Use the internal URL inside Render; use a separate low-privilege database/user for tests. The test suite wipes whatever `TEST_DATABASE_URL` points at and refuses names without `test`.
- If a URL is ever pasted into chat, a ticket or a log, rotate the database password.

## Google sign-in
Google Cloud Console → Credentials → OAuth client (Web). Authorized JavaScript origins: `http://localhost:5173` and your Vercel origin. Set `GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend). The backend verifies the ID token server-side; tests use a mocked verifier. **Not exercised live in this repository**: do one real sign-in after deploying.

## Tests
```
cd backend && .venv/Scripts/python -m pytest -q            # SQLite (in-memory), migrations applied for real
cd backend && TEST_DATABASE_URL=postgresql://user:pass@localhost:5433/synthora_test python -m pytest -q   # PostgreSQL
cd frontend && npm run build && npx vitest run
```
The default run uses SQLite. **PostgreSQL-specific behaviour (advisory locks, `TRUNCATE`, timestamptz, the generated DDL) has not been executed in this repository's test runs**: the DDL was only rendered offline (`alembic upgrade head --sql`). Run the PostgreSQL command above (Docker: `docker run -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=synthora_test -p 5433:5432 postgres:16`) before relying on it.

## Remaining limitations (honest list)
- **No e-mail verification and no password reset** (they need an e-mail provider). Password sign-ups are not verified; Google accounts are verified by Google. A user who forgets their password cannot recover the account except via Google linking.
- The session cookie design needs the same-origin forwarding described above; a direct cross-site API call depends on third-party-cookie support.
- Rate limiting counts per client IP and per e-mail; behind several proxies the first `X-Forwarded-For` hop is trusted when `TRUST_PROXY=true`, so only enable it behind a proxy that overwrites that header.
- `rate_limit_events` is pruned opportunistically (about 2 % of limited requests); a scheduled cleanup is not set up.
- History stores plans and validation summaries, not generated rows.
- API key rotation (including the previously exposed Qwen key) is done in the provider's console and cannot be done from this repository. The key is not present in any tracked file or git history, and the local `.env` currently has `QWEN_API_KEY` empty; confirm in the provider console that the exposed key is revoked.

## Endpoints (all under `/api/v1`)
`auth/signup`, `auth/login`, `auth/google`, `auth/logout`, `auth/session`, `auth/me` (GET/PATCH), `auth/change-password`, `auth/sessions` (GET/DELETE), `auth/sessions/{id}` (DELETE), `auth/delete-account`, `history` (GET/DELETE), `history/{id}` (GET/DELETE), `overview`, `schemas` (+`/{id}`), `datasets` (+`/{id}`, `/{id}/data`).
Error codes: `not_authenticated`, `invalid_credentials`, `weak_password`, `email_taken`, `email_not_verified`, `csrf_failed`, `rate_limited` (with `Retry-After`), `limit_reached`, `invalid_dataset`, `dataset_too_large`, `conflict`, `database_unavailable` (503, `Retry-After`), `database_error`, `invalid_google_token`, `google_not_configured`, `google_unavailable`.
