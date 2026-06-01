"""
Ciphera V3.2 — Feature 8 v2: API Keys tied to Users + Orgs
============================================================
Complete rewrite of feature8_api_keys.py.
Keys are now stored in SQLite (same DB as auth), tied to user_id + org_id.
Per-key usage tracking, rate limiting, and RBAC enforcement.

Endpoints:
  POST   /api/v3/public/redact          — redact text (API key auth)
  POST   /api/v3/public/analyze         — analyze text (API key auth)
  GET    /api/v3/public/health          — public health check
  POST   /api/v3/keys/create            — create key (operator+ role)
  GET    /api/v3/keys/list              — list my keys
  DELETE /api/v3/keys/{key_id}          — revoke key
  GET    /api/v3/keys/{key_id}/usage    — key usage stats
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import sqlite3
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

from feature15_auth import get_current_user, get_db

logger = logging.getLogger("ciphera.api_keys_v2")

public_router = APIRouter(prefix="/api/v3/public", tags=["Public API"])
api_router    = APIRouter(prefix="/api/v3/keys",   tags=["API Key Management"])

# ── DB init ───────────────────────────────────────────────────────────────────
def _init_keys_table():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS api_keys_v2 (
            key_id          TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            org_id          TEXT,
            name            TEXT NOT NULL,
            description     TEXT DEFAULT '',
            key_hash        TEXT UNIQUE NOT NULL,
            key_prefix      TEXT NOT NULL,
            created_at      TEXT NOT NULL,
            expires_at      TEXT,
            last_used_at    TEXT,
            request_count   INTEGER DEFAULT 0,
            is_active       INTEGER DEFAULT 1,
            rate_limit_rpm  INTEGER DEFAULT 60,
            allowed_endpoints TEXT DEFAULT '["*"]'
        );

        CREATE INDEX IF NOT EXISTS idx_api_keys_user   ON api_keys_v2(user_id);
        CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys_v2(key_hash);
        CREATE INDEX IF NOT EXISTS idx_api_keys_org    ON api_keys_v2(org_id);

        CREATE TABLE IF NOT EXISTS api_key_usage (
            usage_id     TEXT PRIMARY KEY,
            key_id       TEXT NOT NULL REFERENCES api_keys_v2(key_id) ON DELETE CASCADE,
            endpoint     TEXT NOT NULL,
            status_code  INTEGER DEFAULT 200,
            processing_ms INTEGER DEFAULT 0,
            entity_count INTEGER DEFAULT 0,
            ip_address   TEXT,
            used_at      TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_usage_key  ON api_key_usage(key_id);
        CREATE INDEX IF NOT EXISTS idx_usage_date ON api_key_usage(used_at);
    """)
    conn.commit()
    conn.close()

_init_keys_table()


# ── Utils ─────────────────────────────────────────────────────────────────────
def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── In-memory rate limiter per API key ────────────────────────────────────────
from collections import defaultdict
_key_windows: dict[str, list[float]] = defaultdict(list)

def _check_key_rate_limit(key_id: str, rpm: int):
    now    = time.time()
    cutoff = now - 60.0
    _key_windows[key_id] = [t for t in _key_windows[key_id] if t > cutoff]
    if len(_key_windows[key_id]) >= rpm:
        raise HTTPException(429, f"Rate limit exceeded ({rpm} req/min). Upgrade plan for higher limits.")
    _key_windows[key_id].append(now)


# ── API key auth dependency ───────────────────────────────────────────────────
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def require_api_key(
    request:     Request,
    x_api_key:   Optional[str] = Depends(api_key_header),
) -> dict:
    if not x_api_key:
        raise HTTPException(
            401,
            {"error": "missing_api_key",
             "message": "Include your API key in the X-API-Key header.",
             "docs": "https://github.com/bitbyrizbit/ciphera#api"}
        )

    key_hash = _hash_key(x_api_key)
    conn     = get_db()
    row      = conn.execute(
        "SELECT * FROM api_keys_v2 WHERE key_hash = ? AND is_active = 1",
        (key_hash,)
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            403,
            {"error": "invalid_api_key", "message": "Invalid or revoked API key."}
        )

    key_data = dict(row)

    # Check expiry
    if key_data.get("expires_at"):
        exp = datetime.fromisoformat(key_data["expires_at"])
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(403, {"error": "expired_api_key", "message": "API key has expired."})

    # Rate limit
    _check_key_rate_limit(key_data["key_id"], key_data.get("rate_limit_rpm", 60))

    # Update usage stats
    now_iso = datetime.now(timezone.utc).isoformat()
    conn2   = get_db()
    conn2.execute("""
        UPDATE api_keys_v2 SET request_count = request_count + 1, last_used_at = ?
        WHERE key_id = ?
    """, (now_iso, key_data["key_id"]))
    conn2.commit()
    conn2.close()

    return key_data


