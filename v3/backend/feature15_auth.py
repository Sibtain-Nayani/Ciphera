"""
Ciphera V3.2 — Feature 15: Production Authentication System
============================================================
Full JWT-based auth with:
  - User registration + email/password login
  - Bcrypt password hashing (never store plaintext)
  - JWT access tokens (15 min) + refresh tokens (30 days)
  - Session tracking — device, IP, last seen
  - Rate limiting on auth endpoints (brute-force protection)
  - Account lockout after 5 failed attempts
  - Secure token rotation on refresh

Schema (shared SQLite DB):
  users            — accounts
  sessions         — active JWT sessions
  login_attempts   — brute-force tracking

Endpoints:
  POST /api/v3/auth/register       — create account
  POST /api/v3/auth/login          — get access + refresh tokens
  POST /api/v3/auth/refresh        — rotate tokens
  POST /api/v3/auth/logout         — invalidate session
  GET  /api/v3/auth/me             — current user info
  POST /api/v3/auth/change-password
  POST /api/v3/auth/logout-all     — invalidate all sessions (security)

Install:
  pip install bcrypt==4.1.3 PyJWT==2.8.0 python-multipart
"""

from __future__ import annotations

import os
import sqlite3
import secrets
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional
from collections import defaultdict

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger("ciphera.auth")
router = APIRouter(prefix="/api/v3/auth", tags=["Authentication"])

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH       = Path(__file__).parent / "data" / "ciphera.db"
DB_PATH.parent.mkdir(exist_ok=True)

JWT_SECRET         = os.getenv("CIPHERA_JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM      = "HS256"
ACCESS_TOKEN_MINS  = 15
REFRESH_TOKEN_DAYS = 30
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES    = 15

# ── In-memory rate limiter (resets on restart — fine for now) ─────────────────
_attempt_counts: dict[str, list[datetime]] = defaultdict(list)

def _check_rate_limit(ip: str, window_minutes: int = 5, max_attempts: int = 10):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=window_minutes)
    _attempt_counts[ip] = [t for t in _attempt_counts[ip] if t > cutoff]
    if len(_attempt_counts[ip]) >= max_attempts:
        raise HTTPException(429, "Too many requests. Try again later.")
    _attempt_counts[ip].append(now)


