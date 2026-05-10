"""
Ciphera V3 — Feature 10: SQLite Audit Persistence
==================================================
Replaces localStorage-only audit logs with a persistent SQLite database.
Audit logs survive browser clears, server restarts, and are queryable.

Endpoints:
  POST /api/v3/audit/log        — write a new audit entry
  GET  /api/v3/audit/logs       — get all logs (paginated)
  GET  /api/v3/audit/stats      — aggregated stats for dashboard
  DELETE /api/v3/audit/{run_id} — delete a specific log entry

Place at: v3/backend/feature10_audit_db.py
Mount in main.py:
  from feature10_audit_db import router as audit_router
  app.include_router(audit_router)
"""

from __future__ import annotations

import sqlite3
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger("ciphera.audit")
router = APIRouter(prefix="/api/v3/audit", tags=["Audit"])

DB_PATH = Path(__file__).parent / "data" / "audit.db"
DB_PATH.parent.mkdir(exist_ok=True)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                size            TEXT,
                date            TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'Completed',
                entities_discovered INTEGER DEFAULT 0,
                rules_applied   TEXT DEFAULT '[]',
                created_at      TEXT NOT NULL,
                session_id      TEXT DEFAULT 'default'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS session_metrics (
                session_id              TEXT PRIMARY KEY,
                total_documents_secured INTEGER DEFAULT 0,
                total_entities_masked   INTEGER DEFAULT 0,
                updated_at              TEXT NOT NULL
            )
        """)
        conn.commit()
    logger.info("Audit DB initialized at %s", DB_PATH)


# Call at import time
init_db()


# ── Models ────────────────────────────────────────────────────────────────────

class AuditLogEntry(BaseModel):
    id:                   str
    name:                 str
    size:                 str = "Unknown"
    date:                 str
    status:               str = "Completed"
    entities_discovered:  int = 0
    rules_applied:        list[str] = []
    session_id:           str = "default"


class AuditStats(BaseModel):
    total_documents:      int
    total_entities:       int
    success_rate:         float
    top_entity_type:      str
    entity_breakdown:     list[dict]
    daily_volume:         list[dict]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/log")
async def write_log(entry: AuditLogEntry):
    try:
        with get_db() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO audit_logs
                (id, name, size, date, status, entities_discovered, rules_applied, created_at, session_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry.id, entry.name, entry.size, entry.date,
                entry.status, entry.entities_discovered,
                json.dumps(entry.rules_applied),
                datetime.now(timezone.utc).isoformat(),
                entry.session_id,
            ))

            # Update session metrics
            conn.execute("""
                INSERT INTO session_metrics (session_id, total_documents_secured, total_entities_masked, updated_at)
                VALUES (?, 1, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    total_documents_secured = total_documents_secured + 1,
                    total_entities_masked   = total_entities_masked + excluded.total_entities_masked,
                    updated_at              = excluded.updated_at
            """, (entry.session_id, entry.entities_discovered, datetime.now(timezone.utc).isoformat()))

            conn.commit()
        return {"ok": True}
    except Exception as e:
        logger.error("Failed to write audit log: %s", e)
        raise HTTPException(500, str(e))


@router.get("/logs")
async def get_logs(
    session_id: str   = Query("default"),
    limit:      int   = Query(50, le=200),
    offset:     int   = Query(0),
):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT * FROM audit_logs
            WHERE session_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """, (session_id, limit, offset)).fetchall()

        total = conn.execute(
            "SELECT COUNT(*) FROM audit_logs WHERE session_id = ?", (session_id,)
        ).fetchone()[0]

    logs = []
    for row in rows:
        d = dict(row)
        d["rules_applied"] = json.loads(d.get("rules_applied", "[]"))
        logs.append(d)

    return {"logs": logs, "total": total, "limit": limit, "offset": offset}


@router.get("/stats", response_model=AuditStats)
async def get_stats(session_id: str = Query("default")):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_logs WHERE session_id = ?", (session_id,)
        ).fetchall()

        metrics = conn.execute(
            "SELECT * FROM session_metrics WHERE session_id = ?", (session_id,)
        ).fetchone()

    if not rows:
        return AuditStats(
            total_documents=0, total_entities=0, success_rate=0.0,
            top_entity_type="N/A", entity_breakdown=[], daily_volume=[],
        )

    total_docs     = len(rows)
    total_entities = sum(r["entities_discovered"] for r in rows)
    success_count  = sum(1 for r in rows if r["status"] == "Completed")
    success_rate   = round((success_count / total_docs) * 100, 1) if total_docs else 0

    # Entity type breakdown
    type_counts: dict[str, int] = {}
    for row in rows:
        for rule in json.loads(row["rules_applied"] or "[]"):
            type_counts[rule] = type_counts.get(rule, 0) + 1

    breakdown = sorted(
        [{"type": k, "count": v} for k, v in type_counts.items()],
        key=lambda x: x["count"], reverse=True
    )[:8]

    top_type = breakdown[0]["type"] if breakdown else "N/A"

    # Daily volume — last 7 days
    from collections import defaultdict
    day_map: dict[str, int] = defaultdict(int)
    for row in rows:
        try:
            d = datetime.fromisoformat(row["created_at"])
            key = d.strftime("%a")
            day_map[key] += row["entities_discovered"]
        except Exception:
            pass

    days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    daily_volume = [{"day": d, "count": day_map.get(d, 0)} for d in days]

    return AuditStats(
        total_documents=total_docs,
        total_entities=total_entities,
        success_rate=success_rate,
        top_entity_type=top_type,
        entity_breakdown=breakdown,
        daily_volume=daily_volume,
    )


@router.get("/metrics")
async def get_metrics(session_id: str = Query("default")):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM session_metrics WHERE session_id = ?", (session_id,)
        ).fetchone()
    if not row:
        return {"total_documents_secured": 0, "total_entities_masked": 0}
    return dict(row)


@router.delete("/{run_id}")
async def delete_log(run_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM audit_logs WHERE id = ?", (run_id,))
        conn.commit()
    return {"ok": True, "deleted": run_id}


@router.delete("/clear/all")
async def clear_all_logs(session_id: str = Query("default")):
    with get_db() as conn:
        conn.execute("DELETE FROM audit_logs WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM session_metrics WHERE session_id = ?", (session_id,))
        conn.commit()
    return {"ok": True}