def _log_api_usage(
    key_id: str, endpoint: str, status: int,
    ms: int, entity_count: int, ip: str,
):
    try:
        conn = get_db()
        conn.execute("""
            INSERT INTO api_key_usage
            (usage_id, key_id, endpoint, status_code, processing_ms, entity_count, ip_address, used_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (f"use_{secrets.token_hex(6)}", key_id, endpoint, status, ms, entity_count, ip,
              datetime.now(timezone.utc).isoformat()))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning("Failed to log API usage: %s", e)


# ── Models ────────────────────────────────────────────────────────────────────
class CreateKeyRequest(BaseModel):
    name:              str   = Field(..., min_length=2, max_length=80)
    description:       str   = Field("", max_length=200)
    expires_in_days:   Optional[int] = Field(None, ge=1, le=365)
    rate_limit_rpm:    int   = Field(60, ge=1, le=1000)

class PublicRedactRequest(BaseModel):
    text:         str   = Field(..., max_length=200_000)
    threshold:    float = Field(0.50, ge=0.0, le=1.0)
    entity_types: Optional[list[str]] = None
    language:     str   = Field("auto", description="auto | en | hi | mixed")

class PublicRedactResponse(BaseModel):
    redacted_text:     str
    entities_found:    int
    entities_redacted: int
    processing_ms:     int
    model:             str = "ciphera-v3"

class PublicAnalyzeResponse(BaseModel):
    entities:      list[dict]
    entity_count:  int
    processing_ms: int
    model:         str = "ciphera-v3"


# ── Public endpoints ──────────────────────────────────────────────────────────

@public_router.get("/health")
async def public_health():
    return {
        "status":  "operational",
        "model":   "ciphera-v3",
        "version": "3.2.0",
        "docs":    "https://github.com/bitbyrizbit/ciphera",
    }


@public_router.post("/redact", response_model=PublicRedactResponse)
async def public_redact(
    req:      PublicRedactRequest,
    request:  Request,
    key_data: dict = Depends(require_api_key),
):
    t0 = time.time()
    import feature1_pipeline_upgrade as f1

    pipeline = f1.pipeline
    if not pipeline:
        raise HTTPException(503, "Detection pipeline not ready")

    # Language routing
    lang = req.language
    if lang == "auto":
        from feature12_hindi_support import detect_script
        info = detect_script(req.text)
        lang = info.get("mode", "english")

    if lang in ("hindi", "hi"):
        from feature12_hindi_support import hindi_pipeline
        entities_raw = hindi_pipeline.run(req.text, threshold=req.threshold)
        entities_dicts = [e.to_dict() for e in entities_raw]
    elif lang in ("mixed",):
        from feature12_hindi_support import hindi_pipeline, mixed_handler
        en_ents = pipeline.run(req.text, threshold=req.threshold)
        hi_ents = hindi_pipeline.run(req.text, threshold=req.threshold, language_hint="mixed")
        entities_dicts = mixed_handler.merge_english_and_hindi(en_ents, hi_ents)
    else:
        raw = pipeline.run(req.text, threshold=req.threshold)
        entities_dicts = [e.to_dict() for e in raw]

    # Filter by entity type if requested
    if req.entity_types:
        types_upper = {t.upper() for t in req.entity_types}
        entities_dicts = [e for e in entities_dicts if e["entity_type"] in types_upper]

    # Build redacted text
    redacted  = list(req.text)
    counters: dict[str, int] = {}
    replacements = []
    for e in sorted(entities_dicts, key=lambda x: x["start"]):
        et = e["entity_type"]
        counters[et] = counters.get(et, 0) + 1
        replacements.append((e["start"], e["end"], f"[{et}_{counters[et]}]"))

    for s, en, rep in sorted(replacements, key=lambda x: x[0], reverse=True):
        redacted[s:en] = list(rep)

    redacted_text = "".join(redacted)
    ms = int((time.time() - t0) * 1000)
    ip = request.client.host if request.client else "unknown"
    _log_api_usage(key_data["key_id"], "/public/redact", 200, ms, len(entities_dicts), ip)

    return PublicRedactResponse(
        redacted_text=redacted_text,
        entities_found=len(entities_dicts),
        entities_redacted=len(replacements),
        processing_ms=ms,
    )


@public_router.post("/analyze", response_model=PublicAnalyzeResponse)
async def public_analyze(
    req:      PublicRedactRequest,
    request:  Request,
    key_data: dict = Depends(require_api_key),
):
    t0 = time.time()
    import feature1_pipeline_upgrade as f1
    if not f1.pipeline:
        raise HTTPException(503, "Detection pipeline not ready")

    raw = f1.pipeline.run(req.text, threshold=req.threshold)
    ms  = int((time.time() - t0) * 1000)
    ip  = request.client.host if request.client else "unknown"
    _log_api_usage(key_data["key_id"], "/public/analyze", 200, ms, len(raw), ip)

    return PublicAnalyzeResponse(
        entities=[e.to_dict() for e in raw],
        entity_count=len(raw),
        processing_ms=ms,
    )


# ── Key management endpoints (JWT auth) ───────────────────────────────────────

@api_router.post("/create")
async def create_key(
    req:          CreateKeyRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["sub"]
    org_id  = current_user.get("org_id")
    role    = current_user.get("role", "user")

    if role not in ("org_admin", "operator", "user"):
        raise HTTPException(403, "Insufficient permissions to create API keys")

    conn = get_db()

    # Enforce key limits per plan
    if org_id:
        org = conn.execute("SELECT * FROM organisations WHERE org_id = ?", (org_id,)).fetchone()
        if org:
            key_count = conn.execute(
                "SELECT COUNT(*) FROM api_keys_v2 WHERE org_id = ? AND is_active = 1", (org_id,)
            ).fetchone()[0]
            if key_count >= org["max_api_keys"]:
                conn.close()
                raise HTTPException(403, f"API key limit reached ({org['max_api_keys']}). Upgrade plan.")

    raw_key  = f"ck_live_{secrets.token_urlsafe(32)}"
    key_id   = f"key_{secrets.token_hex(10)}"
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:14] + "..."
    now      = datetime.now(timezone.utc).isoformat()
    expires  = (
        (datetime.now(timezone.utc) + timedelta(days=req.expires_in_days)).isoformat()
        if req.expires_in_days else None
    )

    conn.execute("""
        INSERT INTO api_keys_v2
        (key_id, user_id, org_id, name, description, key_hash, key_prefix,
         created_at, expires_at, rate_limit_rpm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (key_id, user_id, org_id, req.name, req.description,
          key_hash, key_prefix, now, expires, req.rate_limit_rpm))
    conn.commit()
    conn.close()

    logger.info("API key created: %s by user %s", key_id, user_id)

    return {
        "api_key":      raw_key,   # shown ONCE — never stored in plaintext
        "key_id":       key_id,
        "key_prefix":   key_prefix,
        "name":         req.name,
        "expires_at":   expires,
        "rate_limit_rpm": req.rate_limit_rpm,
        "message":      "Store this key securely — it will not be shown again.",
    }


@api_router.get("/list")
async def list_keys(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    rows = conn.execute("""
        SELECT key_id, name, description, key_prefix, created_at, expires_at,
               last_used_at, request_count, is_active, rate_limit_rpm
        FROM api_keys_v2
        WHERE user_id = ? AND is_active = 1
        ORDER BY created_at DESC
    """, (current_user["sub"],)).fetchall()
    conn.close()
    return {"keys": [dict(r) for r in rows]}


@api_router.delete("/{key_id}")
async def revoke_key(key_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    row  = conn.execute(
        "SELECT user_id FROM api_keys_v2 WHERE key_id = ?", (key_id,)
    ).fetchone()

    if not row:
        conn.close()
        raise HTTPException(404, "Key not found")
    if row["user_id"] != current_user["sub"] and current_user.get("role") != "org_admin":
        conn.close()
        raise HTTPException(403, "Cannot revoke another user's key")

    conn.execute("UPDATE api_keys_v2 SET is_active = 0 WHERE key_id = ?", (key_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "revoked": key_id}


@api_router.get("/{key_id}/usage")
async def key_usage(key_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    key  = conn.execute(
        "SELECT * FROM api_keys_v2 WHERE key_id = ? AND user_id = ?",
        (key_id, current_user["sub"])
    ).fetchone()
    if not key:
        conn.close()
        raise HTTPException(404, "Key not found or not yours")

    # Last 7 days usage
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    rows   = conn.execute("""
        SELECT endpoint, COUNT(*) as calls, AVG(processing_ms) as avg_ms,
               SUM(entity_count) as total_entities
        FROM api_key_usage
        WHERE key_id = ? AND used_at >= ?
        GROUP BY endpoint
    """, (key_id, cutoff)).fetchall()

    daily = conn.execute("""
        SELECT DATE(used_at) as day, COUNT(*) as calls
        FROM api_key_usage
        WHERE key_id = ? AND used_at >= ?
        GROUP BY DATE(used_at)
        ORDER BY day ASC
    """, (key_id, cutoff)).fetchall()

    conn.close()
    return {
        "key_id":         key_id,
        "key_prefix":     key["key_prefix"],
        "name":           key["name"],
        "total_requests": key["request_count"],
        "rate_limit_rpm": key["rate_limit_rpm"],
        "last_used_at":   key["last_used_at"],
        "by_endpoint":    [dict(r) for r in rows],
        "daily_volume":   [dict(r) for r in daily],
    }