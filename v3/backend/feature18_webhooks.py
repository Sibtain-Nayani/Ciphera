"""
Ciphera V3.5 — Feature 18: Webhook Support
===========================================
Allows API key holders to register webhook URLs that receive POST callbacks
when redaction jobs complete. Useful for batch pipeline integrations where
the caller doesn't want to poll.

Payload shape (sent to the webhook URL):
    {
        "event":       "redaction.complete",
        "api_key_id":  "ck_...",
        "timestamp":   "2026-06-16T12:00:00Z",
        "job_id":      "RUN-12345",
        "result": {
            "entity_count":   12,
            "processing_ms":  340,
            "document_type":  "kyc",
            "entities_by_type": { "AADHAAR_NUMBER": 1, "PAN_NUMBER": 1, ... }
        }
    }

Security:
    Every delivery includes an X-Ciphera-Signature header:
        X-Ciphera-Signature: sha256=<hmac_hex>
    Computed as HMAC-SHA256(payload_json, webhook_secret).
    The secret is generated at registration and shown once.
    Receivers should verify this signature before processing.

Retry logic:
    On non-2xx response or connection error, retries up to 3 times
    with exponential backoff: 10s, 30s, 90s.
    Retries run as background asyncio tasks — they don't block the API response.

Install:
    No extra dependencies — uses httpx (already in requirements) and
    standard library hmac/hashlib.

Mount in main.py:
    from feature18_webhooks import router as webhook_router
    app.include_router(webhook_router)

Call from your redact endpoint after processing:
    from feature18_webhooks import fire_webhook
    await fire_webhook(
        api_key_id="ck_...",
        job_id="RUN-12345",
        entity_count=12,
        processing_ms=340,
        entities_by_type={"AADHAAR_NUMBER": 1},
        document_type="kyc",
    )
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field, HttpUrl

logger = logging.getLogger("ciphera.webhooks")
router = APIRouter()

# ── DB path ───────────────────────────────────────────────────────────────────
DB_PATH = os.environ.get("CIPHERA_DB_PATH", "data/ciphera.db")

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

# ── Schema bootstrap ──────────────────────────────────────────────────────────
def init_webhook_tables():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS webhooks (
                webhook_id   TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                api_key_id   TEXT,              -- NULL = fires for all keys of this user
                url          TEXT NOT NULL,
                secret       TEXT NOT NULL,     -- HMAC signing secret, shown once
                description  TEXT DEFAULT '',
                is_active    INTEGER DEFAULT 1,
                created_at   TEXT NOT NULL,
                events       TEXT DEFAULT 'redaction.complete'  -- comma-separated
            );

            CREATE TABLE IF NOT EXISTS webhook_deliveries (
                delivery_id   TEXT PRIMARY KEY,
                webhook_id    TEXT NOT NULL,
                job_id        TEXT,
                event         TEXT NOT NULL,
                payload_json  TEXT NOT NULL,
                status        TEXT NOT NULL,   -- 'success' | 'failed' | 'pending'
                http_status   INTEGER,
                attempt       INTEGER DEFAULT 1,
                response_ms   INTEGER,
                error_msg     TEXT,
                created_at    TEXT NOT NULL,
                FOREIGN KEY (webhook_id) REFERENCES webhooks(webhook_id)
            );

            CREATE INDEX IF NOT EXISTS idx_webhook_user    ON webhooks (user_id);
            CREATE INDEX IF NOT EXISTS idx_webhook_key     ON webhooks (api_key_id);
            CREATE INDEX IF NOT EXISTS idx_delivery_wh     ON webhook_deliveries (webhook_id);
            CREATE INDEX IF NOT EXISTS idx_delivery_status ON webhook_deliveries (status);
        """)
    logger.info("Webhook tables ready.")

# Call on import so tables exist immediately
try:
    init_webhook_tables()
except Exception as e:
    logger.warning("Webhook table init failed (DB may not be ready yet): %s", e)


