"""
Ciphera V3.1 — Feature 14: Signed Audit Report PDF
===================================================
Generates a tamper-evident, digitally-signed compliance audit report
as a downloadable PDF.

Features:
  - SHA-256 content hash embedded in report (tamper-evident)
  - Hash chain: each report includes hash of previous report for that session
  - DPDP Act 2023 + GDPR aligned report format
  - Entity breakdown, rules applied, confidence stats, timeline
  - Report hash stored in audit DB for verification later
  - POST /api/v3/audit/report          — generate + download signed PDF
  - GET  /api/v3/audit/verify/{hash}   — verify a report hash against DB
  - GET  /api/v3/audit/report/history  — list all generated reports

Install:
    pip install reportlab
"""

from __future__ import annotations

import hashlib
import hmac
from html import escape
import io
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from app.api.auth import get_current_user
from app.core.database import SessionLocal
from app.models.document import Document, JobStatus, RedactionJob, SafetyStatus
from app.models.identity import User
from app.services.storage import StorageService
from feature10_audit_db import DB_PATH as AUDIT_DB_PATH

logger = logging.getLogger("ciphera.audit_report")
router = APIRouter(prefix="/api/v3/audit", tags=["Audit Report"])

DB_PATH = AUDIT_DB_PATH


def _escape_report_text(value: object) -> str:
    """Render untrusted values as plain text in ReportLab's XML-like parser."""
    return escape(str(value), {"\"": "&quot;", "'": "&#x27;"})

# ── Ensure report_ledger table exists ────────────────────────────────────────

