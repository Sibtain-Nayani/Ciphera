"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    LogOut, Eye, EyeOff, Loader2, AlertCircle,
    CheckCircle2, Monitor, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

// ── Shared input style ────────────────────────────────────────────────────────
const INPUT: React.CSSProperties = {
    width: "100%",
    background: "#0a0a0a",
    border: "1px solid rgba(239,239,239,0.15)",
    padding: "11px 42px 11px 14px",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: "12px",
    color: "#EFEFEF",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
    letterSpacing: "0.04em",
};

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, eyebrow }: {
    title: string; children: React.ReactNode; eyebrow?: string;
}) {
    return (
        <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ width: "18px", height: "2px", background: "rgba(185,28,28,0.8)", flexShrink: 0 }} />
                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(185,28,28,0.8)" }}>
                    {eyebrow || title}
                </span>
            </div>
            <div style={{ border: "1px solid rgba(239,239,239,0.1)", background: "#111113", overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(239,239,239,0.07)", background: "#0D0D0D" }}>
                    <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#EFEFEF" }}>
                        {title}
                    </span>
                </div>
                <div style={{ padding: "24px 20px" }}>{children}</div>
            </div>
        </div>
    );
}

// ── Field display ─────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ marginBottom: "16px" }}>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", marginBottom: "5px" }}>{label}</div>
            <div style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: "15px", fontWeight: 500, color: "#EFEFEF" }}>{value || "—"}</div>
        </div>
    );
}

// ── Change password form ──────────────────────────────────────────────────────
function ChangePasswordForm() {
    const [current,  setCurrent]  = useState("");
    const [next,     setNext]     = useState("");
    const [showCurr, setShowCurr] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [busy,     setBusy]     = useState(false);
    const [msg,      setMsg]      = useState<{ type: "ok" | "err"; text: string } | null>(null);

    // Password strength
    const strength = next.length === 0 ? 0
        : next.length < 8 ? 1
        : next.length < 12 && !/[^a-zA-Z0-9]/.test(next) ? 2
        : 3;
    const strengthLabel = ["", "WEAK", "MODERATE", "STRONG"];
    const strengthColor = ["", "#ef4444", "#F5C400", "#4ade80"];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (next.length < 8) { setMsg({ type: "err", text: "New password must be at least 8 characters." }); return; }
        setBusy(true); setMsg(null);
        try {
            const res = await apiFetch("/api/v3/auth/change-password", {
                method: "POST",
                body: JSON.stringify({ current_password: current, new_password: next }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
            setMsg({ type: "ok", text: "Password updated. Other sessions have been signed out." });
            setCurrent(""); setNext("");
        } catch (err: any) {
            setMsg({ type: "err", text: err.message });
        } finally { setBusy(false); }
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {msg && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "10px 14px", background: msg.type === "ok" ? "rgba(74,222,128,0.06)" : "rgba(185,28,28,0.06)", border: `1px solid ${msg.type === "ok" ? "rgba(74,222,128,0.25)" : "rgba(185,28,28,0.25)"}` }}>
                    {msg.type === "ok"
                        ? <CheckCircle2 style={{ width: 14, height: 14, color: "#4ade80", flexShrink: 0, marginTop: 1 }} />
                        : <AlertCircle  style={{ width: 14, height: 14, color: "#ef4444", flexShrink: 0, marginTop: 1 }} />}
                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "11px", color: msg.type === "ok" ? "#86efac" : "#fca5a5", letterSpacing: "0.04em", lineHeight: 1.6 }}>{msg.text}</span>
                </div>
            )}

            {([
                { label: "Current Password", val: current, set: setCurrent, show: showCurr, toggle: () => setShowCurr(v => !v), auto: "current-password" },
                { label: "New Password",     val: next,    set: setNext,    show: showNext, toggle: () => setShowNext(v => !v), auto: "new-password" },
            ] as const).map(({ label, val, set, show, toggle, auto }) => (
                <div key={label}>
                    <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", display: "block", marginBottom: "5px" }}>{label}</label>
                    <div style={{ position: "relative" }}>
                        <input type={show ? "text" : "password"} required autoComplete={auto}
                            value={val} onChange={e => set(e.target.value)}
                            style={INPUT}
                            onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                            onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.15)"} />
                        <button type="button" onClick={toggle}
                            style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.35)", padding: 0, transition: "color 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#EFEFEF"}
                            onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.35)"}>
                            {show ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                        </button>
                    </div>
                    {/* Strength bar for new password */}
                    {auto === "new-password" && next.length > 0 && (
                        <div style={{ marginTop: "6px" }}>
                            <div style={{ height: "2px", background: "rgba(239,239,239,0.08)", display: "flex", gap: "2px" }}>
                                {[1,2,3].map(i => (
                                    <div key={i} style={{ flex: 1, background: i <= strength ? strengthColor[strength] : "transparent", transition: "background 0.2s" }} />
                                ))}
                            </div>
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.14em", color: strengthColor[strength], marginTop: "3px", display: "block" }}>{strengthLabel[strength]}</span>
                        </div>
                    )}
                </div>
            ))}

            <button type="submit" disabled={busy}
                style={{ background: busy ? "rgba(245,196,0,0.5)" : "#F5C400", color: "#080808", border: "none", padding: "11px 22px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "7px", transition: "all 0.15s", alignSelf: "flex-start", marginTop: "4px" }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "#ffe166"; }}
                onMouseLeave={e => { if (!busy) e.currentTarget.style.background = "#F5C400"; }}>
                {busy && <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />}
                {busy ? "Updating…" : "Update Password →"}
            </button>
        </form>
    );
}

