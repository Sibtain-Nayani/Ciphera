"""
Ciphera V3.2 — Feature 16: Organisation & RBAC System
======================================================
Multi-tenant org system with role-based access control.

Roles:
  org_admin  — full access: manage members, API keys, billing, view all logs
  operator   — redact documents, create API keys, view own logs
  viewer     — view audit logs and reports only, no redaction via API

Schema:
  organisations — org accounts
  org_members   — user ↔ org membership with role
  org_invites   — pending invitations

Endpoints:
  POST /api/v3/orgs/create                — create org (any authed user)
  GET  /api/v3/orgs/me                    — my org info
  GET  /api/v3/orgs/{org_id}/members      — list members (admin only)
  POST /api/v3/orgs/{org_id}/invite       — invite user by email (admin)
  POST /api/v3/orgs/accept-invite         — accept invite token
  PUT  /api/v3/orgs/{org_id}/members/{uid}/role — change role (admin)
  DELETE /api/v3/orgs/{org_id}/members/{uid}    — remove member (admin)
  GET  /api/v3/orgs/{org_id}/usage        — usage stats (admin)
"""

from __future__ import annotations

import secrets
import logging
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field

from feature15_auth import get_current_user, get_db, require_admin

logger = logging.getLogger("ciphera.orgs")
router = APIRouter(prefix="/api/v3/orgs", tags=["Organisations"])

VALID_ROLES = {"org_admin", "operator", "viewer"}


