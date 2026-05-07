"""
Ciphera V3 — Feature 8: REST API with API Key Authentication
=============================================================
Allows external developers to integrate Ciphera into their pipelines.

Endpoints:
  POST /api/v3/public/redact        — redact text, returns redacted string
  POST /api/v3/public/analyze       — analyze text, returns entity list only
  GET  /api/v3/public/health        — public health check
  POST /api/v3/keys/create          — create a new API key (admin)
  GET  /api/v3/keys/list            — list all keys (admin)
  DELETE /api/v3/keys/{key}         — revoke a key (admin)

Authentication:
  Pass key in header: X-API-Key: ck_live_...

Place at: v3/backend/feature8_api_keys.py
Mount in main.py:
  from feature8_api_keys import router as api_router, public_router
  app.include_router(api_router)
  app.include_router(public_router)
"""

from __future__ import annotations

import os
import json
import secrets
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

logger = logging.getLogger("ciphera.api_keys")

# ── Storage (simple JSON file — replace with DB for production scale) ─────────
KEYS_FILE = Path(__file__).parent / "data" / "api_keys.json"
KEYS_FILE.parent.mkdir(exist_ok=True)

def _load_keys() -> dict:
    if KEYS_FILE.exists():
        return json.loads(KEYS_FILE.read_text())
    return {}

def _save_keys(keys: dict):
    KEYS_FILE.write_text(json.dumps(keys, indent=2))

def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

# ── Admin password (set via env var, defaults to dev password) ────────────────
ADMIN_PASSWORD = os.getenv("CIPHERA_ADMIN_PASSWORD", "ciphera_admin_dev")

# ── Models ────────────────────────────────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    name:        str  = Field(..., description="Human-readable name for this key")
    description: str  = Field("", description="What this key is used for")
    admin_password: str

class ApiKeyInfo(BaseModel):
    key_id:      str
    name:        str
    description: str
    created_at:  str
    request_count: int
    is_active:   bool
    # Note: raw key is ONLY returned on creation, never again

class CreateKeyResponse(BaseModel):
    api_key:  str   # full raw key — shown ONCE
    key_id:   str
    name:     str
    message:  str

class PublicRedactRequest(BaseModel):
    text:      str  = Field(..., max_length=100_000)
    threshold: float = Field(0.50, ge=0.0, le=1.0)
    entity_types: Optional[list[str]] = None  # if None, use all active

class PublicRedactResponse(BaseModel):
    redacted_text:    str
    entities_found:   int
    entities_redacted: int
    processing_ms:    int
    model:            str = "ciphera-v3"

class PublicAnalyzeResponse(BaseModel):
    entities:       list[dict]
    entity_count:   int
    processing_ms:  int
    model:          str = "ciphera-v3"

# ── Key validation dependency ──────────────────────────────────────────────────

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def require_api_key(x_api_key: str = Depends(api_key_header)) -> dict:
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail={"error": "missing_api_key", "message": "Include your API key in the X-API-Key header."},
        )
    keys = _load_keys()
    key_hash = _hash_key(x_api_key)
    key_data = keys.get(key_hash)
    if not key_data or not key_data.get("is_active"):
        raise HTTPException(
            status_code=403,
            detail={"error": "invalid_api_key", "message": "Invalid or revoked API key."},
        )
    # Increment request count
    key_data["request_count"] = key_data.get("request_count", 0) + 1
    key_data["last_used_at"] = datetime.now(timezone.utc).isoformat()
    _save_keys(keys)
    return key_data

# ── Routers ───────────────────────────────────────────────────────────────────

public_router = APIRouter(prefix="/api/v3/public", tags=["Public API"])
api_router    = APIRouter(prefix="/api/v3/keys",   tags=["API Key Management"])

# ── Public endpoints (require API key) ────────────────────────────────────────

@public_router.get("/health")
async def public_health():
    return {
        "status":  "operational",
        "model":   "ciphera-v3",
        "version": "3.3.0",
        "docs":    "https://github.com/bitbyrizbit/ciphera",
    }


