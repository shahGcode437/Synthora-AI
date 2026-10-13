"""Password hashing (Argon2id) and strength rules. Plaintext passwords are never stored or logged."""
from __future__ import annotations

import re

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()  # argon2id with library defaults
# Verified against when the email is unknown, so "no such user" and "wrong password" cost the same time.
DUMMY_HASH = _hasher.hash("synthora-dummy-password-for-timing")

MIN_LEN, MAX_LEN = 10, 128


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: str | None, password: str) -> bool:
    try:
        ok = _hasher.verify(stored_hash or DUMMY_HASH, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return ok and stored_hash is not None


def needs_rehash(stored_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(stored_hash)
    except InvalidHashError:
        return False


def password_problems(password: str, email: str = "", name: str = "") -> list[str]:
    """Human-readable reasons a password is rejected (empty list = acceptable)."""
    problems: list[str] = []
    if len(password) < MIN_LEN:
        problems.append(f"Use at least {MIN_LEN} characters.")
    if len(password) > MAX_LEN:
        problems.append(f"Use at most {MAX_LEN} characters.")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        problems.append("Include at least one letter and one number.")
    low = password.lower()
    if email and low == email.lower():
        problems.append("The password must not be your email address.")
    if len(set(password)) < 4:
        problems.append("The password is too repetitive.")
    if name and len(name) >= 4 and name.lower().replace(" ", "") in low.replace(" ", ""):
        problems.append("The password must not contain your name.")
    return problems