def _init_report_table():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS report_ledger (
            report_id       TEXT PRIMARY KEY,
            session_id      TEXT NOT NULL,
            generated_at    TEXT NOT NULL,
            content_hash    TEXT NOT NULL,
            prev_hash       TEXT DEFAULT 'GENESIS',
            document_count  INTEGER DEFAULT 0,
            entity_count    INTEGER DEFAULT 0,
            report_title    TEXT,
            manifest_json   TEXT,
            signature       TEXT,
            chain_order     INTEGER
        )
    """)
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(report_ledger)")}
    if "manifest_json" not in columns:
        conn.execute("ALTER TABLE report_ledger ADD COLUMN manifest_json TEXT")
    if "signature" not in columns:
        conn.execute("ALTER TABLE report_ledger ADD COLUMN signature TEXT")
    if "chain_order" not in columns:
        conn.execute("ALTER TABLE report_ledger ADD COLUMN chain_order INTEGER")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_report_session_chain_order "
        "ON report_ledger(session_id, chain_order) WHERE chain_order IS NOT NULL"
    )
    conn.commit()
    conn.close()

_init_report_table()


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ── Report models ─────────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    # Retained for old clients; the server always scopes reports to the caller.
    session_id:   Optional[str] = None
    report_title: str = Field(default="Ciphera PII Redaction Audit Report", max_length=160)
    # Date range filter (ISO strings, optional)
    date_from:    Optional[datetime] = None
    date_to:      Optional[datetime] = None
    include_raw_log: bool = False   # whether to include individual doc entries


# ── PDF builder ───────────────────────────────────────────────────────────────

def _build_pdf(
    session_id:    str,
    title:         str,
    logs:          list[dict],
    stats:         dict,
    report_id:     str,
    content_hash:  str,
    signature:     str,
    prev_hash:     str,
    generated_at:  str,
    include_raw:   bool,
) -> bytes:
    """
    Build the audit report PDF using ReportLab.
    Returns raw PDF bytes.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, KeepTogether,
        )
        from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
    except ImportError:
        raise RuntimeError(
            "reportlab not installed. Run: pip install reportlab"
        )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=20*mm, leftMargin=20*mm,
        topMargin=18*mm,   bottomMargin=18*mm,
        title=title,
        author="Ciphera V3 — Automated Redaction Engine",
        subject="PII Redaction Audit Report",
        keywords="DPDP, GDPR, PII, redaction, compliance, audit",
    )

    W = A4[0] - 40*mm  # usable width

    # ── Colour palette ────────────────────────────────────────────────────────
    BLACK      = colors.HexColor("#0A0A0A")
    WHITE      = colors.HexColor("#FFFFFF")
    ACCENT     = colors.HexColor("#F5C400")
    MUTED      = colors.HexColor("#6B7280")
    BORDER     = colors.HexColor("#E5E7EB")
    DANGER     = colors.HexColor("#B91C1C")
    SUCCESS    = colors.HexColor("#15803D")
    LIGHT_BG   = colors.HexColor("#F9FAFB")
    HEADER_BG  = colors.HexColor("#111827")

    # ── Styles ────────────────────────────────────────────────────────────────
    base = getSampleStyleSheet()

    def style(name, **kw):
        s = ParagraphStyle(name, parent=base["Normal"], **kw)
        return s

    S = {
        "h1":      style("h1",  fontSize=22, textColor=WHITE,   fontName="Helvetica-Bold", spaceAfter=4,  leading=28),
        "h2":      style("h2",  fontSize=13, textColor=BLACK,   fontName="Helvetica-Bold", spaceAfter=4,  spaceBefore=10),
        "h3":      style("h3",  fontSize=10, textColor=MUTED,   fontName="Helvetica",      spaceAfter=2),
        "body":    style("body",fontSize=9,  textColor=BLACK,   fontName="Helvetica",      spaceAfter=3,  leading=14),
        "mono":    style("mono",fontSize=8,  textColor=MUTED,   fontName="Courier",        spaceAfter=2,  leading=12),
        "mono_b":  style("mono_b",fontSize=8,textColor=BLACK,   fontName="Courier-Bold",   spaceAfter=2),
        "label":   style("lbl", fontSize=7,  textColor=MUTED,   fontName="Helvetica",      spaceAfter=1,  letterSpacing=0.8),
        "danger":  style("dan", fontSize=8,  textColor=DANGER,  fontName="Helvetica-Bold"),
        "success": style("suc", fontSize=8,  textColor=SUCCESS, fontName="Helvetica-Bold"),
        "right":   style("rt",  fontSize=8,  textColor=MUTED,   fontName="Courier",        alignment=TA_RIGHT),
        "center":  style("ctr", fontSize=9,  textColor=WHITE,   fontName="Helvetica",      alignment=TA_CENTER),
    }

    story = []

    # ── PAGE 1: Cover block ───────────────────────────────────────────────────
    # Dark header bar
    cover_data = [[Paragraph(_escape_report_text(title), S["h1"])]]
    cover_table = Table(cover_data, colWidths=[W])
    cover_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), HEADER_BG),
        ("LEFTPADDING",  (0,0), (-1,-1), 14),
        ("RIGHTPADDING", (0,0), (-1,-1), 14),
        ("TOPPADDING",   (0,0), (-1,-1), 16),
        ("BOTTOMPADDING",(0,0), (-1,-1), 16),
    ]))
    story.append(cover_table)
    story.append(Spacer(1, 6*mm))

    # Meta row
    meta = [
        [Paragraph("SESSION ID",   S["label"]),  Paragraph("GENERATED AT",    S["label"]),  Paragraph("REPORT ID",     S["label"])],
        [Paragraph(_escape_report_text(session_id), S["mono_b"]), Paragraph(_escape_report_text(generated_at[:19]), S["mono_b"]), Paragraph(_escape_report_text(report_id[:16]+"…"), S["mono_b"])],
    ]
    mt = Table(meta, colWidths=[W/3]*3)
    mt.setStyle(TableStyle([
        ("LINEBELOW",    (0,0), (-1,0), 0.5, BORDER),
        ("BOTTOMPADDING",(0,0), (-1,0), 3),
        ("TOPPADDING",   (0,1), (-1,1), 3),
    ]))
    story.append(mt)
    story.append(Spacer(1, 5*mm))
    story.append(HRFlowable(width=W, thickness=1, color=BORDER))
    story.append(Spacer(1, 4*mm))

    # ── Summary stats ─────────────────────────────────────────────────────────
    story.append(Paragraph("EXECUTIVE SUMMARY", S["h2"]))

    total_docs     = stats.get("total_documents", 0)
    total_entities = stats.get("total_entities",  0)
    top_type       = stats.get("top_entity_type", "N/A")

    stat_data = [
        [
            _stat_cell("Verified Jobs",       str(total_docs),     S),
            _stat_cell("Recorded Entities",  str(total_entities), S),
            _stat_cell("Job Status",          "Verified",         S),
            _stat_cell("Top Entity Type",     top_type,           S),
        ]
    ]
    st = Table(stat_data, colWidths=[W/4]*4)
    st.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), LIGHT_BG),
        ("BOX",          (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",    (0,0), (-1,-1), 0.5, BORDER),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING",   (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0), (-1,-1), 8),
    ]))
    story.append(st)
    story.append(Spacer(1, 5*mm))

    # Do not assert statutory compliance from application job state.
    story.append(Paragraph("VERIFICATION SCOPE", S["h2"]))
    story.append(Paragraph(
        "This report lists redaction jobs that the Ciphera server recorded as completed "
        "with document verification cleared at generation time. Each listed output artifact "
        "is bound to its SHA-256 digest in the signed report manifest. This operational record "
        "is not an independent legal or regulatory certification.",
        S["body"],
    ))
    story.append(Spacer(1, 5*mm))

    # ── Entity breakdown ──────────────────────────────────────────────────────
    breakdown = stats.get("entity_breakdown", [])
    if breakdown:
        story.append(Paragraph("ENTITY TYPE BREAKDOWN", S["h2"]))
        bd_header = ["Entity Type", "Count", "% of Total"]
        bd_rows   = [bd_header]
        for item in breakdown[:10]:
            pct = f"{(item['count']/total_entities*100):.1f}%" if total_entities else "0%"
            bd_rows.append([
                Paragraph(_escape_report_text(item.get("type", "")), S["body"]),
                str(item.get("count", 0)),
                pct,
            ])
        bdt = Table(bd_rows, colWidths=[W*0.5, W*0.25, W*0.25])
        bdt.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0), colors.HexColor("#1F2937")),
            ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
            ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",      (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, LIGHT_BG]),
            ("BOX",           (0,0), (-1,-1), 0.5, BORDER),
            ("INNERGRID",     (0,0), (-1,-1), 0.3, BORDER),
            ("LEFTPADDING",   (0,0), (-1,-1), 6),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(bdt)
        story.append(Spacer(1, 5*mm))

    # ── Document log ─────────────────────────────────────────────────────────
    if include_raw and logs:
        story.append(Paragraph("DOCUMENT PROCESSING LOG", S["h2"]))
        log_header = ["Document", "Date", "Entities", "Policy", "Status", "Output SHA-256"]
        log_rows   = [log_header]
        for log in logs:
            log_rows.append([
                Paragraph(_escape_report_text(str(log.get("name", ""))[:40]), S["body"]),
                Paragraph(_escape_report_text(str(log.get("date", ""))[:16]), S["body"]),
                str(log.get("entities_discovered", 0)),
                Paragraph(_escape_report_text(log.get("policy_version", "")), S["body"]),
                Paragraph(_escape_report_text(log.get("status", "")), S["body"]),
                Paragraph(_escape_report_text(log.get("artifact_sha256", "")), S["mono"]),
            ])
        lt = Table(log_rows, colWidths=[W*0.26, W*0.14, W*0.10, W*0.13, W*0.12, W*0.25])
        lt.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0), colors.HexColor("#1F2937")),
            ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
            ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",      (0,0), (-1,-1), 7),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, LIGHT_BG]),
            ("BOX",           (0,0), (-1,-1), 0.5, BORDER),
            ("INNERGRID",     (0,0), (-1,-1), 0.3, BORDER),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("TOPPADDING",    (0,0), (-1,-1), 3),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ]))
        story.append(lt)
        story.append(Spacer(1, 5*mm))

    # ── Cryptographic integrity block ─────────────────────────────────────────
    story.append(HRFlowable(width=W, thickness=1, color=BORDER))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("CRYPTOGRAPHIC INTEGRITY", S["h2"]))

    hash_data = [
        ["Field",               "Value"],
        ["Report Hash (SHA-256)", content_hash],
        ["Manifest Signature (HMAC-SHA-256)", signature],
        ["Previous Report Hash",  prev_hash[:64] if len(prev_hash) > 16 else prev_hash],
        ["Hash Algorithm",        "SHA-256"],
        ["Generated At (UTC)",    generated_at],
        ["Report ID",             report_id],
    ]
    ht = Table(hash_data, colWidths=[W*0.28, W*0.72])
    ht.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,0), colors.HexColor("#1F2937")),
        ("TEXTCOLOR",    (0,0), (-1,0), WHITE),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 7.5),
        ("FONTNAME",     (0,1), (-1,-1), "Courier"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, LIGHT_BG]),
        ("BOX",          (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID",    (0,0), (-1,-1), 0.3, BORDER),
        ("LEFTPADDING",  (0,0), (-1,-1), 6),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("WORDWRAP",     (1,1), (1,-1), True),
    ]))
    story.append(ht)
    story.append(Spacer(1, 3*mm))

    verify_note = (
        f"To verify this report's integrity, check its stored signed manifest "
        f"against <b>{_escape_report_text(content_hash[:32])}…</b>. "
        f"A mismatch indicates the report has been tampered with after generation."
    )
    story.append(Paragraph(verify_note, S["mono"]))
    story.append(Spacer(1, 5*mm))

    # ── Footer watermark ──────────────────────────────────────────────────────
    footer_data = [[
        Paragraph("CIPHERA V3 · AUTOMATED PII REDACTION ENGINE · CONFIDENTIAL", S["center"]),
    ]]
    ft = Table(footer_data, colWidths=[W])
    ft.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), HEADER_BG),
        ("TOPPADDING",   (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0), (-1,-1), 8),
    ]))
    story.append(ft)

    doc.build(story)
    return buf.getvalue()