// ── Active Sessions ───────────────────────────────────────────────────────────
function ActiveSessions() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [busy,     setBusy]     = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await apiFetch("/api/v3/auth/sessions");
            if (res.ok) { const d = await res.json(); setSessions(d.sessions || []); }
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const logoutAll = async () => {
        setBusy(true);
        await apiFetch("/api/v3/auth/logout-all", { method: "POST" });
        document.cookie = "ciphera_authed=; path=/; max-age=0";
        window.location.href = "/login";
    };

    if (loading) return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "20px 0", color: "rgba(239,239,239,0.35)" }}>
            <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase" }}>Loading sessions…</span>
        </div>
    );

    return (
        <div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
                {sessions.map((s, i) => (
                    <div key={s.session_id}
                        style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "14px 16px", border: `1px solid ${i === 0 ? "rgba(245,196,0,0.25)" : "rgba(239,239,239,0.07)"}`, background: i === 0 ? "rgba(245,196,0,0.03)" : "transparent", transition: "all 0.15s" }}>
                        <Monitor style={{ width: 16, height: 16, color: i === 0 ? "#F5C400" : "rgba(239,239,239,0.3)", flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                                <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: "14px", fontWeight: 600, color: "#EFEFEF" }}>
                                    {(s.device_hint || "Unknown device").slice(0, 60)}
                                </span>
                                {i === 0 && (
                                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", fontWeight: 700, letterSpacing: "0.12em", color: "#F5C400", border: "1px solid rgba(245,196,0,0.4)", padding: "2px 7px", background: "rgba(245,196,0,0.08)", textTransform: "uppercase" }}>CURRENT</span>
                                )}
                            </div>
                            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", color: "rgba(239,239,239,0.35)", letterSpacing: "0.08em" }}>
                                {s.ip_address} · Last active {new Date(s.last_used_at).toLocaleString()}
                            </div>
                        </div>
                    </div>
                ))}
                {sessions.length === 0 && (
                    <div style={{ padding: "20px", textAlign: "center", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)" }}>
                        No active sessions found
                    </div>
                )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button onClick={load} disabled={loading}
                    style={{ display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "1px solid rgba(239,239,239,0.1)", color: "rgba(239,239,239,0.4)", padding: "8px 14px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(245,196,0,0.4)"; e.currentTarget.style.color = "#F5C400"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(239,239,239,0.1)"; e.currentTarget.style.color = "rgba(239,239,239,0.4)"; }}>
                    <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
                </button>
                <button onClick={logoutAll} disabled={busy}
                    style={{ display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "1px solid rgba(185,28,28,0.35)", color: "#fca5a5", padding: "8px 16px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(185,28,28,0.12)"; e.currentTarget.style.borderColor = "rgba(185,28,28,0.6)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(185,28,28,0.35)"; }}>
                    <LogOut style={{ width: 11, height: 11 }} />
                    {busy ? "Signing out…" : "Sign Out All Devices"}
                </button>
            </div>
        </div>
    );
}

// ── Main Account Page ─────────────────────────────────────────────────────────
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
        <div style={{ minHeight: "100vh", background: "#0D0D0D", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 style={{ width: 18, height: 18, color: "#F5C400", animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    return (
        <div style={{ maxWidth: "820px", margin: "0 auto", padding: "40px 32px", cursor: "none" }}>

            {/* ── Page header ─────────────────────────────────────────────── */}
            <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "36px", flexWrap: "wrap", gap: "16px", paddingBottom: "24px", borderBottom: "1px solid rgba(239,239,239,0.07)" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                        <div style={{ width: "18px", height: "2px", background: "rgba(185,28,28,0.8)" }} />
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(185,28,28,0.8)" }}>// ACCOUNT</span>
                    </div>
                    <h1 style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "clamp(32px,4vw,48px)", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: 0, lineHeight: 1 }}>
                        {user.full_name}
                    </h1>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "11px", color: "rgba(239,239,239,0.5)", letterSpacing: "0.08em" }}>{user.email}</span>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#F5C400", border: "1px solid rgba(245,196,0,0.3)", padding: "2px 8px", background: "rgba(245,196,0,0.05)" }}>
                            {(user.plan || "FREE").toUpperCase()}
                        </span>
                        {user.role && user.role !== "user" && (
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(239,239,239,0.5)", border: "1px solid rgba(239,239,239,0.1)", padding: "2px 8px" }}>
                                {user.role.toUpperCase()}
                            </span>
                        )}
                    </div>
                </div>
                <button onClick={handleLogout}
                    style={{ display: "flex", alignItems: "center", gap: "7px", background: "transparent", border: "1px solid rgba(239,239,239,0.12)", color: "rgba(239,239,239,0.5)", padding: "9px 18px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#EFEFEF"; e.currentTarget.style.borderColor = "rgba(239,239,239,0.35)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "rgba(239,239,239,0.5)"; e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"; }}>
                    <LogOut style={{ width: 12, height: 12 }} /> Sign Out
                </button>
            </header>

            {/* ── Sub-nav ──────────────────────────────────────────────────── */}
            <nav style={{ display: "flex", gap: "0", borderBottom: "1px solid rgba(239,239,239,0.08)", marginBottom: "32px" }}>
                {[
                    { label: "Profile",      href: "/account" },
                    { label: "Organisation", href: "/account/organisation" },
                    { label: "API Keys",     href: "/account/api-keys" },
                ].map(tab => {
                    const active = typeof window !== "undefined" && window.location.pathname === tab.href;
                    return (
                        <Link key={tab.href} href={tab.href}
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: active ? 700 : 500, fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", color: active ? "#F5C400" : "rgba(239,239,239,0.45)", textDecoration: "none", padding: "12px 24px", borderBottom: `2px solid ${active ? "#F5C400" : "transparent"}`, background: active ? "rgba(245,196,0,0.03)" : "transparent", transition: "all 0.15s" }}>
                            {tab.label}
                        </Link>
                    );
                })}
            </nav>

            {/* ── Profile info ─────────────────────────────────────────────── */}
            <Section title="Profile Information" eyebrow="// Identity">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
                    <Field label="Full Name"       value={user.full_name} />
                    <Field label="Email"           value={user.email} />
                    <Field label="Plan"            value={(user.plan || "free").toUpperCase()} />
                    <Field label="Role"            value={(user.role || "user").toUpperCase()} />
                    {user.org_id && <Field label="Organisation ID" value={user.org_id} />}
                    <Field label="Member Since"    value={(user as any).created_at ? new Date((user as any).created_at).toLocaleDateString() : "—"} />
                </div>
            </Section>

            {/* ── Change password ───────────────────────────────────────────── */}
            <Section title="Change Password" eyebrow="// Security">
                <ChangePasswordForm />
            </Section>

            {/* ── Active sessions ───────────────────────────────────────────── */}
            <Section title="Active Sessions" eyebrow="// Sessions">
                <ActiveSessions />
            </Section>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}