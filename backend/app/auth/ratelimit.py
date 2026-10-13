"""Sliding-window rate limiter for sensitive endpoints.

Two backends (RATE_LIMIT_BACKEND):
- memory   per-process counters: reset on restart and not shared between instances (SQLite / local dev).
- database counters in the `rate_limit_events` table, shared by every instance (default with PostgreSQL).
The database backend falls back to memory if the database is unreachable, so a database blip never locks
everyone out of (or silently un-limits) the sign-in endpoints beyond what the in-memory limiter allows.
"""
from __future__ import annotations

import hashlib
import logging
import random
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta

from fastapi import Request
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.auth.errors import ApiError
from app.config import get_settings
from app.db import session_factory
from app.models.db import RateLimitEvent, aware, utcnow

logger = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def check(self, key: str, limit: int, window_s: int) -> int | None:
        """Record one hit; return seconds to wait if the limit is exceeded, else None."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window_s:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(window_s - (now - q[0])) + 1)
            q.append(now)
            if len(self._hits) > 20_000:  # bound memory: drop idle keys
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > window_s]:
                    del self._hits[k]
            return None


limiter = RateLimiter()


def _db_check(key: str, limit: int, window_s: int) -> int | None:
    digest = hashlib.sha256(key.encode()).hexdigest()
    now = utcnow()
    with session_factory()() as db:
        if db.get_bind().dialect.name == "postgresql":  # serialise concurrent checks of the same key
            db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": digest})
        count, oldest = db.execute(
            select(func.count(), func.min(RateLimitEvent.created_at))
            .where(RateLimitEvent.key == digest, RateLimitEvent.created_at > now - timedelta(seconds=window_s))
        ).one()
        if count >= limit:
            db.rollback()
            return max(1, int(window_s - (now - aware(oldest)).total_seconds()) + 1)
        db.add(RateLimitEvent(key=digest, created_at=now))
        if random.random() < 0.02:  # opportunistic cleanup: nothing needs events older than a day
            db.execute(delete(RateLimitEvent).where(RateLimitEvent.created_at < now - timedelta(days=1)))
        db.commit()
        return None


def _check(key: str, limit: int, window_s: int) -> int | None:
    if get_settings().uses_database_rate_limit:
        try:
            return _db_check(key, limit, window_s)
        except SQLAlchemyError:
            logger.warning("Rate-limit database unavailable; using the in-memory limiter for this request")
    return limiter.check(key, limit, window_s)


def client_ip(request: Request) -> str:
    if get_settings().trust_proxy:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce(request: Request, scope: str, limit: int, window_s: int, extra: str = "") -> None:
    if not get_settings().rate_limit_enabled:
        return
    wait = _check(f"{scope}:{client_ip(request)}:{extra}", limit, window_s)
    if wait is not None:
        raise ApiError(429, "rate_limited", f"Too many attempts. Try again in {wait} seconds.",
                       headers={"Retry-After": str(wait)})
