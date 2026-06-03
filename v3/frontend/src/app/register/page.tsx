"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
    const { register, user, loading } = useAuth();
    const router = useRouter();

    const [fullName,  setFullName]  = useState("");
    const [email,     setEmail]     = useState("");
    const [password,  setPassword]  = useState("");
    const [showPass,  setShowPass]  = useState(false);
    const [error,     setError]     = useState("");
    const [busy,      setBusy]      = useState(false);

    useEffect(() => { if (!loading && user) window.location.href = "/dashboard"; }, [user, loading]);

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
            window.location.href = "/dashboard";
        } catch (err: any) {
            setError(err.message || "Registration failed.");
        } finally { setBusy(false); }
    };

    return (
        <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", cursor: "none" }}>
            <div style={{ width: "100%", maxWidth: "420px" }}>
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "40px", textDecoration: "none", justifyContent: "center" }}>
                    <div style={{ background: "#F5C400", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Shield style={{ width: 18, height: 18, color: "#080808" }} />
                    </div>
                    <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "22px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#EFEFEF" }}>Ciphera</span>
                </Link>

                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "36px", background: "#0D0D0D" }}>
                    <div style={{ marginBottom: "28px" }}>
                        <h1 style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "28px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: 0, marginBottom: "6px" }}>Create Account</h1>
                        <p style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", color: "rgba(239,239,239,0.7)", margin: 0 }}>Free plan · No credit card required</p>
                    </div>

                    {error && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(185,28,28,0.1)", border: "1px solid rgba(185,28,28,0.3)", marginBottom: "20px" }}>
                            <AlertCircle style={{ width: 14, height: 14, color: "#B91C1C", flexShrink: 0 }} />
                            <span style={{ fontFamily: "Barlow, sans-serif", fontSize: "12px", color: "#fca5a5" }}>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {[
                            { label: "Full Name", type: "text", value: fullName, set: setFullName, auto: "name", ph: "Your full name" },
                            { label: "Email Address", type: "email", value: email, set: setEmail, auto: "email", ph: "you@company.com" },
                        ].map(({ label, type, value, set, auto, ph }) => (
                            <div key={label}>
                                <label style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: "bold", color: "rgba(239,239,239,0.8)", display: "block", marginBottom: "6px" }}>{label}</label>
                                <input type={type} required autoComplete={auto} value={value} onChange={e => set(e.target.value)}
                                    style={{ width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: "14px", color: "#EFEFEF", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"}
                                    placeholder={ph} />
                            </div>
                        ))}

                        {/* Password + strength */}
                        <div>
                            <label style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: "bold", color: "rgba(239,239,239,0.8)", display: "block", marginBottom: "6px" }}>Password</label>
                            <div style={{ position: "relative" }}>
                                <input type={showPass ? "text" : "password"} required autoComplete="new-password"
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    style={{ width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "10px 40px 10px 14px", fontFamily: "Arial, sans-serif", fontSize: "14px", color: "#EFEFEF", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"}
                                    placeholder="Min. 8 characters" />
                                <button type="button" onClick={() => setShowPass(v => !v)}
                                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.6)", padding: 0, display: "flex" }}>
                                    {showPass ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                                </button>
                            </div>
                            {password.length > 0 && (
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                                    <div style={{ flex: 1, height: "2px", background: "rgba(239,239,239,0.07)" }}>
                                        <div style={{ width: `${(strength / 3) * 100}%`, height: "100%", background: strengthColor, transition: "all 0.3s" }} />
                                    </div>
                                    <span style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: strengthColor, textTransform: "uppercase", fontWeight: "bold" }}>{strengthLabel}</span>
                                </div>
                            )}
                        </div>

                        <button type="submit" disabled={busy}
                            style={{ background: busy ? "rgba(245,196,0,0.5)" : "#F5C400", color: "#080808", border: "none", padding: "12px 24px", fontFamily: "Arial, sans-serif", fontSize: "14px", fontWeight: "bold", cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "4px", transition: "background 0.15s" }}>
                            {busy && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
                            {busy ? "Creating Account…" : "Create Account"}
                        </button>
                    </form>

                    <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(239,239,239,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", color: "rgba(239,239,239,0.7)" }}>Have an account?</span>
                        <Link href="/login" style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: "bold", color: "#F5C400", textDecoration: "none" }}>Sign In</Link>
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