def _stat_cell(label: str, value: str, S: dict):
    """Helper — two-line stat cell for the summary table."""
    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER

    cell_style = ParagraphStyle(
        "cell_stat", fontSize=9, textColor=colors.HexColor("#111827"),
        fontName="Helvetica", alignment=TA_CENTER, leading=20,
    )
    html = (
        f'<font size="7" color="#6B7280">{_escape_report_text(label.upper())}</font>'
        f'<br/>'
        f'<font size="14"><b>{_escape_report_text(value)}</b></font>'
    )
    return Paragraph(html, cell_style)


# ── Canonical report manifest and verified job source ─────────────────────────

REPORT_JOB_LIMIT = 200


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _report_signing_key() -> bytes:
    key = os.getenv("CIPHERA_REPORT_SIGNING_KEY", "").strip()
    if len(key.encode("utf-8")) < 32:
        raise HTTPException(
            status_code=503,
            detail="Audit reports are unavailable until CIPHERA_REPORT_SIGNING_KEY is configured with at least 32 bytes",
        )
    return key.encode("utf-8")


def _as_utc_naive(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _safe_redacted_key(value: Optional[str]) -> str:
    if not value or "\\" in value:
        raise HTTPException(status_code=409, detail="A verified redaction artifact is unavailable")
    path = PurePosixPath(value)
    if path.is_absolute() or len(path.parts) != 2 or path.parts[0] != "redacted" or any(part in {"", ".", ".."} for part in path.parts):
        raise HTTPException(status_code=409, detail="A verified redaction artifact is unavailable")
    return value


def _load_verified_job_records(user_id: str, req: ReportRequest) -> tuple[list[dict], list[dict]]:
    from sqlalchemy.orm import Session

    records: list[dict] = []
    manifest_jobs: list[dict] = []
    db: Session = SessionLocal()
    try:
        completed_at = func.coalesce(RedactionJob.completed_at, RedactionJob.created_at)
        query = (
            db.query(RedactionJob, Document)
            .join(Document, RedactionJob.document_id == Document.id)
            .filter(
                Document.uploaded_by == user_id,
                RedactionJob.status == JobStatus.COMPLETED,
                Document.safety_status == SafetyStatus.VERIFIED,
                RedactionJob.result_storage_key.isnot(None),
            )
        )
        if req.date_from:
            query = query.filter(completed_at >= _as_utc_naive(req.date_from))
        if req.date_to:
            query = query.filter(completed_at <= _as_utc_naive(req.date_to))
        rows = (
            query.order_by(completed_at.desc(), RedactionJob.id.asc())
            .limit(REPORT_JOB_LIMIT + 1)
            .all()
        )
        if len(rows) > REPORT_JOB_LIMIT:
            raise HTTPException(status_code=413, detail="Narrow the report date range to at most 200 verified jobs")

        for job, document in rows:
            storage_key = _safe_redacted_key(job.result_storage_key)
            try:
                artifact_bytes = StorageService.get_document(storage_key)
            except Exception as exc:
                logger.warning("Verified report artifact could not be read: %s", type(exc).__name__)
                raise HTTPException(status_code=409, detail="A verified redaction artifact is unavailable") from exc

            entity_type_counts: dict[str, int] = {}
            for item in document.detected_entities or []:
                if isinstance(item, dict) and item.get("entity_type"):
                    entity_type = str(item["entity_type"])
                    entity_type_counts[entity_type] = entity_type_counts.get(entity_type, 0) + 1
            entity_types = sorted(entity_type_counts)
            if not isinstance(job.policy_config, dict) or not job.policy_config.get("version"):
                raise HTTPException(
                    status_code=409,
                    detail="A verified job has no versioned policy snapshot; reprocess it before generating a report",
                )
            completed = job.completed_at or job.created_at
            artifact_hash = hashlib.sha256(artifact_bytes).hexdigest()
            records.append({
                "id": job.id,
                "name": document.filename,
                "date": completed.isoformat() if completed else "",
                "status": "Verified",
                "entities_discovered": len(document.detected_entities or []),
                "rules_applied": entity_types,
                "entity_type_counts": entity_type_counts,
                "policy_version": job.policy_config["version"],
                "artifact_sha256": artifact_hash,
            })
            manifest_jobs.append({
                "job_id": job.id,
                "document_id": document.id,
                "filename": document.filename,
                "completed_at": completed.isoformat() if completed else None,
                "job_status": job.status.value,
                "safety_status": document.safety_status.value,
                "artifact_key": storage_key,
                "artifact_sha256": artifact_hash,
                "entity_count": len(document.detected_entities or []),
                "entity_types": entity_types,
                "entity_type_counts": entity_type_counts,
                "policy_version": job.policy_config["version"],
                "policy_config": job.policy_config,
            })
    finally:
        db.close()

    return records, manifest_jobs


def _verify_manifest_artifacts(manifest: dict, owner_id: str) -> bool:
    jobs = manifest.get("jobs")
    if not isinstance(jobs, list) or not jobs or len(jobs) > REPORT_JOB_LIMIT:
        return False
    db = SessionLocal()
    try:
        for item in jobs:
            job = db.query(RedactionJob).filter(RedactionJob.id == item.get("job_id")).first()
            if not job or job.status != JobStatus.COMPLETED or not job.result_storage_key:
                return False
            document = db.query(Document).filter(Document.id == job.document_id).first()
            if (
                not document
                or document.id != item.get("document_id")
                or document.uploaded_by != owner_id
                or document.safety_status != SafetyStatus.VERIFIED
                or job.result_storage_key != item.get("artifact_key")
                or job.policy_config != item.get("policy_config")
                or not isinstance(job.policy_config, dict)
                or job.policy_config.get("version") != item.get("policy_version")
                or document.filename != item.get("filename")
                or job.status.value != item.get("job_status")
                or document.safety_status.value != item.get("safety_status")
            ):
                return False
            completed = job.completed_at or job.created_at
            if (completed.isoformat() if completed else None) != item.get("completed_at"):
                return False
            entity_type_counts: dict[str, int] = {}
            for entity in document.detected_entities or []:
                if isinstance(entity, dict) and entity.get("entity_type"):
                    entity_type = str(entity["entity_type"])
                    entity_type_counts[entity_type] = entity_type_counts.get(entity_type, 0) + 1
            if entity_type_counts != item.get("entity_type_counts") or len(document.detected_entities or []) != item.get("entity_count"):
                return False
            try:
                artifact = StorageService.get_document(_safe_redacted_key(job.result_storage_key))
            except Exception:
                return False
            if not hmac.compare_digest(hashlib.sha256(artifact).hexdigest(), item.get("artifact_sha256", "")):
                return False
    finally:
        db.close()
    return True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/report")
async def generate_report(
    req: ReportRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a signed, tamper-evident PDF audit report.
    Downloads directly as a PDF file.
    """
    signing_key = _report_signing_key()
    effective_session = (
        req.session_id
        if req.session_id and current_user.global_role.value == "super_admin"
        else current_user.id
    )
    logs, manifest_jobs = _load_verified_job_records(effective_session, req)

    if not logs:
        raise HTTPException(404, "No completed, verified redaction jobs found for this account")

    # Build stats from logs
    total_docs     = len(logs)
    total_entities = sum(l.get("entities_discovered", 0) for l in logs)
    type_counts: dict[str, int] = {}
    for log in logs:
        for entity_type, count in log.get("entity_type_counts", {}).items():
            type_counts[entity_type] = type_counts.get(entity_type, 0) + count

    breakdown = sorted(
        [{"type": k, "count": v} for k, v in type_counts.items()],
        key=lambda x: x["count"], reverse=True
    )[:10]

    stats = {
        "total_documents":  total_docs,
        "total_entities":   total_entities,
        "top_entity_type":  breakdown[0]["type"] if breakdown else "N/A",
        "entity_breakdown": breakdown,
    }

    # Derive the report only from verified server job and artifact records.
    import uuid
    report_id    = f"RPT-{uuid.uuid4().hex[:12].upper()}"
    generated_at = datetime.now(timezone.utc).isoformat()
    conn = _get_db()
    try:
        # Serialize the hash-chain read/build/insert so concurrent reports cannot fork it.
        conn.execute("BEGIN IMMEDIATE")
        previous_order = conn.execute(
            "SELECT COALESCE(MAX(chain_order), 0) AS chain_order FROM report_ledger WHERE session_id = ?",
            (effective_session,),
        ).fetchone()["chain_order"]
        chain_order = int(previous_order) + 1
        previous = conn.execute(
            "SELECT content_hash FROM report_ledger WHERE session_id = ? AND chain_order = ?",
            (effective_session, chain_order - 1),
        ).fetchone() if chain_order > 1 else None
        prev_hash = previous["content_hash"] if previous else "GENESIS"
        manifest = {
            "schema_version": 1,
            "chain_order": chain_order,
            "report_id": report_id,
            "session_id": effective_session,
            "generated_at": generated_at,
            "report_title": req.report_title,
            "prev_hash": prev_hash,
            "stats": stats,
            "jobs": manifest_jobs,
        }
        manifest_json = _canonical_json(manifest)
        content_hash = hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()
        signature = hmac.new(signing_key, manifest_json.encode("utf-8"), hashlib.sha256).hexdigest()

        pdf_bytes = _build_pdf(
            session_id=effective_session,
            title=req.report_title,
            logs=logs,
            stats=stats,
            report_id=report_id,
            content_hash=content_hash,
            signature=signature,
            prev_hash=prev_hash,
            generated_at=generated_at,
            include_raw=req.include_raw_log,
        )
    except Exception as e:
        conn.rollback()
        if isinstance(e, HTTPException):
            raise
        if isinstance(e, RuntimeError):
            raise HTTPException(500, str(e)) from e
        logger.error("PDF generation failed: %s", e)
        raise HTTPException(500, "PDF generation failed") from e

    try:
        conn.execute("""
            INSERT INTO report_ledger
            (report_id, session_id, generated_at, content_hash, prev_hash, document_count, entity_count, report_title, manifest_json, signature, chain_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            report_id, effective_session, generated_at, content_hash, prev_hash,
            total_docs, total_entities, req.report_title, manifest_json, signature, chain_order,
        ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error("Report ledger write failed: %s", type(e).__name__)
        raise HTTPException(500, "Report could not be recorded") from e
    finally:
        conn.close()

    filename = f"ciphera_audit_{effective_session}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition":    f'attachment; filename="{filename}"',
            "X-Ciphera-Report-ID":    report_id,
            "X-Ciphera-Content-Hash": content_hash,
            "X-Ciphera-Signature":    signature,
            "X-Ciphera-Prev-Hash":    prev_hash,
        },
    )


@router.get("/verify/{content_hash}")
async def verify_report(
    content_hash: str,
    current_user: User = Depends(get_current_user),
):
    """
    Verify a report hash against the ledger.
    Returns the report metadata if the hash exists, 404 if not found (tampered/invalid).
    """
    signing_key = _report_signing_key()
    conn = _get_db()
    if current_user.global_role.value == "super_admin":
        row = conn.execute(
            "SELECT * FROM report_ledger WHERE content_hash = ?", (content_hash,)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM report_ledger WHERE content_hash = ? AND session_id = ?",
            (content_hash, current_user.id),
        ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(404, "Hash not found in ledger — report may be tampered or not generated by this instance")

    manifest_json = row["manifest_json"]
    stored_signature = row["signature"]
    if not manifest_json or not stored_signature:
        raise HTTPException(409, "Legacy report has no verifiable signed manifest")
    computed_hash = hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()
    expected_signature = hmac.new(signing_key, manifest_json.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed_hash, row["content_hash"]) or not hmac.compare_digest(expected_signature, stored_signature):
        raise HTTPException(409, "Report manifest integrity check failed")
    try:
        manifest = json.loads(manifest_json)
    except (TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(409, "Report manifest is invalid") from exc
    chain_order = row["chain_order"]
    chain_valid = False
    if chain_order == 1:
        chain_valid = row["prev_hash"] == "GENESIS"
    elif chain_order and chain_order > 1:
        chain_conn = _get_db()
        try:
            previous_row = chain_conn.execute(
                "SELECT content_hash, manifest_json, signature FROM report_ledger WHERE session_id = ? AND chain_order = ?",
                (row["session_id"], chain_order - 1),
            ).fetchone()
            if previous_row and previous_row["content_hash"] == row["prev_hash"] and previous_row["manifest_json"] and previous_row["signature"]:
                previous_manifest = previous_row["manifest_json"]
                chain_valid = (
                    hmac.compare_digest(hashlib.sha256(previous_manifest.encode("utf-8")).hexdigest(), previous_row["content_hash"])
                    and hmac.compare_digest(
                        hmac.new(signing_key, previous_manifest.encode("utf-8"), hashlib.sha256).hexdigest(),
                        previous_row["signature"],
                    )
                )
        finally:
            chain_conn.close()
    if (
        manifest.get("schema_version") != 1
        or manifest.get("report_id") != row["report_id"]
        or manifest.get("session_id") != row["session_id"]
        or manifest.get("generated_at") != row["generated_at"]
        or manifest.get("report_title") != row["report_title"]
        or manifest.get("chain_order") != chain_order
        or manifest.get("prev_hash") != row["prev_hash"]
        or manifest.get("stats", {}).get("total_documents") != row["document_count"]
        or manifest.get("stats", {}).get("total_entities") != row["entity_count"]
        or not chain_valid
        or not _verify_manifest_artifacts(manifest, row["session_id"])
    ):
        raise HTTPException(409, "Report job or artifact verification failed")

    return {
        "verified":      True,
        "report_id":     row["report_id"],
        "chain_order":   row["chain_order"],
        "session_id":    row["session_id"],
        "generated_at":  row["generated_at"],
        "content_hash":  row["content_hash"],
        "signature":     stored_signature,
        "prev_hash":     row["prev_hash"],
        "document_count":row["document_count"],
        "entity_count":  row["entity_count"],
        "report_title":  row["report_title"],
    }


@router.get("/report/history")
async def report_history(
    session_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """List all generated reports for a session (hash chain view)."""
    effective_session = (
        session_id
        if session_id and current_user.global_role.value == "super_admin"
        else current_user.id
    )
    conn = _get_db()
    try:
        rows = conn.execute(
            "SELECT report_id, session_id, generated_at, content_hash, prev_hash, document_count, entity_count, report_title, signature, chain_order "
            "FROM report_ledger WHERE session_id = ? ORDER BY chain_order DESC",
            (effective_session,),
        ).fetchall()
    finally:
        conn.close()

    return {
        "reports": [dict(r) for r in rows],
        "chain_length": len(rows),
    }
