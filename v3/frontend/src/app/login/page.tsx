"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Eye, EyeOff, AlertCircle, Loader2, UserX } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} disabled={loading}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "11px 16px", background: "transparent", border: "1px solid rgba(239,239,239,0.15)", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.15s", opacity: loading ? 0.6 : 1 }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = "rgba(239,239,239,0.35)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(239,239,239,0.15)"; }}>
            {loading ? (
                <Loader2 style={{ width: 16, height: 16, color: "#EFEFEF", animation: "spin 1s linear infinite" }} />
            ) : (
                <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
            )}
            <span style={{ fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "#EFEFEF", fontWeight: 500 }}>
                {loading ? "Connecting…" : "Continue with Google"}
            </span>
        </button>
    );
}

function Divider({ label = "or" }: { label?: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "4px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(239,239,239,0.07)" }} />
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.2)" }}>{label}</span>
            <div style={{ flex: 1, height: "1px", background: "rgba(239,239,239,0.07)" }} />
        </div>
    );
}

function LoginContent() {
    const { login, loginAsGuest, user, loading } = useAuth();
    const router       = useRouter();
    const searchParams = useSearchParams();
    const from         = searchParams.get("from") || "/dashboard";
    const oauthError   = searchParams.get("error");

    const [email,      setEmail]      = useState("");
    const [password,   setPassword]   = useState("");
    const [showPass,   setShowPass]   = useState(false);
    const [error,      setError]      = useState(oauthError ? "Google sign-in failed. Try email instead." : "");
    const [busy,       setBusy]       = useState(false);
    const [googleBusy, setGoogleBusy] = useState(false);

    useEffect(() => { if (!loading && user) router.replace(from); }, [user, loading]);

    const inputStyle: React.CSSProperties = {
        width: "100%", background: "#080808",
        border: "1px solid rgba(239,239,239,0.12)",
        padding: "10px 14px",
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: "12px", color: "#EFEFEF", outline: "none",
        boxSizing: "border-box", transition: "border-color 0.15s",
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(""); setBusy(true);
        try {
            await login(email.trim(), password);
            router.replace(from);
        } catch (err: any) {
            setError(err.message || "Login failed. Check your credentials.");
        } finally { setBusy(false); }
    };

    const handleGoogle = async () => {
        setError(""); setGoogleBusy(true);
        try {
            const res  = await fetch(api('/api/v3/auth/google/init'));
            const data = await res.json();
            if (data.url) { window.location.href = data.url; }
            else throw new Error("Could not get Google auth URL");
        } catch {
            setError("Could not connect to Google. Try again.");
            setGoogleBusy(false);
        }
    };

    const handleGuest = () => {
        loginAsGuest();
        router.replace("/dashboard");
    };

    return (
        <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", cursor: "none" }}>
            <div style={{ width: "100%", maxWidth: "420px" }}>

                {/* Logo */}
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "40px", textDecoration: "none", justifyContent: "center" }}>
                    <div style={{ background: "#F5C400", padding: "8px", display: "flex" }}>
                        <Shield style={{ width: 18, height: 18, color: "#080808" }} />
                    </div>
                    <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "22px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#EFEFEF" }}>Ciphera</span>
                </Link>

                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "36px", background: "#0D0D0D" }}>
                    <div style={{ marginBottom: "24px" }}>
                        <h1 style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "28px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: 0, marginBottom: "6px" }}>Sign In</h1>
                        <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.32)", margin: 0 }}>Access your redaction workspace</p>
                    </div>

                    {/* Error banner */}
                    {error && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(185,28,28,0.1)", border: "1px solid rgba(185,28,28,0.3)", marginBottom: "20px" }}>
                            <AlertCircle style={{ width: 14, height: 14, color: "#B91C1C", flexShrink: 0 }} />
                            <span style={{ fontFamily: "Barlow, sans-serif", fontSize: "12px", color: "#fca5a5" }}>{error}</span>
                        </div>
                    )}

                    <GoogleButton loading={googleBusy} onClick={handleGoogle} />
                    <Divider />

                    {/* Email + password */}
                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <div>
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", display: "block", marginBottom: "6px" }}>Email</label>
                            <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@company.com"
                                onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                        </div>
                        <div>
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", display: "block", marginBottom: "6px" }}>Password</label>
                            <div style={{ position: "relative" }}>
                                <input type={showPass ? "text" : "password"} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                                    style={{ ...inputStyle, padding: "10px 40px 10px 14px" }} placeholder="••••••••"
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                                <button type="button" onClick={() => setShowPass(v => !v)}
                                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.4)", padding: 0, display: "flex" }}>
                                    {showPass ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                                </button>
                            </div>
                        </div>
                        <button type="submit" disabled={busy || googleBusy}
                            style={{ background: busy || googleBusy ? "rgba(245,196,0,0.5)" : "#F5C400", color: "#080808", border: "none", padding: "12px 24px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, cursor: busy || googleBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "background 0.15s" }}>
                            {busy && <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />}
                            {busy ? "Signing In…" : "Sign In →"}
                        </button>
                    </form>

                    {/* Guest divider + button */}
                    <Divider label="or skip" />
                    <button onClick={handleGuest}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "11px 16px", background: "transparent", border: "1px solid rgba(239,239,239,0.08)", cursor: "pointer", transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(239,239,239,0.2)"; e.currentTarget.style.background = "rgba(239,239,239,0.02)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(239,239,239,0.08)"; e.currentTarget.style.background = "transparent"; }}>
                        <UserX style={{ width: 14, height: 14, color: "rgba(239,239,239,0.4)" }} />
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", fontWeight: 500 }}>
                            Continue as Guest
                        </span>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", color: "rgba(239,239,239,0.2)", letterSpacing: "0.1em" }}>— no account needed</span>
                    </button>

                    {/* Bottom row */}
                    <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(239,239,239,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.14em", color: "rgba(239,239,239,0.25)" }}>No account?</span>
                        <Link href="/register" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#F5C400", textDecoration: "none" }}>Create Account →</Link>
                    </div>
                </div>

                <p style={{ textAlign: "center", fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.15)", marginTop: "20px" }}>
                    Zero retention · Client-side inference · DPDP Act 2023
                </p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 style={{ width: 24, height: 24, color: "#F5C400", animation: "spin 1s linear infinite" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}