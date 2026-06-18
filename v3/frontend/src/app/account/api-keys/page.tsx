"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Key, Plus, Trash2, Loader2, Copy, Check, BarChart3, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useUiStore } from "@/store/uiStore";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Tooltip } from "@/components/ui/Tooltip";

function TabBar() {
    const pathname = usePathname();
    return (
        <div style={{ display: "flex", borderBottom: "1px solid rgba(239,239,239,0.08)", marginBottom: "28px" }}>
            {[
                { label: "Profile",      href: "/account" },
                { label: "Organisation", href: "/account/organisation" },
                { label: "API Keys",     href: "/account/api-keys" },
            ].map(tab => {
                const active = pathname === tab.href;
                return (
                    <Link key={tab.href} href={tab.href} style={{ fontFamily: '"Barlow", sans-serif', fontSize: "12px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: active ? 700 : 500, color: active ? "#F5C400" : "rgba(239,239,239,0.6)", textDecoration: "none", padding: "12px 24px", borderBottom: `2px solid ${active ? "#F5C400" : "transparent"}`, background: active ? "rgba(245,196,0,0.03)" : "transparent", transition: "all 0.15s" }}>
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}

const INPUT: React.CSSProperties = {
    width: "100%", background: "#080808",
    border: "1px solid rgba(239,239,239,0.12)",
    padding: "9px 12px",
    fontFamily: '"Barlow", sans-serif',
    fontSize: "13px", color: "#EFEFEF",
    outline: "none", boxSizing: "border-box",
    transition: "border-color 0.15s",
    letterSpacing: "0.04em",
};

export default function ApiKeysPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const [keys,      setKeys]      = useState<any[]>([]);
    const [pageLoad,  setPageLoad]  = useState(true);
    const [creating,  setCreating]  = useState(false);
    const [newKey,    setNewKey]    = useState<string | null>(null);
    const [copied,    setCopied]    = useState<string | null>(null);
    const [busy,      setBusy]      = useState(false);
    const [error,     setError]     = useState("");
    const [showUsage, setShowUsage] = useState<string | null>(null);
    const [usageData, setUsageData] = useState<any>(null);
    const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);

    const [name,    setName]    = useState("");
    const [desc,    setDesc]    = useState("");
    const [expDays, setExpDays] = useState("");
    const [rpm,     setRpm]     = useState("60");

    useEffect(() => {
        if (!loading && !user) router.replace("/login");
        if (!loading && user?.is_guest) router.replace("/register");
    }, [user, loading]);

    const loadKeys = useCallback(async () => {
        setPageLoad(true);
        try {
            const res = await apiFetch("/api/v3/keys/list");
            if (res.ok) { const d = await res.json(); setKeys(d.keys || []); }
        } finally { setPageLoad(false); }
    }, []);

    useEffect(() => { if (!loading && user) loadKeys(); }, [user, loading]);

    const createKey = async (e: React.FormEvent) => {
        e.preventDefault(); setError(""); setBusy(true);
        try {
            const body: any = { name, description: desc, rate_limit_rpm: parseInt(rpm) || 60 };
            if (expDays) body.expires_in_days = parseInt(expDays);
            const res = await apiFetch("/api/v3/keys/create", { method: "POST", body: JSON.stringify(body) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed"); }
            const d = await res.json();
            setNewKey(d.api_key);
            setCreating(false); setName(""); setDesc(""); setExpDays(""); setRpm("60");
            await loadKeys();
        } catch (err: any) { setError(err.message); }
        finally { setBusy(false); }
    };

    const confirmRevokeKey = async () => {
        if (!revokeKeyId) return;
        try {
            await apiFetch(`/api/v3/keys/${revokeKeyId}`, { method: "DELETE" });
            // Optimistically remove from UI immediately
            setKeys(prev => prev.filter(k => k.key_id !== revokeKeyId));
            useUiStore.getState().addToast("Key revoked.", "success");
            // Also re-fetch for backend consistency
            await loadKeys();
        } catch {
            useUiStore.getState().addToast("Failed to revoke key.", "error");
        } finally {
            setRevokeKeyId(null);
        }
    };

    const loadUsage = async (keyId: string) => {
        if (showUsage === keyId) { setShowUsage(null); setUsageData(null); return; }
        setShowUsage(keyId);
        const res = await apiFetch(`/api/v3/keys/${keyId}/usage`);
        if (res.ok) setUsageData(await res.json());
    };

    const copyText = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id); setTimeout(() => setCopied(null), 2000);
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
                    <div style={{ width: "18px", height: "2px", background: "#F5C400" }} />
                <span style={{ fontFamily: '"Barlow", sans-serif', fontSize: "10px", letterSpacing: "0.26em", textTransform: "uppercase", color: "#F5C400" }}>// ACCOUNT</span>
                </div>
                <h1 style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "clamp(32px,4vw,48px)", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: 0, lineHeight: 1 }}>API Keys</h1>
            </header>

            <TabBar />

            {/* New key reveal banner */}
            {newKey && (
                <div style={{ padding: "16px 20px", background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.25)", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, #4ade80, transparent)", opacity: 0.5 }} />
                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#4ade80", marginBottom: "10px" }}>✓ Key created — copy now, not shown again</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "11px", color: "#EFEFEF", background: "#080808", padding: "8px 12px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid rgba(239,239,239,0.1)" }}>{newKey}</code>
                        <button onClick={() => copyText(newKey, "new")}
                            style={{ background: "#F5C400", color: "#080808", border: "none", padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.14em", fontWeight: 700, flexShrink: 0 }}>
                            {copied === "new" ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                            {copied === "new" ? "Copied!" : "Copy"}
                        </button>
                    </div>
                    <button onClick={() => setNewKey(null)} style={{ marginTop: "10px", background: "none", border: "none", fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", cursor: "pointer" }}>Dismiss</button>
                </div>
            )}

            {/* Actions row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontFamily: '"Barlow", sans-serif', fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", fontWeight: 500 }}>{keys.length} key{keys.length !== 1 ? "s" : ""}</span>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={loadKeys}
                        style={{ display: "flex", alignItems: "center", gap: "5px", background: "transparent", border: "1px solid rgba(239,239,239,0.1)", color: "rgba(239,239,239,0.4)", padding: "8px 12px", fontFamily: '"Barlow", sans-serif', fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s", fontWeight: 500 }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(245,196,0,0.4)"; e.currentTarget.style.color = "#F5C400"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(239,239,239,0.1)"; e.currentTarget.style.color = "rgba(239,239,239,0.4)"; }}>
                        <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
                    </button>
                    <button onClick={() => setCreating(!creating)}
                        style={{ display: "flex", alignItems: "center", gap: "6px", background: creating ? "rgba(245,196,0,0.08)" : "#F5C400", color: creating ? "#F5C400" : "#080808", border: creating ? "1px solid rgba(245,196,0,0.3)" : "none", padding: "8px 16px", fontFamily: '"Barlow", sans-serif', fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                        <Plus style={{ width: 11, height: 11 }} />
                        {creating ? "Cancel" : "New Key"}
                    </button>
                </div>
            </div>

            {/* Create form */}
            {creating && (
                <div style={{ border: "1px solid rgba(239,239,239,0.1)", padding: "20px", marginBottom: "16px", position: "relative", overflow: "hidden", background: "#111113" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, #F5C400, transparent)", opacity: 0.4 }} />
                    <div style={{ fontFamily: '"Barlow", sans-serif', fontWeight: 700, fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#EFEFEF", marginBottom: "16px" }}>Generate New Key</div>
                    {error && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "rgba(185,28,28,0.06)", border: "1px solid rgba(185,28,28,0.25)", marginBottom: "12px" }}>
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", color: "#fca5a5" }}>{error}</span>
                        </div>
                    )}
                    <form onSubmit={createKey} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {[
                            { label: "Key Name *", val: name, set: setName, req: true,  ph: "e.g. Production Integration" },
                            { label: "Description", val: desc, set: setDesc, req: false, ph: "Optional note" },
                        ].map(({ label, val, set, req, ph }) => (
                            <div key={label}>
                                <label style={{ fontFamily: '"Barlow", sans-serif', fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#EFEFEF", display: "block", marginBottom: "5px" }}>{label}</label>
                                <input type="text" required={req} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={INPUT}
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                            </div>
                        ))}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                            {[
                                { label: "Rate Limit (req/min)", val: rpm,     set: setRpm,     ph: "60"    },
                                { label: "Expires in days",      val: expDays, set: setExpDays, ph: "Never" },
                            ].map(({ label, val, set, ph }) => (
                                <div key={label}>
                                    <label style={{ fontFamily: '"Barlow", sans-serif', fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#EFEFEF", display: "block", marginBottom: "5px" }}>{label}</label>
                                    <input type="number" value={val} onChange={e => set(e.target.value)} placeholder={ph} style={INPUT}
                                        onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                        onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                            <button type="submit" disabled={busy || !name.trim()}
                                style={{ background: busy || !name.trim() ? "rgba(245,196,0,0.5)" : "#F5C400", color: "#080808", border: "none", padding: "10px 20px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: busy || !name.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                                {busy && <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />}
                                Generate →
                            </button>
                            <button type="button" onClick={() => { setCreating(false); setError(""); }}
                                style={{ background: "transparent", border: "1px solid rgba(239,239,239,0.1)", color: "rgba(239,239,239,0.4)", padding: "10px 16px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}>
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Keys list */}
            {keys.length === 0 ? (
                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "48px", textAlign: "center", background: "#111113" }}>
                    <Key style={{ width: 24, height: 24, color: "rgba(239,239,239,0.15)", margin: "0 auto 12px" }} />
                    <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.25)", margin: 0 }}>No API keys yet</p>
                </div>
            ) : (
                <div style={{ border: "1px solid rgba(239,239,239,0.1)", background: "#111113" }}>
                    {/* Table header */}
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 80px 100px 70px", gap: "0", padding: "10px 20px", borderBottom: "1px solid rgba(239,239,239,0.07)", background: "#0D0D0D" }}>
                        {["Key", "Status", "Rate", "Requests", "Last Used", ""].map((h, i) => (
                                <div key={i} style={{ fontFamily: '"Barlow", sans-serif', fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#EFEFEF", textAlign: i > 1 ? "center" : "left", fontWeight: 600 }}>{h}</div>
                        ))}
                    </div>

                    {keys.map((k, i) => (
                        <React.Fragment key={k.key_id}>
                            <div
                                style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 80px 100px 70px", gap: "0", padding: "14px 20px", borderBottom: i < keys.length - 1 || showUsage === k.key_id ? "1px solid rgba(239,239,239,0.05)" : "none", alignItems: "center", transition: "background 0.15s", cursor: "default", position: "relative" }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(245,196,0,0.02)"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                {/* Left accent bar */}
                                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "2px", background: "#F5C400", transform: "scaleY(0)", transition: "transform 0.2s" }}
                                    onMouseEnter={e => e.currentTarget.style.transform = "scaleY(1)"}
                                    onMouseLeave={e => e.currentTarget.style.transform = "scaleY(0)"} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontFamily: '"Barlow", sans-serif', fontSize: "13px", color: "#EFEFEF", fontWeight: 600, marginBottom: "2px" }}>{k.name}</div>
                                    <div style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: "10px", color: "rgba(239,239,239,0.3)", letterSpacing: "0.06em" }}>{k.key_prefix}</div>
                                </div>
                                <div>
                                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "7px", letterSpacing: "0.12em", textTransform: "uppercase", color: k.is_active ? "#4ade80" : "#ef4444", border: `1px solid ${k.is_active ? "rgba(74,222,128,0.25)" : "rgba(239,68,68,0.25)"}`, padding: "2px 7px", background: k.is_active ? "rgba(74,222,128,0.05)" : "transparent" }}>
                                        {k.is_active ? "Active" : "Revoked"}
                                    </span>
                                </div>
                                <div style={{ fontFamily: '"Barlow", sans-serif', fontSize: "12px", color: "#EFEFEF", textAlign: "center", fontWeight: 500 }}>{k.rate_limit_rpm}/m</div>
                                <div style={{ fontFamily: '"Barlow", sans-serif', fontSize: "12px", color: "#EFEFEF", textAlign: "center", fontWeight: 500 }}>{k.request_count.toLocaleString()}</div>
                                <div style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: "11px", color: "rgba(239,239,239,0.6)", textAlign: "center" }}>
                                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                                </div>
                                <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                                    <Tooltip content="Usage" position="top">
                                        <button onClick={() => loadUsage(k.key_id)}
                                            style={{ background: showUsage === k.key_id ? "rgba(245,196,0,0.08)" : "none", border: `1px solid ${showUsage === k.key_id ? "rgba(245,196,0,0.3)" : "transparent"}`, color: showUsage === k.key_id ? "#F5C400" : "rgba(239,239,239,0.3)", padding: "4px 6px", cursor: "pointer", display: "flex", transition: "all 0.15s" }}
                                            onMouseEnter={e => { if (showUsage !== k.key_id) e.currentTarget.style.color = "#EFEFEF"; }}
                                            onMouseLeave={e => { if (showUsage !== k.key_id) e.currentTarget.style.color = "rgba(239,239,239,0.3)"; }}>
                                            <BarChart3 style={{ width: 12, height: 12 }} />
                                        </button>
                                    </Tooltip>
                                    {k.is_active && (
                                        <Tooltip content="Revoke" position="top">
                                            <button onClick={() => setRevokeKeyId(k.key_id)}
                                                style={{ background: "none", border: "1px solid transparent", color: "rgba(239,239,239,0.22)", padding: "4px 6px", cursor: "pointer", display: "flex", transition: "all 0.15s" }}
                                                onMouseEnter={e => { e.currentTarget.style.color = "#fca5a5"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.2)"; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = "rgba(239,239,239,0.22)"; e.currentTarget.style.borderColor = "transparent"; }}>
                                                <Trash2 style={{ width: 12, height: 12 }} />
                                            </button>
                                        </Tooltip>
                                    )}
                                </div>
                            </div>

                            {/* Usage panel */}
                            {showUsage === k.key_id && usageData && (
                                <div style={{ padding: "14px 20px", background: "rgba(245,196,0,0.02)", borderBottom: i < keys.length - 1 ? "1px solid rgba(239,239,239,0.05)" : "none" }}>
                                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", marginBottom: "10px" }}>Usage — Last 7 Days</div>
                                    <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                                        <div>
                                            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "7px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(239,239,239,0.25)", marginBottom: "6px" }}>Daily Calls</div>
                                            <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "28px" }}>
                                                {(usageData.daily_volume || []).map((d: any) => {
                                                    const maxC = Math.max(...(usageData.daily_volume || []).map((x: any) => x.calls), 1);
                                                    const h    = Math.max(2, (d.calls / maxC) * 28);
                                                    return <div key={d.day} title={`${d.day}: ${d.calls}`} style={{ width: "10px", height: `${h}px`, background: "#F5C400", opacity: 0.6 }} />;
                                                })}
                                            </div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "7px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(239,239,239,0.25)", marginBottom: "6px" }}>By Endpoint</div>
                                            {(usageData.by_endpoint || []).map((ep: any) => (
                                                <div key={ep.endpoint} style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "4px" }}>
                                                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", color: "#F5C400" }}>{ep.endpoint}</span>
                                                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", color: "rgba(239,239,239,0.4)" }}>{ep.calls} calls · {Math.round(ep.avg_ms)}ms avg</span>
                                                </div>
                                            ))}
                                            {!usageData.by_endpoint?.length && (
                                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", color: "rgba(239,239,239,0.3)" }}>No requests in last 7 days</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
            )}
            <ConfirmModal
                isOpen={!!revokeKeyId}
                title="Revoke API Key"
                message="Are you sure you want to revoke this API key? Any applications currently using it will be denied access instantly. This action cannot be undone."
                confirmText="Revoke Key"
                onConfirm={confirmRevokeKey}
                onCancel={() => setRevokeKeyId(null)}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}