# ── DB setup ──────────────────────────────────────────────────────────────────
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id         TEXT PRIMARY KEY,
            email           TEXT UNIQUE NOT NULL,
            password_hash   TEXT NOT NULL,
            full_name       TEXT NOT NULL,
            is_active       INTEGER DEFAULT 1,
            is_verified     INTEGER DEFAULT 0,
            failed_attempts INTEGER DEFAULT 0,
            locked_until    TEXT,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL,
            last_login_at   TEXT,
            plan            TEXT DEFAULT 'free'
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS sessions (
            session_id      TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            refresh_token_hash TEXT UNIQUE NOT NULL,
            device_hint     TEXT,
            ip_address      TEXT,
            created_at      TEXT NOT NULL,
            expires_at      TEXT NOT NULL,
            last_used_at    TEXT NOT NULL,
            is_active       INTEGER DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token_hash);

        CREATE TABLE IF NOT EXISTS login_attempts (
            attempt_id  TEXT PRIMARY KEY,
            email       TEXT NOT NULL,
            ip_address  TEXT,
            success     INTEGER DEFAULT 0,
            attempted_at TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()
    logger.info("Auth DB initialised at %s", DB_PATH)


init_db()


# ── Password utils ────────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── JWT utils ─────────────────────────────────────────────────────────────────
def create_access_token(user_id: str, email: str, org_id: Optional[str], role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub":    user_id,
        "email":  email,
        "org_id": org_id,
        "role":   role,
        "type":   "access",
        "iat":    now,
        "exp":    now + timedelta(minutes=ACCESS_TOKEN_MINS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Access token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid access token")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ── Auth dependency ───────────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not credentials:
        raise HTTPException(401, "Authentication required")
    payload = decode_access_token(credentials.credentials)
    # Verify user still exists + active
    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE user_id = ? AND is_active = 1",
        (payload["sub"],)
    ).fetchone()
    conn.close()
    if not user:
        raise HTTPException(401, "User not found or deactivated")
    return {**payload, "user": dict(user)}


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ("admin", "org_admin"):
        raise HTTPException(403, "Admin access required")
    return current_user


# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email:     EmailStr
    password:  str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=100)

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str = Field(..., min_length=8)

class AuthResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    expires_in:    int = ACCESS_TOKEN_MINS * 60
    user:          dict

class UserResponse(BaseModel):
    user_id:    str
    email:      str
    full_name:  str
    plan:       str
    created_at: str
    org_id:     Optional[str] = None
    role:       Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(req: RegisterRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip, window_minutes=10, max_attempts=5)

    conn = get_db()
    existing = conn.execute("SELECT user_id FROM users WHERE email = ?", (req.email,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(409, "An account with this email already exists")

    # Password strength
    if len(req.password) < 8:
        conn.close()
        raise HTTPException(400, "Password must be at least 8 characters")

    now       = datetime.now(timezone.utc).isoformat()
    user_id   = f"usr_{secrets.token_hex(12)}"
    pwd_hash  = hash_password(req.password)

    conn.execute("""
        INSERT INTO users (user_id, email, password_hash, full_name, is_active, is_verified, created_at, updated_at, plan)
        VALUES (?, ?, ?, ?, 1, 0, ?, ?, 'free')
    """, (user_id, req.email.lower(), pwd_hash, req.full_name, now, now))
    conn.commit()

    # Create session
    refresh_token = create_refresh_token()
    session_id    = f"ses_{secrets.token_hex(12)}"
    expires_at    = (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS)).isoformat()

    conn.execute("""
        INSERT INTO sessions (session_id, user_id, refresh_token_hash, ip_address, created_at, expires_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (session_id, user_id, hash_token(refresh_token), ip, now, expires_at, now))
    conn.commit()
    conn.close()

    access_token = create_access_token(user_id, req.email.lower(), None, "user")
    logger.info("New user registered: %s", req.email)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={"user_id": user_id, "email": req.email.lower(), "full_name": req.full_name, "plan": "free"},
    )


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip, window_minutes=5, max_attempts=10)

    conn   = get_db()
    user   = conn.execute("SELECT * FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
    now    = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Log attempt
    conn.execute("""
        INSERT INTO login_attempts (attempt_id, email, ip_address, success, attempted_at)
        VALUES (?, ?, ?, 0, ?)
    """, (secrets.token_hex(8), req.email.lower(), ip, now_iso))

    if not user:
        conn.commit(); conn.close()
        raise HTTPException(401, "Invalid email or password")

    # Check lockout
    if user["locked_until"]:
        locked_until = datetime.fromisoformat(user["locked_until"])
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if now < locked_until:
            remaining = int((locked_until - now).total_seconds() / 60) + 1
            conn.close()
            raise HTTPException(423, f"Account locked. Try again in {remaining} minutes.")

    if not user["is_active"]:
        conn.close()
        raise HTTPException(403, "Account deactivated. Contact support.")

    if not verify_password(req.password, user["password_hash"]):
        # Increment failed attempts
        attempts = user["failed_attempts"] + 1
        lock_sql = ""
        lock_val = []
        if attempts >= MAX_LOGIN_ATTEMPTS:
            lock_until = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            lock_sql   = ", locked_until = ?"
            lock_val   = [lock_until]
            logger.warning("Account locked: %s after %d failed attempts", req.email, attempts)

        conn.execute(
            f"UPDATE users SET failed_attempts = ?, updated_at = ?{lock_sql} WHERE user_id = ?",
            [attempts, now_iso] + lock_val + [user["user_id"]]
        )
        conn.commit(); conn.close()
        remaining_attempts = MAX_LOGIN_ATTEMPTS - attempts
        if remaining_attempts <= 0:
            raise HTTPException(423, f"Account locked for {LOCKOUT_MINUTES} minutes due to too many failed attempts.")
        raise HTTPException(401, f"Invalid email or password. {remaining_attempts} attempts remaining.")

    # Success — reset failed attempts
    conn.execute("""
        UPDATE users SET failed_attempts = 0, locked_until = NULL,
        last_login_at = ?, updated_at = ? WHERE user_id = ?
    """, (now_iso, now_iso, user["user_id"]))

    # Update attempt log to success
    conn.execute("""
        UPDATE login_attempts SET success = 1
        WHERE email = ? AND attempted_at = ?
    """, (req.email.lower(), now_iso))

    # Get org membership + role
    org_row = conn.execute("""
        SELECT om.org_id, om.role FROM org_members om
        WHERE om.user_id = ? AND om.is_active = 1
        ORDER BY om.joined_at DESC LIMIT 1
    """, (user["user_id"],)).fetchone()

    org_id = org_row["org_id"] if org_row else None
    role   = org_row["role"]   if org_row else "user"

    # Create session
    refresh_token = create_refresh_token()
    session_id    = f"ses_{secrets.token_hex(12)}"
    expires_at    = (now + timedelta(days=REFRESH_TOKEN_DAYS)).isoformat()
    device_hint   = request.headers.get("User-Agent", "")[:120]

    conn.execute("""
        INSERT INTO sessions (session_id, user_id, refresh_token_hash, device_hint, ip_address, created_at, expires_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (session_id, user["user_id"], hash_token(refresh_token), device_hint, ip, now_iso, expires_at, now_iso))
    conn.commit()
    conn.close()

    access_token = create_access_token(user["user_id"], user["email"], org_id, role)
    logger.info("Login: %s from %s", req.email, ip)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "user_id":   user["user_id"],
            "email":     user["email"],
            "full_name": user["full_name"],
            "plan":      user["plan"],
            "org_id":    org_id,
            "role":      role,
        },
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(req: RefreshRequest, request: Request):
    ip       = request.client.host if request.client else "unknown"
    tok_hash = hash_token(req.refresh_token)
    now      = datetime.now(timezone.utc)
    now_iso  = now.isoformat()

    conn    = get_db()
    session = conn.execute(
        "SELECT * FROM sessions WHERE refresh_token_hash = ? AND is_active = 1",
        (tok_hash,)
    ).fetchone()

    if not session:
        conn.close()
        raise HTTPException(401, "Invalid or expired refresh token")

    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        conn.execute("UPDATE sessions SET is_active = 0 WHERE session_id = ?", (session["session_id"],))
        conn.commit(); conn.close()
        raise HTTPException(401, "Refresh token expired. Please log in again.")

    user = conn.execute(
        "SELECT * FROM users WHERE user_id = ? AND is_active = 1",
        (session["user_id"],)
    ).fetchone()

    if not user:
        conn.close()
        raise HTTPException(401, "User not found")

    # Rotate refresh token (invalidate old, issue new)
    new_refresh   = create_refresh_token()
    new_ses_id    = f"ses_{secrets.token_hex(12)}"
    new_expires   = (now + timedelta(days=REFRESH_TOKEN_DAYS)).isoformat()

    conn.execute("UPDATE sessions SET is_active = 0 WHERE session_id = ?", (session["session_id"],))
    conn.execute("""
        INSERT INTO sessions (session_id, user_id, refresh_token_hash, device_hint, ip_address, created_at, expires_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (new_ses_id, user["user_id"], hash_token(new_refresh),
          session["device_hint"], ip, now_iso, new_expires, now_iso))

    org_row = conn.execute("""
        SELECT om.org_id, om.role FROM org_members om
        WHERE om.user_id = ? AND om.is_active = 1
        ORDER BY om.joined_at DESC LIMIT 1
    """, (user["user_id"],)).fetchone()

    org_id = org_row["org_id"] if org_row else None
    role   = org_row["role"]   if org_row else "user"

    conn.commit()
    conn.close()

    access_token = create_access_token(user["user_id"], user["email"], org_id, role)

    return AuthResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user={
            "user_id":   user["user_id"],
            "email":     user["email"],
            "full_name": user["full_name"],
            "plan":      user["plan"],
            "org_id":    org_id,
            "role":      role,
        },
    )


@router.post("/logout")
async def logout(
    req: RefreshRequest,
    current_user: dict = Depends(get_current_user),
):
    tok_hash = hash_token(req.refresh_token)
    conn     = get_db()
    conn.execute(
        "UPDATE sessions SET is_active = 0 WHERE refresh_token_hash = ? AND user_id = ?",
        (tok_hash, current_user["sub"])
    )
    conn.commit()
    conn.close()
    return {"ok": True, "message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all(current_user: dict = Depends(get_current_user)):
    """Invalidate all sessions — use after suspected compromise."""
    conn = get_db()
    conn.execute(
        "UPDATE sessions SET is_active = 0 WHERE user_id = ?",
        (current_user["sub"],)
    )
    conn.commit()
    conn.close()
    return {"ok": True, "message": "All sessions invalidated"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    u = current_user["user"]
    return UserResponse(
        user_id=u["user_id"],
        email=u["email"],
        full_name=u["full_name"],
        plan=u["plan"],
        created_at=u["created_at"],
        org_id=current_user.get("org_id"),
        role=current_user.get("role", "user"),
    )


@router.get("/sessions")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    """List all active sessions for current user — for security review."""
    conn = get_db()
    rows = conn.execute("""
        SELECT session_id, device_hint, ip_address, created_at, last_used_at, expires_at
        FROM sessions WHERE user_id = ? AND is_active = 1
        ORDER BY last_used_at DESC
    """, (current_user["sub"],)).fetchall()
    conn.close()
    return {"sessions": [dict(r) for r in rows]}


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE user_id = ?", (current_user["sub"],)
    ).fetchone()

    if not verify_password(req.current_password, user["password_hash"]):
        conn.close()
        raise HTTPException(400, "Current password is incorrect")

    new_hash = hash_password(req.new_password)
    now_iso  = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?",
        (new_hash, now_iso, current_user["sub"])
    )
    # Invalidate all other sessions on password change (security best practice)
    conn.execute(
        "UPDATE sessions SET is_active = 0 WHERE user_id = ?",
        (current_user["sub"],)
    )
    conn.commit()
    conn.close()
    return {"ok": True, "message": "Password changed. Please log in again."}


@router.get("/health")
async def auth_health():
    return {"status": "ok", "service": "ciphera-auth"}
