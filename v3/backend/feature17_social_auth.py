"""
Ciphera V3.3 — Feature 17: Google OAuth2 Social Login
======================================================
Security guarantees:
  - Only requests email + profile scopes — NO contacts, drive, gmail, photos
  - ID token verified against Google's public keys (not just trusted blindly)
  - State parameter prevents CSRF attacks
  - Nonce prevents replay attacks
  - Only name + email extracted from Google response, nothing else stored
  - Existing users matched by email — no duplicate accounts
  - Returns same JWT format as password login — frontend unchanged

Flow:
  1. Frontend hits GET /api/v3/auth/google/init
     → backend generates state+nonce, stores in memory, returns Google auth URL
  2. User authenticates with Google on Google's servers
  3. Google redirects to GET /api/v3/auth/google/callback?code=...&state=...
     → backend verifies state, exchanges code for tokens, verifies ID token,
        extracts ONLY email+name, creates/finds user, returns JWT + redirect
  4. Frontend receives tokens, stores them, redirects to dashboard

Endpoints:
  GET  /api/v3/auth/google/init         — get Google OAuth URL
  GET  /api/v3/auth/google/callback     — handle Google redirect (browser hits this)
  POST /api/v3/auth/google/exchange     — frontend exchanges auth code for JWT
                                          (alternative to redirect flow)

Install:
  pip install google-auth==2.29.0 httpx==0.27.0
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from pydantic import BaseModel

from feature15_auth import (
    get_db, create_access_token, create_refresh_token,
    hash_token,
)

logger = logging.getLogger("ciphera.social_auth")

# ── DB migration — add google_id column if it doesn't exist ──────────────────
def _migrate_google_id():
    """Safe migration — adds google_id column to users table if missing."""
    from feature15_auth import get_db, DB_PATH
    conn = get_db()
    cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "google_id" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN google_id TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id)")
        conn.commit()
        logger.info("Added google_id column to users table")
    conn.close()

_migrate_google_id()

router = APIRouter(prefix="/api/v3/auth", tags=["Social Auth"])

# ── Config — loaded from .env ─────────────────────────────────────────────────
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID",     "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI",  "http://localhost:8000/api/v3/auth/google/callback")

# Where to send the browser after successful OAuth
FRONTEND_SUCCESS_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
FRONTEND_ERROR_URL   = os.getenv("FRONTEND_URL", "http://localhost:3000") + "/login?error=oauth_failed"

# ONLY these scopes — email and basic profile. Nothing else.
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# ── In-memory state store (CSRF protection) ───────────────────────────────────
# Maps state → {nonce, created_at}
# Expires after 10 minutes — prevents replay
_pending_states: dict[str, dict] = {}
_STATE_TTL = 600  # seconds


def _generate_state_nonce() -> tuple[str, str]:
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    _pending_states[state] = {
        "nonce":      nonce,
        "created_at": time.time(),
    }
    # Prune expired states
    now = time.time()
    expired = [k for k, v in _pending_states.items() if now - v["created_at"] > _STATE_TTL]
    for k in expired:
        del _pending_states[k]
    return state, nonce


def _consume_state(state: str) -> Optional[str]:
    """Verify and consume a state token. Returns nonce if valid, None if invalid/expired."""
    entry = _pending_states.pop(state, None)
    if not entry:
        return None
    if time.time() - entry["created_at"] > _STATE_TTL:
        return None
    return entry["nonce"]


# ── User creation/lookup ──────────────────────────────────────────────────────

def _find_or_create_google_user(
    google_id: str,
    email:     str,
    full_name: str,
    # avatar_url deliberately NOT stored — we don't need it
) -> dict:
    """
    Find existing user by email or google_id.
    If new: create account with no password (OAuth only).
    Returns user dict.
    """
    conn = get_db()
    now  = datetime.now(timezone.utc).isoformat()

    # Check if user exists by email first
    user = conn.execute(
        "SELECT * FROM users WHERE email = ?", (email.lower(),)
    ).fetchone()

    if user:
        # Link google_id if not already linked
        if not user["google_id"] if "google_id" in user.keys() else True:
            conn.execute(
                "UPDATE users SET google_id = ?, updated_at = ? WHERE user_id = ?",
                (google_id, now, user["user_id"])
            )
            conn.commit()
        conn.close()
        return dict(user)

    # New user — create account
    # No password_hash — Google users authenticate via Google only
    user_id = f"usr_{secrets.token_hex(12)}"
    conn.execute("""
        INSERT INTO users
        (user_id, email, password_hash, full_name, is_active, is_verified,
         created_at, updated_at, plan, google_id)
        VALUES (?, ?, '', ?, 1, 1, ?, ?, 'free', ?)
    """, (user_id, email.lower(), full_name, now, now, google_id))
    conn.commit()

    user = conn.execute(
        "SELECT * FROM users WHERE user_id = ?", (user_id,)
    ).fetchone()
    conn.close()

    logger.info("New user via Google OAuth: %s", email)
    return dict(user)


def _create_session_for_user(user: dict, ip: str = "oauth") -> tuple[str, str]:
    """Create access + refresh tokens for a user. Returns (access_token, refresh_token)."""
    conn = get_db()

    # Get org membership
    org_row = conn.execute("""
        SELECT org_id, role FROM org_members
        WHERE user_id = ? AND is_active = 1
        ORDER BY joined_at DESC LIMIT 1
    """, (user["user_id"],)).fetchone()

    org_id = org_row["org_id"] if org_row else None
    role   = org_row["role"]   if org_row else "user"

    refresh_token = create_refresh_token()
    session_id    = f"ses_{secrets.token_hex(12)}"
    now           = datetime.now(timezone.utc)
    from datetime import timedelta
    expires_at    = (now + timedelta(days=30)).isoformat()

    conn.execute("""
        INSERT INTO sessions
        (session_id, user_id, refresh_token_hash, device_hint, ip_address,
         created_at, expires_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (session_id, user["user_id"], hash_token(refresh_token),
          "Google OAuth", ip, now.isoformat(), expires_at, now.isoformat()))
    conn.commit()
    conn.close()

    access_token = create_access_token(user["user_id"], user["email"], org_id, role)
    return access_token, refresh_token


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/google/init")
async def google_init():
    """
    Step 1: Generate Google OAuth URL with state + nonce (CSRF protection).
    Frontend opens this URL in the same window or a popup.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "Google OAuth not configured on this server")

    state, nonce = _generate_state_nonce()
    nonce_hash   = hashlib.sha256(nonce.encode()).hexdigest()

    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         " ".join(GOOGLE_SCOPES),
        "state":         state,
        "nonce":         nonce_hash,
        "access_type":   "online",   # no refresh token from Google — we use our own
        "prompt":        "select_account",  # always show account picker
    }

    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return {"url": url, "state": state}


@router.get("/google/callback")
async def google_callback(
    code:  str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
):
    """
    Step 2: Google redirects here after user authenticates.
    Verifies state, exchanges code for ID token, extracts email+name only.
    Redirects browser to frontend with tokens in URL fragment (never in query params).
    """
    # User denied access
    if error:
        logger.warning("Google OAuth error: %s", error)
        return RedirectResponse(url=FRONTEND_ERROR_URL)

    # Verify state (CSRF check)
    nonce = _consume_state(state)
    if not nonce:
        logger.warning("Google OAuth: invalid or expired state")
        return RedirectResponse(url=FRONTEND_ERROR_URL + "&reason=invalid_state")

    # Exchange code for tokens
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(GOOGLE_TOKEN_URL, data={
                "code":          code,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri":  GOOGLE_REDIRECT_URI,
                "grant_type":    "authorization_code",
            })
            token_resp.raise_for_status()
            token_data = token_resp.json()
    except Exception as e:
        logger.error("Google token exchange failed: %s", e)
        return RedirectResponse(url=FRONTEND_ERROR_URL + "&reason=token_exchange_failed")

    id_token_str = token_data.get("id_token")
    if not id_token_str:
        return RedirectResponse(url=FRONTEND_ERROR_URL + "&reason=no_id_token")

    # Verify ID token with Google's public keys
    # This is the critical security step — prevents token forgery
    try:
        id_info = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except Exception as e:
        logger.error("Google ID token verification failed: %s", e)
        return RedirectResponse(url=FRONTEND_ERROR_URL + "&reason=token_verification_failed")

    # Verify nonce (replay attack prevention)
    token_nonce     = id_info.get("nonce", "")
    expected_nonce  = hashlib.sha256(nonce.encode()).hexdigest()
    if token_nonce != expected_nonce:
        logger.warning("Google OAuth: nonce mismatch")
        return RedirectResponse(url=FRONTEND_ERROR_URL + "&reason=nonce_mismatch")

    # Extract ONLY email and name — nothing else
    email     = id_info.get("email", "").lower().strip()
    full_name = id_info.get("name",  "").strip()
    google_id = id_info.get("sub",   "")        # Google's permanent user ID
    verified  = id_info.get("email_verified", False)

    if not email or not verified:
        return RedirectResponse(url=FRONTEND_ERROR_URL + "&reason=email_not_verified")

    # Sanitize name — only keep printable ASCII + common Unicode letters
    import unicodedata
    full_name = "".join(c for c in full_name if unicodedata.category(c)[0] in ("L", "Z", "N"))[:100].strip()
    if not full_name:
        full_name = email.split("@")[0].title()

    # Find or create user
    try:
        user = _find_or_create_google_user(google_id, email, full_name)
    except Exception as e:
        logger.error("User creation failed: %s", e)
        return RedirectResponse(url=FRONTEND_ERROR_URL + "&reason=user_creation_failed")

    if not user.get("is_active"):
        return RedirectResponse(url=FRONTEND_ERROR_URL + "&reason=account_deactivated")

    # Create session tokens
    access_token, refresh_token = _create_session_for_user(user)

    # Redirect to frontend — tokens in URL fragment (#) not query params
    # Fragment never sent to server, only readable by JS — safer than ?token=
    success_url = (
        f"{FRONTEND_SUCCESS_URL}/auth/callback"
        f"#access_token={access_token}"
        f"&refresh_token={refresh_token}"
        f"&user_id={user['user_id']}"
        f"&email={email}"
        f"&full_name={full_name}"
        f"&plan={user.get('plan','free')}"
    )
    return RedirectResponse(url=success_url)


class GoogleExchangeRequest(BaseModel):
    code:  str
    state: str


@router.post("/google/exchange")
async def google_exchange(req: GoogleExchangeRequest):
    """
    Alternative to the redirect flow — for SPAs that prefer a POST response.
    Frontend sends the code+state, gets back JWT tokens directly.
    Same security as callback but returns JSON instead of redirect.
    """
    nonce = _consume_state(req.state)
    if not nonce:
        raise HTTPException(400, "Invalid or expired state parameter")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(GOOGLE_TOKEN_URL, data={
                "code":          req.code,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri":  GOOGLE_REDIRECT_URI,
                "grant_type":    "authorization_code",
            })
            token_resp.raise_for_status()
            token_data = token_resp.json()
    except Exception as e:
        raise HTTPException(400, f"Token exchange failed: {e}")

    id_token_str = token_data.get("id_token")
    if not id_token_str:
        raise HTTPException(400, "No ID token received from Google")

    try:
        id_info = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except Exception as e:
        raise HTTPException(400, f"ID token verification failed: {e}")

    token_nonce    = id_info.get("nonce", "")
    expected_nonce = hashlib.sha256(nonce.encode()).hexdigest()
    if token_nonce != expected_nonce:
        raise HTTPException(400, "Nonce mismatch — possible replay attack")

    email     = id_info.get("email", "").lower().strip()
    full_name = id_info.get("name",  "").strip()
    google_id = id_info.get("sub",   "")
    verified  = id_info.get("email_verified", False)

    if not email or not verified:
        raise HTTPException(400, "Email not verified by Google")

    import unicodedata
    full_name = "".join(c for c in full_name if unicodedata.category(c)[0] in ("L","Z","N"))[:100].strip()
    if not full_name:
        full_name = email.split("@")[0].title()

    user = _find_or_create_google_user(google_id, email, full_name)
    if not user.get("is_active"):
        raise HTTPException(403, "Account deactivated")

    access_token, refresh_token = _create_session_for_user(user)

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    "bearer",
        "expires_in":    900,
        "user": {
            "user_id":   user["user_id"],
            "email":     user["email"],
            "full_name": user["full_name"],
            "plan":      user.get("plan", "free"),
        },
    }