# ── DB init ───────────────────────────────────────────────────────────────────
def _init_org_tables():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS organisations (
            org_id       TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            slug         TEXT UNIQUE NOT NULL,
            plan         TEXT DEFAULT 'free',
            owner_id     TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            is_active    INTEGER DEFAULT 1,
            -- Usage limits per plan
            max_members  INTEGER DEFAULT 3,
            max_api_keys INTEGER DEFAULT 2,
            monthly_doc_limit INTEGER DEFAULT 100
        );

        CREATE TABLE IF NOT EXISTS org_members (
            membership_id TEXT PRIMARY KEY,
            org_id        TEXT NOT NULL REFERENCES organisations(org_id) ON DELETE CASCADE,
            user_id       TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            role          TEXT NOT NULL DEFAULT 'operator',
            joined_at     TEXT NOT NULL,
            invited_by    TEXT,
            is_active     INTEGER DEFAULT 1,
            UNIQUE(org_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_org_members_org  ON org_members(org_id);

        CREATE TABLE IF NOT EXISTS org_invites (
            invite_id    TEXT PRIMARY KEY,
            org_id       TEXT NOT NULL REFERENCES organisations(org_id) ON DELETE CASCADE,
            email        TEXT NOT NULL,
            role         TEXT NOT NULL DEFAULT 'operator',
            token_hash   TEXT UNIQUE NOT NULL,
            invited_by   TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            expires_at   TEXT NOT NULL,
            accepted_at  TEXT,
            is_used      INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_invites_token ON org_invites(token_hash);
        CREATE INDEX IF NOT EXISTS idx_invites_email ON org_invites(email);
    """)
    conn.commit()
    conn.close()
    logger.info("Org tables initialised")


_init_org_tables()


# ── Helpers ───────────────────────────────────────────────────────────────────
import hashlib

def _hash_token(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def _get_membership(conn: sqlite3.Connection, user_id: str, org_id: str) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM org_members WHERE user_id = ? AND org_id = ? AND is_active = 1",
        (user_id, org_id)
    ).fetchone()


def _require_org_role(conn: sqlite3.Connection, user_id: str, org_id: str, min_role: str):
    """Raise 403 if user doesn't have at least min_role in org."""
    membership = _get_membership(conn, user_id, org_id)
    if not membership:
        raise HTTPException(403, "Not a member of this organisation")
    role_order = {"viewer": 0, "operator": 1, "org_admin": 2}
    if role_order.get(membership["role"], -1) < role_order.get(min_role, 99):
        raise HTTPException(403, f"Requires {min_role} role or higher")
    return membership


def _slugify(name: str) -> str:
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")
    return f"{slug}-{secrets.token_hex(3)}"


# ── Models ────────────────────────────────────────────────────────────────────
class CreateOrgRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)

class InviteRequest(BaseModel):
    email: EmailStr
    role:  str = Field("operator", pattern="^(org_admin|operator|viewer)$")

class AcceptInviteRequest(BaseModel):
    token: str

class ChangeRoleRequest(BaseModel):
    role: str = Field(..., pattern="^(org_admin|operator|viewer)$")

class OrgResponse(BaseModel):
    org_id:     str
    name:       str
    slug:       str
    plan:       str
    owner_id:   str
    created_at: str
    member_count: int
    your_role:  str

class MemberResponse(BaseModel):
    user_id:   str
    email:     str
    full_name: str
    role:      str
    joined_at: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create", response_model=OrgResponse, status_code=201)
async def create_org(req: CreateOrgRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    conn    = get_db()

    # Check user isn't already in an org (free plan: 1 org per user)
    existing = conn.execute(
        "SELECT org_id FROM org_members WHERE user_id = ? AND is_active = 1",
        (user_id,)
    ).fetchone()
    if existing:
        conn.close()
        raise HTTPException(409, "You are already a member of an organisation. Leave it first.")

    now    = datetime.now(timezone.utc).isoformat()
    org_id = f"org_{secrets.token_hex(12)}"
    slug   = _slugify(req.name)
    mem_id = f"mem_{secrets.token_hex(8)}"

    conn.execute("""
        INSERT INTO organisations (org_id, name, slug, plan, owner_id, created_at, updated_at)
        VALUES (?, ?, ?, 'free', ?, ?, ?)
    """, (org_id, req.name, slug, user_id, now, now))

    conn.execute("""
        INSERT INTO org_members (membership_id, org_id, user_id, role, joined_at, invited_by, is_active)
        VALUES (?, ?, ?, 'org_admin', ?, ?, 1)
    """, (mem_id, org_id, user_id, now, user_id))

    conn.commit()
    conn.close()
    logger.info("Org created: %s by user %s", org_id, user_id)

    return OrgResponse(
        org_id=org_id, name=req.name, slug=slug, plan="free",
        owner_id=user_id, created_at=now, member_count=1, your_role="org_admin",
    )


@router.get("/me", response_model=OrgResponse)
async def get_my_org(current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(404, "You are not a member of any organisation")

    conn = get_db()
    org  = conn.execute("SELECT * FROM organisations WHERE org_id = ?", (org_id,)).fetchone()
    if not org:
        conn.close()
        raise HTTPException(404, "Organisation not found")

    membership   = _get_membership(conn, current_user["sub"], org_id)
    member_count = conn.execute(
        "SELECT COUNT(*) FROM org_members WHERE org_id = ? AND is_active = 1", (org_id,)
    ).fetchone()[0]
    conn.close()

    return OrgResponse(
        org_id=org["org_id"], name=org["name"], slug=org["slug"],
        plan=org["plan"], owner_id=org["owner_id"], created_at=org["created_at"],
        member_count=member_count,
        your_role=membership["role"] if membership else "unknown",
    )


@router.get("/{org_id}/members", response_model=list[MemberResponse])
async def list_members(org_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    _require_org_role(conn, current_user["sub"], org_id, "viewer")

    rows = conn.execute("""
        SELECT u.user_id, u.email, u.full_name, om.role, om.joined_at
        FROM org_members om
        JOIN users u ON u.user_id = om.user_id
        WHERE om.org_id = ? AND om.is_active = 1
        ORDER BY om.joined_at ASC
    """, (org_id,)).fetchall()
    conn.close()

    return [MemberResponse(**dict(r)) for r in rows]


@router.post("/{org_id}/invite")
async def invite_member(org_id: str, req: InviteRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    mem  = _require_org_role(conn, current_user["sub"], org_id, "org_admin")

    org = conn.execute("SELECT * FROM organisations WHERE org_id = ?", (org_id,)).fetchone()
    if not org:
        conn.close()
        raise HTTPException(404, "Organisation not found")

    # Check member limit
    count = conn.execute(
        "SELECT COUNT(*) FROM org_members WHERE org_id = ? AND is_active = 1", (org_id,)
    ).fetchone()[0]
    if count >= org["max_members"]:
        conn.close()
        raise HTTPException(403, f"Member limit reached ({org['max_members']}). Upgrade plan.")

    # Check if already a member
    existing_user = conn.execute("SELECT user_id FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
    if existing_user:
        already_member = _get_membership(conn, existing_user["user_id"], org_id)
        if already_member:
            conn.close()
            raise HTTPException(409, "User is already a member of this organisation")

    now       = datetime.now(timezone.utc)
    raw_token = secrets.token_urlsafe(32)
    invite_id = f"inv_{secrets.token_hex(8)}"
    expires   = (now + timedelta(days=7)).isoformat()

    conn.execute("""
        INSERT INTO org_invites (invite_id, org_id, email, role, token_hash, invited_by, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (invite_id, org_id, req.email.lower(), req.role,
          _hash_token(raw_token), current_user["sub"], now.isoformat(), expires))
    conn.commit()
    conn.close()

    logger.info("Invite sent to %s for org %s", req.email, org_id)

    # In production: send email with invite link
    # For now: return the token directly (frontend shows it or sends email)
    return {
        "ok":         True,
        "invite_id":  invite_id,
        "invite_token": raw_token,  # frontend would email this
        "expires_at": expires,
        "message":    f"Invite created for {req.email}. Share the invite_token with them.",
        "invite_link": f"https://your-domain.com/accept-invite?token={raw_token}",
    }


@router.post("/accept-invite")
async def accept_invite(req: AcceptInviteRequest, current_user: dict = Depends(get_current_user)):
    tok_hash = _hash_token(req.token)
    now      = datetime.now(timezone.utc)
    conn     = get_db()

    invite = conn.execute(
        "SELECT * FROM org_invites WHERE token_hash = ? AND is_used = 0",
        (tok_hash,)
    ).fetchone()

    if not invite:
        conn.close()
        raise HTTPException(404, "Invalid or already used invite token")

    expires_at = datetime.fromisoformat(invite["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        conn.close()
        raise HTTPException(410, "Invite token has expired")

    # Check email matches
    user = conn.execute("SELECT * FROM users WHERE user_id = ?", (current_user["sub"],)).fetchone()
    if user["email"] != invite["email"]:
        conn.close()
        raise HTTPException(403, f"This invite was sent to {invite['email']}, not your account.")

    # Add to org
    mem_id = f"mem_{secrets.token_hex(8)}"
    try:
        conn.execute("""
            INSERT INTO org_members (membership_id, org_id, user_id, role, joined_at, invited_by)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (mem_id, invite["org_id"], current_user["sub"], invite["role"],
              now.isoformat(), invite["invited_by"]))
        conn.execute(
            "UPDATE org_invites SET is_used = 1, accepted_at = ? WHERE invite_id = ?",
            (now.isoformat(), invite["invite_id"])
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(409, "Already a member of this organisation")

    conn.close()
    return {"ok": True, "org_id": invite["org_id"], "role": invite["role"],
            "message": "Successfully joined organisation. Log in again to refresh your token."}


@router.put("/{org_id}/members/{target_user_id}/role")
async def change_member_role(
    org_id: str,
    target_user_id: str,
    req: ChangeRoleRequest,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    _require_org_role(conn, current_user["sub"], org_id, "org_admin")

    org = conn.execute("SELECT * FROM organisations WHERE org_id = ?", (org_id,)).fetchone()
    # Cannot demote the owner
    if org and org["owner_id"] == target_user_id and req.role != "org_admin":
        conn.close()
        raise HTTPException(403, "Cannot change role of org owner")

    conn.execute(
        "UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ? AND is_active = 1",
        (req.role, org_id, target_user_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True, "new_role": req.role}


@router.delete("/{org_id}/members/{target_user_id}")
async def remove_member(
    org_id: str,
    target_user_id: str,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    _require_org_role(conn, current_user["sub"], org_id, "org_admin")

    org = conn.execute("SELECT * FROM organisations WHERE org_id = ?", (org_id,)).fetchone()
    if org and org["owner_id"] == target_user_id:
        conn.close()
        raise HTTPException(403, "Cannot remove the org owner")

    conn.execute(
        "UPDATE org_members SET is_active = 0 WHERE org_id = ? AND user_id = ?",
        (org_id, target_user_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True, "message": "Member removed"}


@router.get("/{org_id}/usage")
async def get_org_usage(org_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    _require_org_role(conn, current_user["sub"], org_id, "viewer")

    org = conn.execute("SELECT * FROM organisations WHERE org_id = ?", (org_id,)).fetchone()
    if not org:
        conn.close()
        raise HTTPException(404, "Organisation not found")

    member_count = conn.execute(
        "SELECT COUNT(*) FROM org_members WHERE org_id = ? AND is_active = 1", (org_id,)
    ).fetchone()[0]

    api_key_count = conn.execute(
        "SELECT COUNT(*) FROM api_keys_v2 WHERE org_id = ? AND is_active = 1", (org_id,)
    ).fetchone()[0] if _table_exists(conn, "api_keys_v2") else 0

    # Audit usage this month
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    doc_count   = conn.execute("""
        SELECT COUNT(*), SUM(entities_discovered) FROM audit_logs
        WHERE session_id LIKE ? AND created_at >= ?
    """, (f"%org:{org_id}%", month_start)).fetchone()

    conn.close()

    return {
        "org_id":         org["org_id"],
        "plan":           org["plan"],
        "members":        {"used": member_count,   "limit": org["max_members"]},
        "api_keys":       {"used": api_key_count,  "limit": org["max_api_keys"]},
        "docs_this_month":{"count": doc_count[0] or 0, "entities": doc_count[1] or 0,
                          "limit": org["monthly_doc_limit"]},
    }


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None
