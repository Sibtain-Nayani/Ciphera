"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, User, Key, Building2, LogOut, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Trash2, Monitor, Clock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/auth";
import Link from "next/link";

// ── Shared section wrapper ────────────────────────────────────────────────────
function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
    return (
        <div style={{ border: "1px solid rgba(239,239,239,0.1)", marginBottom: "32px", borderRadius: "8px", overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(239,239,239,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)" }}>
                <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#EFEFEF" }}>{title}</span>
                {meta && <span style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)" }}>{meta}</span>}
            </div>
            <div style={{ padding: "28px 24px" }}>{children}</div>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ marginBottom: "20px" }}>
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", marginBottom: "6px", fontWeight: 600 }}>{label}</div>
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: "16px", color: "#EFEFEF", fontWeight: 500 }}>{value}</div>
        </div>
    );
}

function PlanBadge({ plan }: { plan: string }) {
    const color = plan === "free" ? "rgba(239,239,239,0.3)" : "#F5C400";
    return (
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color, border: `1px solid ${color}40`, padding: "4px 12px", borderRadius: "4px", background: `${color}10` }}>
            {plan}
        </span>
    );
}

// ── Change Password ────────────────────────────────────────────────────────────
function ChangePasswordForm() {
    const [current,  setCurrent]  = useState("");
    const [next,     setNext]     = useState("");
    const [showCurr, setShowCurr] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [busy,     setBusy]     = useState(false);
    const [msg,      setMsg]      = useState<{ type: "ok" | "err"; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (next.length < 8) { setMsg({ type: "err", text: "New password must be at least 8 characters." }); return; }
        setBusy(true); setMsg(null);
        try {
            const res = await authFetch("/api/v3/auth/change-password", {
                method: "POST",
                body: JSON.stringify({ current_password: current, new_password: next }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
            setMsg({ type: "ok", text: "Password changed. All other sessions have been signed out." });
            setCurrent(""); setNext("");
        } catch (err: any) {
            setMsg({ type: "err", text: err.message });
        } finally { setBusy(false); }
    };

    const inputStyle: React.CSSProperties = { width: "100%", background: "#0a0a0a", border: "1px solid rgba(239,239,239,0.15)", borderRadius: "4px", padding: "12px 42px 12px 14px", fontFamily: "Arial, sans-serif", fontSize: "15px", color: "#EFEFEF", outline: "none", boxSizing: "border-box", transition: "all 0.2s" };

    return (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {msg && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderRadius: "4px", background: msg.type === "ok" ? "rgba(34,197,94,0.08)" : "rgba(185,28,28,0.08)", border: `1px solid ${msg.type === "ok" ? "rgba(34,197,94,0.25)" : "rgba(185,28,28,0.25)"}` }}>
                    {msg.type === "ok" ? <CheckCircle2 style={{ width: 16, height: 16, color: "#22c55e", flexShrink: 0 }} /> : <AlertCircle style={{ width: 16, height: 16, color: "#B91C1C", flexShrink: 0 }} />}
                    <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 500, fontSize: "14px", color: msg.type === "ok" ? "#86efac" : "#fca5a5" }}>{msg.text}</span>
                </div>
            )}
            {[
                { label: "Current Password", val: current, set: setCurrent, show: showCurr, toggleShow: () => setShowCurr(v => !v), auto: "current-password" },
                { label: "New Password",     val: next,    set: setNext,    show: showNext, toggleShow: () => setShowNext(v => !v), auto: "new-password" },
            ].map(({ label, val, set, show, toggleShow, auto }) => (
                <div key={label}>
                    <label style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(239,239,239,0.6)", display: "block", marginBottom: "8px" }}>{label}</label>
                    <div style={{ position: "relative" }}>
                        <input type={show ? "text" : "password"} required autoComplete={auto} value={val} onChange={e => set(e.target.value)}
                            style={inputStyle}
                            onFocus={e => { e.currentTarget.style.borderColor = "rgba(245,196,0,0.6)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(245,196,0,0.15)"; }}
                            onBlur={e  => { e.currentTarget.style.borderColor = "rgba(239,239,239,0.15)"; e.currentTarget.style.boxShadow = "none"; }} />
                        <button type="button" onClick={toggleShow} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.4)", padding: 0, transition: "color 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#EFEFEF"}
                            onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.4)"}>
                            {show ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                        </button>
                    </div>
                </div>
            ))}
            <button type="submit" disabled={busy}
                style={{ background: busy ? "rgba(245,196,0,0.4)" : "#F5C400", color: "#080808", border: "none", borderRadius: "4px", padding: "12px 24px", fontFamily: "Arial, sans-serif", fontSize: "13px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", transition: "all 0.2s", alignSelf: "flex-start", marginTop: "8px", boxShadow: busy ? "none" : "0 4px 12px rgba(245,196,0,0.25)" }}
                onMouseEnter={e => { if(!busy) e.currentTarget.style.background = "#ffe166"; }}
                onMouseLeave={e => { if(!busy) e.currentTarget.style.background = "#F5C400"; }}>
                {busy && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
                Update Password
            </button>
        </form>
    );
}

