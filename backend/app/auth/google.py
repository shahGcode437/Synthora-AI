"""Verify a Google Sign-In ID token (Google Identity Services). Runs only on the server."""
from __future__ import annotations

from dataclasses import dataclass

from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.auth.errors import ApiError

_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str
    picture: str | None


def verify_google_credential(credential: str, client_id: str) -> GoogleIdentity:
    """Checks signature, expiry, issuer and that the token was issued for OUR client id."""
    if not client_id:
        raise ApiError(503, "google_not_configured", "Google sign-in is not configured on this server.")
    try:
        info = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    except (ValueError, GoogleAuthError):
        raise ApiError(401, "invalid_google_token", "Google sign-in could not be verified. Please try again.") from None
    except Exception:  # network failure while fetching Google's public keys
        raise ApiError(503, "google_unavailable", "Google could not be reached. Please try again.") from None
    if info.get("iss") not in _ISSUERS or not info.get("sub") or not info.get("email"):
        raise ApiError(401, "invalid_google_token", "Google sign-in could not be verified. Please try again.")
    return GoogleIdentity(
        sub=str(info["sub"]), email=str(info["email"]).lower(), email_verified=bool(info.get("email_verified")),
        name=str(info.get("name") or str(info["email"]).split("@")[0])[:80], picture=info.get("picture"),
    )