@public_router.post("/redact", response_model=PublicRedactResponse)
async def public_redact(
    request:  PublicRedactRequest,
    key_data: dict = Depends(require_api_key),
):
    """
    Redact PII from text. Returns the redacted string.

    Example:
        curl -X POST https://your-domain/api/v3/public/redact \\
          -H "X-API-Key: ck_live_..." \\
          -H "Content-Type: application/json" \\
          -d '{"text": "My name is Rihaan and my Aadhaar is 1234 5678 9012"}'
    """
    import time
    start = time.time()

    # Import pipeline (loaded at startup in main.py)
    import feature1_pipeline_upgrade as f1
    if not f1.pipeline:
        raise HTTPException(503, "Detection pipeline not ready")

    entities = f1.pipeline.run(request.text, request.threshold)

    # Filter by requested entity types
    if request.entity_types:
        entities = [e for e in entities if e.entity_type in request.entity_types]

    # Build redacted text
    redacted   = list(request.text)
    replacements = []
    counters: dict[str, int] = {}

    for entity in sorted(entities, key=lambda e: e.start):
        et = entity.entity_type
        counters[et] = counters.get(et, 0) + 1
        replacements.append((entity.start, entity.end, f"[{et}_{counters[et]}]"))

    # Apply replacements in reverse order to preserve indices
    for start_idx, end_idx, replacement in sorted(replacements, key=lambda x: x[0], reverse=True):
        redacted[start_idx:end_idx] = list(replacement)

    redacted_text = ''.join(redacted)
    ms = int((time.time() - start) * 1000)

    return PublicRedactResponse(
        redacted_text=redacted_text,
        entities_found=len(entities),
        entities_redacted=len(replacements),
        processing_ms=ms,
    )


@public_router.post("/analyze", response_model=PublicAnalyzeResponse)
async def public_analyze(
    request:  PublicRedactRequest,
    key_data: dict = Depends(require_api_key),
):
    """Returns detected entities without redacting — useful for inspection."""
    import time
    start = time.time()

    import feature1_pipeline_upgrade as f1
    if not f1.pipeline:
        raise HTTPException(503, "Detection pipeline not ready")

    entities = f1.pipeline.run(request.text, request.threshold)
    ms = int((time.time() - start) * 1000)

    return PublicAnalyzeResponse(
        entities=[e.to_dict() for e in entities],
        entity_count=len(entities),
        processing_ms=ms,
    )


# ── Key management endpoints (require admin password) ─────────────────────────

@api_router.post("/create", response_model=CreateKeyResponse)
async def create_key(request: CreateKeyRequest):
    if request.admin_password != ADMIN_PASSWORD:
        raise HTTPException(403, "Invalid admin password")

    raw_key  = f"ck_live_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(raw_key)
    key_id   = f"key_{secrets.token_hex(8)}"

    keys = _load_keys()
    keys[key_hash] = {
        "key_id":        key_id,
        "name":          request.name,
        "description":   request.description,
        "created_at":    datetime.now(timezone.utc).isoformat(),
        "request_count": 0,
        "is_active":     True,
    }
    _save_keys(keys)
    logger.info("Created API key %s for %s", key_id, request.name)

    return CreateKeyResponse(
        api_key=raw_key,
        key_id=key_id,
        name=request.name,
        message="Store this key securely — it will not be shown again.",
    )


@api_router.get("/list", response_model=list[ApiKeyInfo])
async def list_keys(admin_password: str):
    if admin_password != ADMIN_PASSWORD:
        raise HTTPException(403, "Invalid admin password")
    keys = _load_keys()
    return [
        ApiKeyInfo(key_id=v["key_id"], name=v["name"], description=v.get("description",""),
                   created_at=v["created_at"], request_count=v.get("request_count",0),
                   is_active=v["is_active"])
        for v in keys.values()
    ]


@api_router.delete("/{key_id}")
async def revoke_key(key_id: str, admin_password: str):
    if admin_password != ADMIN_PASSWORD:
        raise HTTPException(403, "Invalid admin password")
    keys = _load_keys()
    for k, v in keys.items():
        if v["key_id"] == key_id:
            v["is_active"] = False
            _save_keys(keys)
            return {"message": f"Key {key_id} revoked"}
    raise HTTPException(404, f"Key {key_id} not found")
