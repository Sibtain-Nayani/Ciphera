"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Users, Plus, Loader2, AlertCircle, CheckCircle2, Crown, Shield, Eye, Trash2, Copy, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/auth";

function TabBar() {
    return (
        <div style={{ display: "flex", gap: "0px", borderBottom: "1px solid rgba(239,239,239,0.07)", marginBottom: "28px" }}>
            {[
                { label: "Profile",      href: "/account" },
                { label: "Organisation", href: "/account/organisation" },
                { label: "API Keys",     href: "/account/api-keys" },
            ].map(tab => {
                const active = typeof window !== "undefined" && window.location.pathname === tab.href;
                return (
                    <Link key={tab.href} href={tab.href}
                        style={{ fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", color: active ? "#F5C400" : "rgba(239,239,239,0.35)", textDecoration: "none", padding: "10px 16px", borderBottom: `2px solid ${active ? "#F5C400" : "transparent"}`, transition: "all 0.15s" }}>
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}

const ROLE_COLORS: Record<string, string> = { org_admin: "#F5C400", operator: "#60A5FA", viewer: "#94A3B8" };
const ROLE_ICONS: Record<string, React.ReactNode> = {
    org_admin: <Crown style={{ width: 11, height: 11 }} />,
    operator:  <Shield style={{ width: 11, height: 11 }} />,
    viewer:    <Eye style={{ width: 11, height: 11 }} />,
};

export default function OrganisationPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const [org,     setOrg]     = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [usage,   setUsage]   = useState<any>(null);
    const [pageLoad,setPageLoad]= useState(true);
    const [busy,    setBusy]    = useState(false);

    // Create org form
    const [createMode, setCreateMode] = useState(false);
    const [orgName,    setOrgName]    = useState("");
    const [createErr,  setCreateErr]  = useState("");

    // Invite form
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole,  setInviteRole]  = useState<"operator"|"viewer"|"org_admin">("operator");
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [inviteErr,   setInviteErr]   = useState("");
    const [copied,      setCopied]      = useState(false);

    // Change role
    const [changingRole, setChangingRole] = useState<string | null>(null);

    useEffect(() => { if (!loading && !user) router.replace("/login"); }, [user, loading]);

    const loadOrg = useCallback(async () => {
        setPageLoad(true);
        try {
            const res = await authFetch("/api/v3/orgs/me");
            if (res.status === 404) { setOrg(null); setPageLoad(false); return; }
            if (!res.ok) return;
            const data = await res.json();
            setOrg(data);
            // Load members + usage in parallel
            const [mRes, uRes] = await Promise.all([
                authFetch(`/api/v3/orgs/${data.org_id}/members`),
                authFetch(`/api/v3/orgs/${data.org_id}/usage`),
            ]);
            if (mRes.ok) setMembers(await mRes.json());
            if (uRes.ok) setUsage(await uRes.json());
        } finally { setPageLoad(false); }
    }, []);

    useEffect(() => { if (!loading && user) loadOrg(); }, [user, loading]);

    const createOrg = async (e: React.FormEvent) => {
        e.preventDefault(); setCreateErr(""); setBusy(true);
        try {
            const res = await authFetch("/api/v3/orgs/create", { method: "POST", body: JSON.stringify({ name: orgName }) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
            await loadOrg();
            setCreateMode(false); setOrgName("");
        } catch (err: any) { setCreateErr(err.message); }
        finally { setBusy(false); }
    };

    const invite = async (e: React.FormEvent) => {
        e.preventDefault(); setInviteErr(""); setInviteToken(null); setBusy(true);
        try {
            const res = await authFetch(`/api/v3/orgs/${org.org_id}/invite`, { method: "POST", body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
            const d = await res.json();
            setInviteToken(d.invite_token);
            setInviteEmail("");
        } catch (err: any) { setInviteErr(err.message); }
        finally { setBusy(false); }
    };

    const changeRole = async (userId: string, role: string) => {
        setChangingRole(userId);
        try {
            await authFetch(`/api/v3/orgs/${org.org_id}/members/${userId}/role`, { method: "PUT", body: JSON.stringify({ role }) });
            await loadOrg();
        } finally { setChangingRole(null); }
    };

    const removeMember = async (userId: string) => {
        if (!confirm("Remove this member?")) return;
        await authFetch(`/api/v3/orgs/${org.org_id}/members/${userId}`, { method: "DELETE" });
        await loadOrg();
    };

    const copyToken = () => {
        if (inviteToken) { navigator.clipboard.writeText(inviteToken); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    };

    if (loading || pageLoad) return (
        <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 style={{ width: 20, height: 20, color: "#F5C400", animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 24px", cursor: "none" }}>
            <div style={{ marginBottom: "28px" }}>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)" }}>// Account</span>
                <h1 style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "32px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: "4px 0 0" }}>Organisation</h1>
            </div>
            <TabBar />

            {!org ? (
                /* No org — create one */
                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "40px", textAlign: "center" }}>
                    <Building2 style={{ width: 32, height: 32, color: "rgba(239,239,239,0.2)", margin: "0 auto 16px" }} />
                    <h2 style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "20px", textTransform: "uppercase", color: "#EFEFEF", margin: "0 0 8px" }}>No Organisation Yet</h2>
                    <p style={{ fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "rgba(239,239,239,0.4)", margin: "0 0 24px" }}>Create an org to manage team members and API key quotas.</p>
                    {!createMode ? (
                        <button onClick={() => setCreateMode(true)} style={{ background: "#F5C400", color: "#080808", border: "none", padding: "10px 24px", fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}>
                            Create Organisation →
                        </button>
                    ) : (
                        <form onSubmit={createOrg} style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                            {createErr && <div style={{ width: "100%", fontFamily: "Barlow, sans-serif", fontSize: "12px", color: "#fca5a5" }}>{createErr}</div>}
                            <input required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Organisation name"
                                style={{ background: "#080808", border: "1px solid rgba(239,239,239,0.2)", padding: "10px 14px", fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "#EFEFEF", outline: "none", width: "240px" }}
                                onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.2)"} />
                            <button type="submit" disabled={busy} style={{ background: "#F5C400", color: "#080808", border: "none", padding: "10px 20px", fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                                {busy && <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />} Create
                            </button>
                            <button type="button" onClick={() => setCreateMode(false)} style={{ background: "transparent", border: "1px solid rgba(239,239,239,0.12)", color: "rgba(239,239,239,0.4)", padding: "10px 16px", fontFamily: "Courier New, monospace", fontSize: "9px", cursor: "pointer", letterSpacing: "0.16em", textTransform: "uppercase" }}>Cancel</button>
                        </form>
                    )}
                </div>
            ) : (
                <>
                    {/* Org header */}
                    <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "20px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                <Building2 style={{ width: 14, height: 14, color: "#F5C400" }} />
                                <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "18px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#EFEFEF" }}>{org.name}</span>
                            </div>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.16em", color: "rgba(239,239,239,0.3)" }}>
                                {org.slug} · {org.plan.toUpperCase()} · Your role: {org.your_role.toUpperCase()}
                            </div>
                        </div>
                        {usage && (
                            <div style={{ display: "flex", gap: "20px" }}>
                                {[
                                    { label: "Members",  used: usage.members?.used,  limit: usage.members?.limit },
                                    { label: "API Keys", used: usage.api_keys?.used, limit: usage.api_keys?.limit },
                                    { label: "Docs / mo",used: usage.docs_this_month?.count, limit: usage.docs_this_month?.limit },
                                ].map(({ label, used, limit }) => (
                                    <div key={label} style={{ textAlign: "center" }}>
                                        <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "20px", color: "#EFEFEF" }}>{used}<span style={{ fontSize: "12px", color: "rgba(239,239,239,0.3)" }}>/{limit}</span></div>
                                        <div style={{ fontFamily: "Courier New, monospace", fontSize: "7px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", marginTop: "2px" }}>{label}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Members */}
                    <div style={{ border: "1px solid rgba(239,239,239,0.07)", marginBottom: "20px" }}>
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(239,239,239,0.07)", display: "flex", alignItems: "center", gap: "8px" }}>
                            <Users style={{ width: 13, height: 13, color: "#F5C400" }} />
                            <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#EFEFEF" }}>Members</span>
                            <span style={{ fontFamily: "Courier New, monospace", fontSize: "8px", color: "rgba(239,239,239,0.3)", marginLeft: "auto" }}>{members.length} members</span>
                        </div>
                        <div>
                            {(Array.isArray(members) ? members : []).map((m, i) => (
                                <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px", borderBottom: i < members.length - 1 ? "1px solid rgba(239,239,239,0.05)" : "none" }}>
                                    <div style={{ width: 32, height: 32, background: "rgba(245,196,0,0.1)", border: "1px solid rgba(245,196,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "13px", color: "#F5C400" }}>{m.full_name[0].toUpperCase()}</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "#EFEFEF", fontWeight: 600 }}>{m.full_name}</div>
                                        <div style={{ fontFamily: "Courier New, monospace", fontSize: "8px", color: "rgba(239,239,239,0.35)", letterSpacing: "0.1em" }}>{m.email}</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        {org.your_role === "org_admin" && m.user_id !== user?.user_id ? (
                                            <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)} disabled={changingRole === m.user_id}
                                                style={{ background: "#0D0D0D", border: `1px solid ${ROLE_COLORS[m.role] || "#6B7280"}40`, color: ROLE_COLORS[m.role] || "#6B7280", fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 8px", cursor: "pointer", outline: "none" }}>
                                                {["org_admin","operator","viewer"].map(r => <option key={r} value={r}>{r.replace("_"," ")}</option>)}
                                            </select>
                                        ) : (
                                            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: ROLE_COLORS[m.role] || "#6B7280", border: `1px solid ${ROLE_COLORS[m.role] || "#6B7280"}30`, padding: "3px 7px" }}>
                                                {ROLE_ICONS[m.role]} {m.role.replace("_"," ")}
                                            </span>
                                        )}
                                        {org.your_role === "org_admin" && m.user_id !== user?.user_id && (
                                            <button onClick={() => removeMember(m.user_id)} style={{ background: "none", border: "none", color: "rgba(239,239,239,0.25)", cursor: "pointer", padding: "4px", display: "flex" }}
                                                onMouseEnter={e => e.currentTarget.style.color = "#fca5a5"}
                                                onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.25)"}>
                                                <Trash2 style={{ width: 12, height: 12 }} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Invite */}
                    {org.your_role === "org_admin" && (
                        <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "20px" }}>
                            <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#EFEFEF", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                                <Plus style={{ width: 13, height: 13, color: "#F5C400" }} /> Invite Member
                            </div>
                            {inviteToken ? (
                                <div>
                                    <div style={{ padding: "12px 16px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", marginBottom: "12px" }}>
                                        <div style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#22c55e", marginBottom: "8px" }}>✓ Invite created — share this token</div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <code style={{ fontFamily: "Courier New, monospace", fontSize: "10px", color: "#EFEFEF", background: "#080808", padding: "6px 10px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inviteToken}</code>
                                            <button onClick={copyToken} style={{ background: "#F5C400", color: "#080808", border: "none", padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.14em", flexShrink: 0 }}>
                                                {copied ? <Check style={{ width: 11, height: 11 }} /> : <Copy style={{ width: 11, height: 11 }} />}
                                                {copied ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                    </div>
                                    <button onClick={() => setInviteToken(null)} style={{ background: "transparent", border: "1px solid rgba(239,239,239,0.1)", color: "rgba(239,239,239,0.4)", padding: "7px 14px", fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
                                        New Invite
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={invite} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                                    {inviteErr && <div style={{ width: "100%", fontFamily: "Barlow, sans-serif", fontSize: "12px", color: "#fca5a5", marginBottom: "4px" }}>{inviteErr}</div>}
                                    <div style={{ flex: 1, minWidth: "200px" }}>
                                        <label style={{ fontFamily: "Courier New, monospace", fontSize: "7px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", display: "block", marginBottom: "5px" }}>Email</label>
                                        <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com"
                                            style={{ width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "9px 12px", fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "#EFEFEF", outline: "none", boxSizing: "border-box" }}
                                            onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                            onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                                    </div>
                                    <div>
                                        <label style={{ fontFamily: "Courier New, monospace", fontSize: "7px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", display: "block", marginBottom: "5px" }}>Role</label>
                                        <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}
                                            style={{ background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "9px 12px", fontFamily: "Courier New, monospace", fontSize: "9px", color: "#EFEFEF", cursor: "pointer", outline: "none", letterSpacing: "0.1em" }}>
                                            <option value="operator">Operator</option>
                                            <option value="viewer">Viewer</option>
                                            <option value="org_admin">Admin</option>
                                        </select>
                                    </div>
                                    <button type="submit" disabled={busy}
                                        style={{ background: "#F5C400", color: "#080808", border: "none", padding: "9px 18px", fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                                        {busy ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 11, height: 11 }} />}
                                        Invite
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
