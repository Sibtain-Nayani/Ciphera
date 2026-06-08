"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

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

function Divider() {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "4px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(239,239,239,0.07)" }} />
            <span style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.2)" }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "rgba(239,239,239,0.07)" }} />
        </div>
    );
}

export default function RegisterPage() {
    const { register, user, loading } = useAuth();
    const router = useRouter();

    const [fullName,    setFullName]    = useState("");
    const [email,       setEmail]       = useState("");
    const [password,    setPassword]    = useState("");
    const [showPass,    setShowPass]    = useState(false);
    const [error,       setError]       = useState("");
    const [busy,        setBusy]        = useState(false);
    const [googleBusy,  setGoogleBusy]  = useState(false);

    useEffect(() => { if (!loading && user) router.replace("/dashboard"); }, [user, loading]);

    const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : 3;
    const strengthColor = ["transparent", "#ef4444", "#F5C400", "#22c55e"][strength];
    const strengthLabel = ["", "Weak", "Moderate", "Strong"][strength];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(""); setBusy(true);
        if (password.length < 8) { setError("Password must be at least 8 characters."); setBusy(false); return; }
        try {
            await register(email.trim(), password, fullName.trim());
            document.cookie = "ciphera_authed=1; path=/; max-age=2592000; SameSite=Lax";
            router.replace("/dashboard");
        } catch (err: any) {
            setError(err.message || "Registration failed.");
        } finally { setBusy(false); }
    };

    const handleGoogle = async () => {
        setError(""); setGoogleBusy(true);
        try {
            const res  = await fetch("http://127.0.0.1:8000/api/v3/auth/google/init");
            const data = await res.json();
            if (data.url) { window.location.href = data.url; }
            else throw new Error("Could not get Google auth URL");
        } catch { setError("Could not connect to Google. Try again."); setGoogleBusy(false); }
    };

    const inputStyle: React.CSSProperties = { width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "10px 14px", fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "#EFEFEF", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" };

    return (
        <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", cursor: "none" }}>
            <div style={{ width: "100%", maxWidth: "420px" }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "40px", textDecoration: "none", justifyContent: "center" }}>
                    <div style={{ background: "#F5C400", padding: "8px", display: "flex" }}>
                        <Shield style={{ width: 18, height: 18, color: "#080808" }} />
                    </div>
                    <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "22px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#EFEFEF" }}>Ciphera</span>
                </Link>

                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "36px", background: "#0D0D0D" }}>
                    <div style={{ marginBottom: "24px" }}>
                        <h1 style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "28px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: 0, marginBottom: "6px" }}>Create Account</h1>
                        <p style={{ fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.32)", margin: 0 }}>Free plan · No credit card required</p>
                    </div>

                    {error && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(185,28,28,0.1)", border: "1px solid rgba(185,28,28,0.3)", marginBottom: "20px" }}>
                            <AlertCircle style={{ width: 14, height: 14, color: "#B91C1C", flexShrink: 0 }} />
                            <span style={{ fontFamily: "Barlow, sans-serif", fontSize: "12px", color: "#fca5a5" }}>{error}</span>
                        </div>
                    )}

                    <GoogleButton loading={googleBusy} onClick={handleGoogle} />
                    <Divider />

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {[
                            { label: "Full Name",     type: "text",  val: fullName, set: setFullName, auto: "name",  ph: "Your full name" },
                            { label: "Email Address", type: "email", val: email,    set: setEmail,    auto: "email", ph: "you@company.com" },
                        ].map(({ label, type, val, set, auto, ph }) => (
                            <div key={label}>
                                <label style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", display: "block", marginBottom: "6px" }}>{label}</label>
                                <input type={type} required autoComplete={auto} value={val} onChange={e => set(e.target.value)} style={inputStyle} placeholder={ph}
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                            </div>
                        ))}

                        <div>
                            <label style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", display: "block", marginBottom: "6px" }}>Password</label>
                            <div style={{ position: "relative" }}>
                                <input type={showPass ? "text" : "password"} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                                    style={{ ...inputStyle, padding: "10px 40px 10px 14px" }} placeholder="Min. 8 characters"
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"} />
                                <button type="button" onClick={() => setShowPass(v => !v)}
                                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.4)", padding: 0, display: "flex" }}>
                                    {showPass ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
                                </button>
                            </div>
                            {password.length > 0 && (
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                                    <div style={{ flex: 1, height: "2px", background: "rgba(239,239,239,0.07)" }}>
                                        <div style={{ width: `${(strength / 3) * 100}%`, height: "100%", background: strengthColor, transition: "all 0.3s" }} />
                                    </div>
                                    <span style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.14em", color: strengthColor, textTransform: "uppercase" }}>{strengthLabel}</span>
                                </div>
                            )}
                        </div>

                        <button type="submit" disabled={busy || googleBusy}
                            style={{ background: (busy || googleBusy) ? "rgba(245,196,0,0.5)" : "#F5C400", color: "#080808", border: "none", padding: "12px 24px", fontFamily: "Courier New, monospace", fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, cursor: (busy || googleBusy) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "background 0.15s" }}>
                            {busy && <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />}
                            {busy ? "Creating Account…" : "Create Account →"}
                        </button>
                    </form>

                    <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(239,239,239,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.14em", color: "rgba(239,239,239,0.25)" }}>Have an account?</span>
                        <Link href="/login" style={{ fontFamily: "Courier New, monospace", fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#F5C400", textDecoration: "none" }}>Sign In →</Link>
                    </div>
                </div>

                <p style={{ textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.15)", marginTop: "20px" }}>
                    Zero retention · Client-side inference · DPDP Act 2023
                </p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}