// ── Active Sessions ────────────────────────────────────────────────────────────
function ActiveSessions() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [busy,     setBusy]     = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await authFetch("/api/v3/auth/sessions");
            if (res.ok) { const d = await res.json(); setSessions(d.sessions || []); }
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const logoutAll = async () => {
        setBusy(true);
        await authFetch("/api/v3/auth/logout-all", { method: "POST" });
        document.cookie = "ciphera_authed=; path=/; max-age=0";
        window.location.href = "/login";
    };

    return (
        <div>
            {loading ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "rgba(239,239,239,0.4)" }}>
                    <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                    <span style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Loading sessions…</span>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                    {sessions.map((s, i) => (
                        <div key={s.session_id} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 20px", borderRadius: "6px", border: "1px solid rgba(239,239,239,0.1)", background: i === 0 ? "rgba(245,196,0,0.04)" : "transparent" }}>
                            <Monitor style={{ width: 20, height: 20, color: i === 0 ? "#F5C400" : "rgba(239,239,239,0.4)", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: "Arial, sans-serif", fontSize: "15px", fontWeight: 600, color: "#EFEFEF", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                                    {s.device_hint?.slice(0, 50) || "Unknown device"}
                                    {i === 0 && <span style={{ fontFamily: "Arial, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", color: "#F5C400", border: "1px solid rgba(245,196,0,0.4)", borderRadius: "3px", padding: "2px 6px", background: "rgba(245,196,0,0.1)" }}>CURRENT</span>}
                                </div>
                                <div style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", color: "rgba(239,239,239,0.5)", letterSpacing: "0.04em" }}>
                                    {s.ip_address} · Last active {new Date(s.last_used_at).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <button onClick={logoutAll} disabled={busy}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: "1px solid rgba(185,28,28,0.4)", borderRadius: "4px", color: "#fca5a5", padding: "10px 20px", fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(185,28,28,0.15)"; e.currentTarget.style.borderColor = "rgba(185,28,28,0.6)"; e.currentTarget.style.color = "#fecaca"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(185,28,28,0.4)"; e.currentTarget.style.color = "#fca5a5"; }}>
                <LogOut style={{ width: 14, height: 14 }} />
                Sign Out All Devices
            </button>
        </div>
    );
}

// ── Main Account Page ──────────────────────────────────────────────────────────
export default function AccountPage() {
    const { user, logout, loading } = useAuth();
    const router = useRouter();

    useEffect(() => { if (!loading && !user) router.replace("/login"); }, [user, loading]);

    const handleLogout = async () => {
        await logout();
        document.cookie = "ciphera_authed=; path=/; max-age=0";
        router.replace("/login");
    };

    if (loading || !user) return (
        <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 style={{ width: 20, height: 20, color: "#F5C400", animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <div style={{ maxWidth: "840px", margin: "0 auto", padding: "40px 32px", cursor: "none" }}>

            {/* Page header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "40px", flexWrap: "wrap", gap: "16px" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <span style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)" }}>// Account</span>
                    </div>
                    <h1 style={{ fontFamily: "Arial, sans-serif", fontWeight: 900, fontSize: "40px", textTransform: "uppercase", letterSpacing: "0.02em", color: "#EFEFEF", margin: 0, lineHeight: 1.1 }}>
                        {user.full_name}
                    </h1>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}>
                        <span style={{ fontFamily: "Arial, sans-serif", fontSize: "15px", color: "rgba(239,239,239,0.6)" }}>{user.email}</span>
                        <PlanBadge plan={user.plan} />
                    </div>
                </div>
                <button onClick={handleLogout}
                    style={{ display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: "1px solid rgba(239,239,239,0.15)", borderRadius: "4px", color: "rgba(239,239,239,0.6)", padding: "10px 20px", fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#EFEFEF"; e.currentTarget.style.borderColor = "rgba(239,239,239,0.4)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "rgba(239,239,239,0.6)"; e.currentTarget.style.borderColor = "rgba(239,239,239,0.15)"; e.currentTarget.style.background = "transparent"; }}>
                    <LogOut style={{ width: 14, height: 14 }} /> Sign Out
                </button>
            </div>

            {/* Nav tabs */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid rgba(239,239,239,0.1)", marginBottom: "36px" }}>
                {[
                    { label: "Profile",      href: "/account" },
                    { label: "Organisation", href: "/account/organisation" },
                    { label: "API Keys",     href: "/account/api-keys" },
                ].map(tab => {
                    const active = typeof window !== "undefined" && window.location.pathname === tab.href;
                    return (
                        <Link key={tab.href} href={tab.href}
                            style={{ fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: "13px", letterSpacing: "0.1em", textTransform: "uppercase", color: active ? "#F5C400" : "rgba(239,239,239,0.5)", textDecoration: "none", padding: "12px 20px", borderBottom: `3px solid ${active ? "#F5C400" : "transparent"}`, transition: "all 0.2s" }}>
                            {tab.label}
                        </Link>
                    );
                })}
            </div>

            {/* Profile info */}
            <Section title="Profile Information">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
                    <Field label="Full Name"  value={user.full_name} />
                    <Field label="Email"      value={user.email} />
                    <Field label="Plan"       value={user.plan.toUpperCase()} />
                    <Field label="Role"       value={(user.role || "user").toUpperCase()} />
                    {user.org_id && <Field label="Organisation ID" value={user.org_id} />}
                </div>
            </Section>

            {/* Change password */}
            <Section title="Change Password">
                <ChangePasswordForm />
            </Section>

            {/* Active sessions */}
            <Section title="Active Sessions">
                <ActiveSessions />
            </Section>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
