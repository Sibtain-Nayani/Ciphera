"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Key, Plus, Trash2, Loader2, Copy, Check, Eye, EyeOff, AlertCircle, BarChart3 } from "lucide-react";
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

export default function ApiKeysPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const [keys,       setKeys]      = useState<any[]>([]);
    const [pageLoad,   setPageLoad]  = useState(true);
    const [creating,   setCreating]  = useState(false);
    const [newKey,     setNewKey]    = useState<string | null>(null);
    const [copied,     setCopied]    = useState(false);
    const [busy,       setBusy]      = useState(false);
    const [error,      setError]     = useState("");
    const [showUsage,  setShowUsage] = useState<string | null>(null);
    const [usageData,  setUsageData] = useState<any>(null);

    // Create form
    const [name,     setName]     = useState("");
    const [desc,     setDesc]     = useState("");
    const [expDays,  setExpDays]  = useState<string>("");
    const [rpm,      setRpm]      = useState("60");

    useEffect(() => { if (!loading && !user) router.replace("/login"); }, [user, loading]);

    const loadKeys = useCallback(async () => {
        setPageLoad(true);
        try {
            const res = await authFetch("/api/v3/keys/list");
            if (res.ok) { const d = await res.json(); setKeys(d.keys || []); }
        } finally { setPageLoad(false); }
    }, []);

    useEffect(() => { if (!loading && user) loadKeys(); }, [user, loading]);

    const createKey = async (e: React.FormEvent) => {
        e.preventDefault(); setError(""); setBusy(true);
        try {
            const body: any = { name, description: desc, rate_limit_rpm: parseInt(rpm) || 60 };
            if (expDays) body.expires_in_days = parseInt(expDays);
            const res = await authFetch("/api/v3/keys/create", { method: "POST", body: JSON.stringify(body) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
            const d = await res.json();
            setNewKey(d.api_key);
            setCreating(false); setName(""); setDesc(""); setExpDays(""); setRpm("60");
            await loadKeys();
        } catch (err: any) { setError(err.message); }
        finally { setBusy(false); }
    };

    const revokeKey = async (keyId: string) => {
        if (!confirm("Revoke this API key? This cannot be undone.")) return;
        await authFetch(`/api/v3/keys/${keyId}`, { method: "DELETE" });
        await loadKeys();
    };

    const loadUsage = async (keyId: string) => {
        if (showUsage === keyId) { setShowUsage(null); setUsageData(null); return; }
        setShowUsage(keyId);
        const res = await authFetch(`/api/v3/keys/${keyId}/usage`);
        if (res.ok) setUsageData(await res.json());
    };

    const copyKey = () => {
        if (newKey) { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
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
                <h1 style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "32px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: "4px 0 0" }}>API Keys</h1>
            </div>
            <TabBar />

            {/* New key reveal */}
            {newKey && (
                <div style={{ padding: "16px 20px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)", marginBottom: "20px" }}>
                    <div style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#22c55e", marginBottom: "10px" }}>✓ Key created — copy it now. You won't see it again.</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <code style={{ fontFamily: "Courier New, monospace", fontSize: "11px", color: "#EFEFEF", background: "#080808", padding: "8px 12px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid rgba(239,239,239,0.1)" }}>{newKey}</code>
                        <button onClick={copyKey} style={{ background: "#F5C400", color: "#080808", border: "none", padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.14em", fontWeight: 700, flexShrink: 0 }}>
                            {copied ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                    <button onClick={() => setNewKey(null)} style={{ marginTop: "10px", background: "none", border: "none", fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", cursor: "pointer" }}>Dismiss</button>
                </div>
            )}

            {/* Create key form */}
            {creating ? (
                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "20px", marginBottom: "20px" }}>
                    <div style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#EFEFEF", marginBottom: "16px" }}>New API Key</div>
                    {error && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "rgba(185,28,28,0.08)", border: "1px solid rgba(185,28,28,0.25)", marginBottom: "14px" }}>
                            <AlertCircle style={{ width: 12, height: 12, color: "#B91C1C", flexShrink: 0 }} />
                            <span style={{ fontFamily: "Barlow, sans-serif", fontSize: "12px", color: "#fca5a5" }}>{error}</span>
                        </div>
                    )}
                    <form onSubmit={createKey} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {[
                            { label: "Key Name *", val: name, set: setName, type: "text", req: true, ph: "e.g. Production Integration" },
                            { label: "Description", val: desc, set: setDesc, type: "text", req: false, ph: "Optional note" },
                        ].map(({ label, val, set, type, req, ph }) => (
                            <div key={label}>
                                <label style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", display: "block", marginBottom: "5px" }}>{label}</label>
                                <input type={type} required={req} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                                    style={{ width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "9px 12px", fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "#EFEFEF", outline: "none", boxSizing: "border-box" }}
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                            </div>
                        ))}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                            <div>
                                <label style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", display: "block", marginBottom: "5px" }}>Rate Limit (req/min)</label>
                                <input type="number" min="1" max="1000" value={rpm} onChange={e => setRpm(e.target.value)}
                                    style={{ width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "9px 12px", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#EFEFEF", outline: "none", boxSizing: "border-box" }}
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                            </div>
                            <div>
                                <label style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", display: "block", marginBottom: "5px" }}>Expires in days (optional)</label>
                                <input type="number" min="1" max="365" value={expDays} onChange={e => setExpDays(e.target.value)} placeholder="Never"
                                    style={{ width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "9px 12px", fontFamily: "Courier New, monospace", fontSize: "12px", color: "#EFEFEF", outline: "none", boxSizing: "border-box" }}
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                            <button type="submit" disabled={busy}
                                style={{ background: "#F5C400", color: "#080808", border: "none", padding: "10px 20px", fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                                {busy && <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />} Generate Key
                            </button>
                            <button type="button" onClick={() => { setCreating(false); setError(""); }}
                                style={{ background: "transparent", border: "1px solid rgba(239,239,239,0.1)", color: "rgba(239,239,239,0.4)", padding: "10px 16px", fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}>
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                <button onClick={() => setCreating(true)}
                    style={{ display: "flex", alignItems: "center", gap: "7px", background: "#F5C400", color: "#080808", border: "none", padding: "10px 20px", fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", marginBottom: "20px" }}>
                    <Plus style={{ width: 12, height: 12 }} /> New API Key
                </button>
            )}

            {/* Keys list */}
            {keys.length === 0 ? (
                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "40px", textAlign: "center" }}>
                    <Key style={{ width: 28, height: 28, color: "rgba(239,239,239,0.2)", margin: "0 auto 12px" }} />
                    <p style={{ fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", margin: 0 }}>No API keys yet</p>
                </div>
            ) : (
                <div style={{ border: "1px solid rgba(239,239,239,0.07)" }}>
                    <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(239,239,239,0.07)", display: "flex", gap: "0" }}>
                        {["Key", "Status", "Rate Limit", "Requests", "Last Used", ""].map((h, i) => (
                            <div key={i} style={{ flex: h === "" ? "0 0 80px" : h === "Key" ? 2 : 1, fontFamily: "Courier New, monospace", fontSize: "7px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.25)" }}>{h}</div>
                        ))}
                    </div>
                    {keys.map((k, i) => (
                        <React.Fragment key={k.key_id}>
                            <div style={{ display: "flex", padding: "14px 20px", borderBottom: i < keys.length - 1 || showUsage === k.key_id ? "1px solid rgba(239,239,239,0.05)" : "none", alignItems: "center" }}>
                                <div style={{ flex: 2, minWidth: 0 }}>
                                    <div style={{ fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "#EFEFEF", fontWeight: 600, marginBottom: "2px" }}>{k.name}</div>
                                    <div style={{ fontFamily: "Courier New, monospace", fontSize: "8px", color: "rgba(239,239,239,0.3)", letterSpacing: "0.1em" }}>{k.key_prefix}</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: k.is_active ? "#22c55e" : "#ef4444", border: `1px solid ${k.is_active ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, padding: "2px 6px" }}>
                                        {k.is_active ? "Active" : "Revoked"}
                                    </span>
                                </div>
                                <div style={{ flex: 1, fontFamily: "Courier New, monospace", fontSize: "9px", color: "rgba(239,239,239,0.5)" }}>{k.rate_limit_rpm}/min</div>
                                <div style={{ flex: 1, fontFamily: "Courier New, monospace", fontSize: "9px", color: "rgba(239,239,239,0.5)" }}>{k.request_count.toLocaleString()}</div>
                                <div style={{ flex: 1, fontFamily: "Courier New, monospace", fontSize: "8px", color: "rgba(239,239,239,0.35)" }}>
                                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                                </div>
                                <div style={{ flex: "0 0 80px", display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                                    <button onClick={() => loadUsage(k.key_id)} title="Usage stats"
                                        style={{ background: showUsage === k.key_id ? "rgba(245,196,0,0.1)" : "none", border: `1px solid ${showUsage === k.key_id ? "rgba(245,196,0,0.3)" : "transparent"}`, color: showUsage === k.key_id ? "#F5C400" : "rgba(239,239,239,0.3)", padding: "5px 7px", cursor: "pointer", display: "flex" }}
                                        onMouseEnter={e => { if (showUsage !== k.key_id) e.currentTarget.style.color = "#EFEFEF"; }}
                                        onMouseLeave={e => { if (showUsage !== k.key_id) e.currentTarget.style.color = "rgba(239,239,239,0.3)"; }}>
                                        <BarChart3 style={{ width: 12, height: 12 }} />
                                    </button>
                                    <button onClick={() => revokeKey(k.key_id)} title="Revoke"
                                        style={{ background: "none", border: "transparent", color: "rgba(239,239,239,0.25)", padding: "5px 7px", cursor: "pointer", display: "flex" }}
                                        onMouseEnter={e => e.currentTarget.style.color = "#fca5a5"}
                                        onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.25)"}>
                                        <Trash2 style={{ width: 12, height: 12 }} />
                                    </button>
                                </div>
                            </div>
                            {/* Usage breakdown */}
                            {showUsage === k.key_id && usageData && (
                                <div style={{ padding: "14px 20px", background: "rgba(245,196,0,0.02)", borderBottom: i < keys.length - 1 ? "1px solid rgba(239,239,239,0.05)" : "none" }}>
                                    <div style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", marginBottom: "10px" }}>Usage — Last 7 Days</div>
                                    <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                                        {/* Daily volume sparkline */}
                                        <div>
                                            <div style={{ fontFamily: "Courier New, monospace", fontSize: "7px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(239,239,239,0.25)", marginBottom: "6px" }}>Daily Calls</div>
                                            <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "28px" }}>
                                                {(usageData.daily_volume || []).map((d: any) => {
                                                    const maxCalls = Math.max(...(usageData.daily_volume || []).map((x: any) => x.calls), 1);
                                                    const h = Math.max(2, (d.calls / maxCalls) * 28);
                                                    return <div key={d.day} title={`${d.day}: ${d.calls}`} style={{ width: "10px", height: `${h}px`, background: "#F5C400", opacity: 0.6 }} />;
                                                })}
                                            </div>
                                        </div>
                                        {/* By endpoint */}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontFamily: "Courier New, monospace", fontSize: "7px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(239,239,239,0.25)", marginBottom: "6px" }}>By Endpoint</div>
                                            {(usageData.by_endpoint || []).map((ep: any) => (
                                                <div key={ep.endpoint} style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "3px" }}>
                                                    <span style={{ fontFamily: "Courier New, monospace", fontSize: "9px", color: "#F5C400" }}>{ep.endpoint}</span>
                                                    <span style={{ fontFamily: "Courier New, monospace", fontSize: "9px", color: "rgba(239,239,239,0.4)" }}>{ep.calls} calls · {Math.round(ep.avg_ms)}ms avg</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
            )}

            {/* Docs note */}
            <div style={{ marginTop: "20px", padding: "12px 16px", border: "1px solid rgba(239,239,239,0.05)", background: "rgba(245,196,0,0.02)" }}>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.14em", color: "rgba(239,239,239,0.25)" }}>
                    Pass your key as: <span style={{ color: "#F5C400" }}>X-API-Key: ck_live_…</span> on POST /api/v3/public/redact or /analyze
                </span>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