# ── Auth helper (reuse JWT from feature15_auth.py) ────────────────────────────
def _get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Minimal JWT check — reuses the existing auth logic."""
    from feature15_auth import decode_access_token
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authorization required")
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    return payload


# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterWebhookRequest(BaseModel):
    url:         str   = Field(..., description="HTTPS URL to POST events to")
    description: str   = Field("", max_length=200)
    api_key_id:  Optional[str] = Field(None, description="Scope to a specific API key, or null for all")
    events:      list[str] = Field(["redaction.complete"])

class WebhookResponse(BaseModel):
    webhook_id:  str
    url:         str
    description: str
    api_key_id:  Optional[str]
    is_active:   bool
    events:      list[str]
    created_at:  str
    secret:      Optional[str] = None  # only returned on creation

class DeliveryResponse(BaseModel):
    delivery_id: str
    event:       str
    status:      str
    http_status: Optional[int]
    attempt:     int
    response_ms: Optional[int]
    error_msg:   Optional[str]
    created_at:  str


# ── HMAC signing ──────────────────────────────────────────────────────────────
def sign_payload(payload_json: str, secret: str) -> str:
    """Returns sha256=<hex> signature for the X-Ciphera-Signature header."""
    mac = hmac.new(
        secret.encode("utf-8"),
        payload_json.encode("utf-8"),
        hashlib.sha256,
    )
    return f"sha256={mac.hexdigest()}"


# ── Delivery engine ───────────────────────────────────────────────────────────
async def _deliver(
    webhook_id:   str,
    delivery_id:  str,
    url:          str,
    secret:       str,
    payload_json: str,
    attempt:      int = 1,
    max_attempts: int = 3,
):
    """Send one HTTP POST to the webhook URL. Retries with backoff on failure."""
    sig     = sign_payload(payload_json, secret)
    headers = {
        "Content-Type":         "application/json",
        "X-Ciphera-Signature":  sig,
        "X-Ciphera-Event":      json.loads(payload_json).get("event", ""),
        "X-Ciphera-Delivery":   delivery_id,
        "User-Agent":           "Ciphera-Webhook/3.5",
    }

    start_ms = _now_ms()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, content=payload_json, headers=headers)

        elapsed = _now_ms() - start_ms
        success = 200 <= resp.status_code < 300

        _save_delivery_result(
            delivery_id=delivery_id,
            webhook_id=webhook_id,
            status="success" if success else "failed",
            http_status=resp.status_code,
            attempt=attempt,
            response_ms=elapsed,
            error_msg=None if success else f"HTTP {resp.status_code}",
        )

        if not success and attempt < max_attempts:
            backoff = [10, 30, 90][attempt - 1]
            logger.warning(
                "Webhook %s delivery %s failed (HTTP %s), retry in %ss",
                webhook_id, delivery_id, resp.status_code, backoff,
            )
            await asyncio.sleep(backoff)
            await _deliver(webhook_id, delivery_id, url, secret, payload_json, attempt + 1, max_attempts)

    except Exception as exc:
        elapsed = _now_ms() - start_ms
        _save_delivery_result(
            delivery_id=delivery_id,
            webhook_id=webhook_id,
            status="failed",
            http_status=None,
            attempt=attempt,
            response_ms=elapsed,
            error_msg=str(exc)[:500],
        )
        if attempt < max_attempts:
            backoff = [10, 30, 90][attempt - 1]
            logger.warning(
                "Webhook %s delivery %s error: %s — retry in %ss",
                webhook_id, delivery_id, exc, backoff,
            )
            await asyncio.sleep(backoff)
            await _deliver(webhook_id, delivery_id, url, secret, payload_json, attempt + 1, max_attempts)


def _save_delivery_result(
    delivery_id: str,
    webhook_id:  str,
    status:      str,
    http_status: Optional[int],
    attempt:     int,
    response_ms: int,
    error_msg:   Optional[str],
):
    try:
        with get_db() as conn:
            conn.execute("""
                UPDATE webhook_deliveries
                SET status = ?, http_status = ?, attempt = ?, response_ms = ?, error_msg = ?
                WHERE delivery_id = ?
            """, (status, http_status, attempt, response_ms, error_msg, delivery_id))
    except Exception as e:
        logger.error("Failed to save delivery result: %s", e)


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Public fire function (called from redact endpoints) ───────────────────────
async def fire_webhook(
    api_key_id:       Optional[str],
    user_id:          Optional[str],
    job_id:           str,
    entity_count:     int,
    processing_ms:    int,
    entities_by_type: dict,
    document_type:    str = "unknown",
    event:            str = "redaction.complete",
):
    """
    Fire all matching webhooks for a completed redaction job.
    Called from the /api/v3/redact endpoint after processing.
    Non-blocking — fires deliveries as background tasks.
    """
    try:
        with get_db() as conn:
            if api_key_id:
                rows = conn.execute("""
                    SELECT * FROM webhooks
                    WHERE is_active = 1
                      AND (api_key_id = ? OR api_key_id IS NULL)
                      AND (user_id = ? OR ? IS NULL)
                      AND events LIKE ?
                """, (api_key_id, user_id, user_id, f"%{event}%")).fetchall()
            else:
                rows = conn.execute("""
                    SELECT * FROM webhooks
                    WHERE is_active = 1
                      AND user_id = ?
                      AND events LIKE ?
                """, (user_id, f"%{event}%")).fetchall()
    except Exception as e:
        logger.error("Webhook lookup failed: %s", e)
        return

    if not rows:
        return

    payload = {
        "event":      event,
        "api_key_id": api_key_id,
        "user_id":    user_id,
        "timestamp":  _now_iso(),
        "job_id":     job_id,
        "result": {
            "entity_count":     entity_count,
            "processing_ms":    processing_ms,
            "document_type":    document_type,
            "entities_by_type": entities_by_type,
        },
    }
    payload_json = json.dumps(payload, ensure_ascii=False)

    for row in rows:
        delivery_id = f"del_{secrets.token_hex(8)}"
        # Write pending delivery record
        try:
            with get_db() as conn:
                conn.execute("""
                    INSERT INTO webhook_deliveries
                    (delivery_id, webhook_id, job_id, event, payload_json, status, created_at)
                    VALUES (?, ?, ?, ?, ?, 'pending', ?)
                """, (delivery_id, row["webhook_id"], job_id, event, payload_json, _now_iso()))
        except Exception as e:
            logger.error("Failed to insert delivery record: %s", e)
            continue

        # Fire async — non-blocking
        asyncio.create_task(_deliver(
            webhook_id=row["webhook_id"],
            delivery_id=delivery_id,
            url=row["url"],
            secret=row["secret"],
            payload_json=payload_json,
        ))
        logger.info("Webhook fired: %s → %s", row["webhook_id"], row["url"])


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/v3/webhooks/register", response_model=WebhookResponse)
async def register_webhook(
    request: RegisterWebhookRequest,
    current_user: dict = Depends(_get_current_user),
):
    """
    Register a webhook URL. Returns the signing secret once — store it securely.
    The secret is used to verify X-Ciphera-Signature on incoming deliveries.
    """
    # Basic validation
    if not request.url.startswith("https://") and not request.url.startswith("http://localhost") and not request.url.startswith("http://127.0.0.1") and not request.url.startswith("http://host.docker.internal"):
        raise HTTPException(400, "Webhook URL must use HTTPS (or localhost for testing)")

    # Check limit — max 10 webhooks per user
    with get_db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM webhooks WHERE user_id = ? AND is_active = 1",
            (current_user["sub"],)
        ).fetchone()[0]
        if count >= 10:
            raise HTTPException(400, "Maximum of 10 active webhooks per user")

    webhook_id = f"wh_{secrets.token_hex(12)}"
    secret     = secrets.token_hex(32)
    now        = _now_iso()
    events_str = ",".join(request.events)

    with get_db() as conn:
        conn.execute("""
            INSERT INTO webhooks
            (webhook_id, user_id, api_key_id, url, secret, description, is_active, created_at, events)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        """, (
            webhook_id, current_user["sub"], request.api_key_id,
            request.url, secret, request.description, now, events_str,
        ))

    logger.info("Webhook registered: %s → %s (user=%s)", webhook_id, request.url, current_user["sub"])

    return WebhookResponse(
        webhook_id=webhook_id,
        url=request.url,
        description=request.description,
        api_key_id=request.api_key_id,
        is_active=True,
        events=request.events,
        created_at=now,
        secret=secret,   # Only returned here — never shown again
    )


@router.get("/api/v3/webhooks/list")
async def list_webhooks(current_user: dict = Depends(_get_current_user)):
    """List all active webhooks for the current user. Secrets are not returned."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM webhooks WHERE user_id = ? ORDER BY created_at DESC",
            (current_user["sub"],)
        ).fetchall()

    return {
        "webhooks": [
            {
                "webhook_id":  r["webhook_id"],
                "url":         r["url"],
                "description": r["description"],
                "api_key_id":  r["api_key_id"],
                "is_active":   bool(r["is_active"]),
                "events":      r["events"].split(","),
                "created_at":  r["created_at"],
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.delete("/api/v3/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id:   str,
    current_user: dict = Depends(_get_current_user),
):
    """Deactivate a webhook. Does not delete delivery history."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT user_id FROM webhooks WHERE webhook_id = ?", (webhook_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Webhook not found")
        if row["user_id"] != current_user["sub"]:
            raise HTTPException(403, "Not your webhook")
        conn.execute(
            "UPDATE webhooks SET is_active = 0 WHERE webhook_id = ?", (webhook_id,)
        )

    logger.info("Webhook deactivated: %s", webhook_id)
    return {"webhook_id": webhook_id, "deleted": True}


@router.get("/api/v3/webhooks/{webhook_id}/deliveries")
async def get_deliveries(
    webhook_id:   str,
    limit:        int = 20,
    current_user: dict = Depends(_get_current_user),
):
    """View delivery history for a webhook — success/failure, response times, errors."""
    with get_db() as conn:
        # Verify ownership
        row = conn.execute(
            "SELECT user_id FROM webhooks WHERE webhook_id = ?", (webhook_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Webhook not found")
        if row["user_id"] != current_user["sub"]:
            raise HTTPException(403, "Not your webhook")

        rows = conn.execute("""
            SELECT * FROM webhook_deliveries
            WHERE webhook_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (webhook_id, min(limit, 100))).fetchall()

    # Compute stats
    total     = len(rows)
    succeeded = sum(1 for r in rows if r["status"] == "success")

    return {
        "webhook_id": webhook_id,
        "deliveries": [
            {
                "delivery_id": r["delivery_id"],
                "job_id":      r["job_id"],
                "event":       r["event"],
                "status":      r["status"],
                "http_status": r["http_status"],
                "attempt":     r["attempt"],
                "response_ms": r["response_ms"],
                "error_msg":   r["error_msg"],
                "created_at":  r["created_at"],
            }
            for r in rows
        ],
        "stats": {
            "total":        total,
            "succeeded":    succeeded,
            "failed":       total - succeeded,
            "success_rate": round(succeeded / total * 100, 1) if total else 0,
        },
    }


@router.post("/api/v3/webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id:   str,
    current_user: dict = Depends(_get_current_user),
):
    """
    Send a test ping to a webhook URL.
    Useful for verifying the endpoint is reachable and signature verification works.
    """
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM webhooks WHERE webhook_id = ? AND is_active = 1",
            (webhook_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Webhook not found or inactive")
        if row["user_id"] != current_user["sub"]:
            raise HTTPException(403, "Not your webhook")

    test_payload = {
        "event":      "webhook.test",
        "webhook_id": webhook_id,
        "timestamp":  _now_iso(),
        "message":    "This is a test delivery from Ciphera. Your webhook is configured correctly.",
        "job_id":     "TEST-000",
        "result": {
            "entity_count":     0,
            "processing_ms":    0,
            "document_type":    "test",
            "entities_by_type": {},
        },
    }
    payload_json = json.dumps(test_payload)
    sig          = sign_payload(payload_json, row["secret"])

    delivery_id = f"del_test_{secrets.token_hex(6)}"
    start_ms    = _now_ms()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                row["url"],
                content=payload_json,
                headers={
                    "Content-Type":        "application/json",
                    "X-Ciphera-Signature": sig,
                    "X-Ciphera-Event":     "webhook.test",
                    "X-Ciphera-Delivery":  delivery_id,
                    "User-Agent":          "Ciphera-Webhook/3.5",
                },
            )
        elapsed = _now_ms() - start_ms
        return {
            "success":     200 <= resp.status_code < 300,
            "http_status": resp.status_code,
            "response_ms": elapsed,
            "delivery_id": delivery_id,
            "signature":   sig,
        }
    except Exception as exc:
        return {
            "success":     False,
            "http_status": None,
            "response_ms": _now_ms() - start_ms,
            "delivery_id": delivery_id,
            "error":       str(exc),
        }
