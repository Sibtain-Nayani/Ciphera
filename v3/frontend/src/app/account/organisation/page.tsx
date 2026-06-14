"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Users, Plus, Loader2, Copy, Check, Crown, Shield, Eye, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useUiStore } from "@/store/uiStore";

function TabBar() {
    return (
        <div style={{ display: "flex", borderBottom: "1px solid rgba(239,239,239,0.08)", marginBottom: "28px" }}>
            {[
                { label: "Profile",      href: "/account" },
                { label: "Organisation", href: "/account/organisation" },
                { label: "API Keys",     href: "/account/api-keys" },
            ].map(tab => {
                const active = typeof window !== "undefined" && window.location.pathname === tab.href;
                return (
                    <Link key={tab.href} href={tab.href} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: active ? 700 : 500, color: active ? "#F5C400" : "rgba(239,239,239,0.4)", textDecoration: "none", padding: "12px 24px", borderBottom: `2px solid ${active ? "#F5C400" : "transparent"}`, background: active ? "rgba(245,196,0,0.03)" : "transparent", transition: "all 0.15s" }}>
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}

const INPUT: React.CSSProperties = {
    background: "#080808", border: "1px solid rgba(239,239,239,0.12)",
    padding: "9px 12px", fontFamily: '"IBM Plex Mono", monospace',
    fontSize: "11px", color: "#EFEFEF", outline: "none",
    transition: "border-color 0.15s",
};

const ROLE_COLORS: Record<string, string> = { org_admin: "#F5C400", operator: "#60A5FA", viewer: "#94A3B8" };
const ROLE_ICONS: Record<string, React.ReactNode> = {
    org_admin: <Crown style={{ width: 10, height: 10 }} />,
    operator:  <Shield style={{ width: 10, height: 10 }} />,
    viewer:    <Eye style={{ width: 10, height: 10 }} />,
};

export default function OrganisationPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const [org,      setOrg]      = useState<any>(null);
    const [members,  setMembers]  = useState<any[]>([]);
    const [usage,    setUsage]    = useState<any>(null);
    const [pageLoad, setPageLoad] = useState(true);
    const [busy,     setBusy]     = useState(false);

    const [createMode, setCreateMode] = useState(false);
    const [orgName,    setOrgName]    = useState("");
    const [createErr,  setCreateErr]  = useState("");

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole,  setInviteRole]  = useState<"operator"|"viewer"|"org_admin">("operator");
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [inviteErr,   setInviteErr]   = useState("");
    const [copied,      setCopied]      = useState(false);
    const [changingRole,setChangingRole]= useState<string | null>(null);

    useEffect(() => {
        if (!loading && !user) router.replace("/login");
        if (!loading && user?.is_guest) router.replace("/register");
    }, [user, loading]);

    const loadOrg = useCallback(async () => {
        setPageLoad(true);
        try {
            const res = await apiFetch("/api/v3/orgs/me");
            if (res.status === 404) { setOrg(null); return; }
            if (!res.ok) return;
            const data = await res.json();
            setOrg(data);
            const [mRes, uRes] = await Promise.all([
                apiFetch(`/api/v3/orgs/${data.org_id}/members`),
                apiFetch(`/api/v3/orgs/${data.org_id}/usage`),
            ]);
            if (mRes.ok) setMembers(await mRes.json());
            if (uRes.ok) setUsage(await uRes.json());
        } finally { setPageLoad(false); }
    }, []);

    useEffect(() => { if (!loading && user) loadOrg(); }, [user, loading]);

    const createOrg = async (e: React.FormEvent) => {
        e.preventDefault(); setCreateErr(""); setBusy(true);
        try {
            const res = await apiFetch("/api/v3/orgs/create", { method: "POST", body: JSON.stringify({ name: orgName }) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
            await loadOrg(); setCreateMode(false); setOrgName("");
        } catch (err: any) { setCreateErr(err.message); }
        finally { setBusy(false); }
    };

    const invite = async (e: React.FormEvent) => {
        e.preventDefault(); setInviteErr(""); setInviteToken(null); setBusy(true);
        try {
            const res = await apiFetch(`/api/v3/orgs/${org.org_id}/invite`, { method: "POST", body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
            const d = await res.json();
            setInviteToken(d.invite_token); setInviteEmail("");
        } catch (err: any) { setInviteErr(err.message); }
        finally { setBusy(false); }
    };

    const changeRole = async (userId: string, role: string) => {
        setChangingRole(userId);
        try {
            await apiFetch(`/api/v3/orgs/${org.org_id}/members/${userId}/role`, { method: "PUT", body: JSON.stringify({ role }) });
            await loadOrg();
        } finally { setChangingRole(null); }
    };

    const removeMember = async (userId: string) => {
        if (!confirm("Remove this member from the organisation?")) return;
        await apiFetch(`/api/v3/orgs/${org.org_id}/members/${userId}`, { method: "DELETE" });
        useUiStore.getState().addToast("Member removed.", "success");
        await loadOrg();
    };

    const copyToken = () => {
        if (inviteToken) { navigator.clipboard.writeText(inviteToken); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    };

    if (loading || pageLoad) return (
        <div style={{ minHeight: "100vh", background: "#0D0D0D", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 style={{ width: 18, height: 18, color: "#F5C400", animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <div style={{ maxWidth: "820px", margin: "0 auto", padding: "40px 32px", cursor: "none" }}>
            {/* Header */}
            <header style={{ paddingBottom: "24px", borderBottom: "1px solid rgba(239,239,239,0.07)", marginBottom: "32px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ width: "18px", height: "2px", background: "rgba(185,28,28,0.8)" }} />
                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(185,28,28,0.8)" }}>// ACCOUNT</span>
                </div>
                <h1 style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "clamp(32px,4vw,48px)", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: 0, lineHeight: 1 }}>Organisation</h1>
            </header>

            <TabBar />

            {/* ── No org state ─────────────────────────────────────────────── */}
            {!org ? (
                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "48px", textAlign: "center", background: "#111113" }}>
                    <Building2 style={{ width: 28, height: 28, color: "rgba(239,239,239,0.15)", margin: "0 auto 14px" }} />
                    <h2 style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "22px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#EFEFEF", margin: "0 0 8px" }}>No Organisation Yet</h2>
                    <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: "13px", color: "rgba(239,239,239,0.4)", margin: "0 0 24px", lineHeight: 1.6 }}>Create an org to manage team members and API key quotas.</p>
                    {!createMode ? (
                        <button onClick={() => setCreateMode(true)}
                            style={{ background: "#F5C400", color: "#080808", border: "none", padding: "10px 24px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}>
                            Create Organisation →
                        </button>
                    ) : (
                        <form onSubmit={createOrg} style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                            {createErr && <div style={{ width: "100%", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", color: "#fca5a5" }}>{createErr}</div>}
                            <input required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Organisation name"
                                style={{ ...INPUT, width: "240px" }}
                                onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                            <button type="submit" disabled={busy}
                                style={{ background: "#F5C400", color: "#080808", border: "none", padding: "9px 20px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                                {busy && <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />} Create
                            </button>
                            <button type="button" onClick={() => setCreateMode(false)}
                                style={{ background: "transparent", border: "1px solid rgba(239,239,239,0.12)", color: "rgba(239,239,239,0.4)", padding: "9px 16px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", cursor: "pointer", letterSpacing: "0.16em", textTransform: "uppercase" }}>Cancel</button>
                        </form>
                    )}
                </div>
            ) : (
                <>
                    {/* ── Org header card ───────────────────────────────────── */}
                    <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "20px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", background: "#111113", position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, #F5C400, transparent)", opacity: 0.3 }} />
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                                <Building2 style={{ width: 13, height: 13, color: "#F5C400" }} />
                                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "20px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#EFEFEF" }}>{org.name}</span>
                            </div>
                            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)" }}>
                                {org.slug} · {(org.plan || "free").toUpperCase()} · Your role: <span style={{ color: ROLE_COLORS[org.your_role] || "#EFEFEF" }}>{(org.your_role || "").toUpperCase()}</span>
                            </div>
                        </div>
                        {usage && (
                            <div style={{ display: "flex", gap: "24px" }}>
                                {[
                                    { label: "Members",   used: usage.members?.used,          limit: usage.members?.limit },
                                    { label: "API Keys",  used: usage.api_keys?.used,         limit: usage.api_keys?.limit },
                                    { label: "Docs / mo", used: usage.docs_this_month?.count, limit: usage.docs_this_month?.limit },
                                ].map(({ label, used, limit }) => {
                                    const pct = limit ? (used / limit) * 100 : 0;
                                    const barColor = pct >= 95 ? "#ef4444" : pct >= 80 ? "#F5C400" : "#4ade80";
                                    return (
                                        <div key={label} style={{ textAlign: "center" }}>
                                            <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "22px", color: "#EFEFEF", lineHeight: 1 }}>
                                                {used}<span style={{ fontSize: "12px", color: "rgba(239,239,239,0.3)", fontWeight: 400 }}>/{limit}</span>
                                            </div>
                                            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "7px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", marginTop: "3px" }}>{label}</div>
                                            <div style={{ height: "2px", background: "rgba(239,239,239,0.08)", marginTop: "4px" }}>
                                                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barColor, transition: "width 0.6s ease" }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Members list ──────────────────────────────────────── */}
                    <div style={{ border: "1px solid rgba(239,239,239,0.07)", marginBottom: "16px", background: "#111113" }}>
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(239,239,239,0.07)", display: "flex", alignItems: "center", gap: "8px" }}>
                            <Users style={{ width: 12, height: 12, color: "#F5C400" }} />
                            <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#EFEFEF" }}>Members</span>
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", color: "rgba(239,239,239,0.3)", marginLeft: "auto" }}>{members.length} member{members.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div>
                            {(Array.isArray(members) ? members : []).map((m, i) => (
                                <div key={m.user_id}
                                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px", borderBottom: i < members.length - 1 ? "1px solid rgba(239,239,239,0.05)" : "none", transition: "background 0.15s" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(245,196,0,0.02)"}
                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                    {/* Avatar */}
                                    <div style={{ width: 30, height: 30, background: "rgba(245,196,0,0.1)", border: "1px solid rgba(245,196,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "12px", color: "#F5C400" }}>{(m.full_name || "?")[0].toUpperCase()}</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: "13px", color: "#EFEFEF", fontWeight: 600 }}>{m.full_name}</div>
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", color: "rgba(239,239,239,0.35)", letterSpacing: "0.1em" }}>{m.email}</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        {org.your_role === "org_admin" && m.user_id !== user?.user_id ? (
                                            <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)} disabled={changingRole === m.user_id}
                                                style={{ background: "#0D0D0D", border: `1px solid ${ROLE_COLORS[m.role] || "#6B7280"}40`, color: ROLE_COLORS[m.role] || "#6B7280", fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 8px", cursor: "pointer", outline: "none" }}>
                                                {["org_admin","operator","viewer"].map(r => <option key={r} value={r} style={{ background: "#0D0D0D" }}>{r.replace("_", " ")}</option>)}
                                            </select>
                                        ) : (
                                            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: ROLE_COLORS[m.role] || "#6B7280", border: `1px solid ${ROLE_COLORS[m.role] || "#6B7280"}30`, padding: "3px 8px" }}>
                                                {ROLE_ICONS[m.role]} {(m.role || "").replace("_", " ")}
                                            </span>
                                        )}
                                        {org.your_role === "org_admin" && m.user_id !== user?.user_id && (
                                            <button onClick={() => removeMember(m.user_id)}
                                                style={{ background: "none", border: "1px solid transparent", color: "rgba(239,239,239,0.22)", padding: "4px 6px", cursor: "pointer", display: "flex", transition: "all 0.15s" }}
                                                onMouseEnter={e => { e.currentTarget.style.color = "#fca5a5"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)"; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = "rgba(239,239,239,0.22)"; e.currentTarget.style.borderColor = "transparent"; }}>
                                                <Trash2 style={{ width: 12, height: 12 }} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {members.length === 0 && (
                                <div style={{ padding: "24px", textAlign: "center", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.25)" }}>No members yet</div>
                            )}
                        </div>
                    </div>

                    {/* ── Invite (org_admin only) ───────────────────────────── */}
                    {org.your_role === "org_admin" && (
                        <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "20px", background: "#111113" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                                <Plus style={{ width: 12, height: 12, color: "#F5C400" }} />
                                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#EFEFEF" }}>Invite Member</span>
                            </div>
                            {inviteToken ? (
                                <div>
                                    <div style={{ padding: "12px 16px", background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.2)", marginBottom: "12px" }}>
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#4ade80", marginBottom: "8px" }}>✓ Invite created — share this token with the invitee</div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", color: "#EFEFEF", background: "#080808", padding: "6px 10px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid rgba(239,239,239,0.1)" }}>{inviteToken}</code>
                                            <button onClick={copyToken}
                                                style={{ background: "#F5C400", color: "#080808", border: "none", padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.12em", fontWeight: 700, flexShrink: 0 }}>
                                                {copied ? <Check style={{ width: 11, height: 11 }} /> : <Copy style={{ width: 11, height: 11 }} />}
                                                {copied ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", color: "rgba(239,239,239,0.3)", marginTop: "8px", letterSpacing: "0.1em" }}>
                                            Note: email delivery not implemented yet. Share the token directly with the invitee.
                                        </div>
                                    </div>
                                    <button onClick={() => setInviteToken(null)}
                                        style={{ background: "transparent", border: "1px solid rgba(239,239,239,0.1)", color: "rgba(239,239,239,0.4)", padding: "7px 14px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
                                        New Invite
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={invite} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                                    {inviteErr && <div style={{ width: "100%", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", color: "#fca5a5" }}>{inviteErr}</div>}
                                    <div style={{ flex: "1 1 200px" }}>
                                        <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "7px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", display: "block", marginBottom: "5px" }}>Email</label>
                                        <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com"
                                            style={{ ...INPUT, width: "100%" }}
                                            onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                            onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                                    </div>
                                    <div>
                                        <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "7px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", display: "block", marginBottom: "5px" }}>Role</label>
                                        <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}
                                            style={{ ...INPUT, cursor: "pointer", outline: "none" }}>
                                            {["operator","viewer","org_admin"].map(r => <option key={r} value={r} style={{ background: "#0D0D0D" }}>{r.replace("_", " ")}</option>)}
                                        </select>
                                    </div>
                                    <button type="submit" disabled={busy || !inviteEmail}
                                        style={{ background: busy || !inviteEmail ? "rgba(245,196,0,0.5)" : "#F5C400", color: "#080808", border: "none", padding: "9px 18px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, cursor: busy || !inviteEmail ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                                        {busy && <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />}
                                        Send Invite →
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}