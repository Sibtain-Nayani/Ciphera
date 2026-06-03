"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
    return (
        <React.Suspense fallback={<div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 style={{ width: 24, height: 24, color: "#F5C400", animation: "spin 1s linear infinite" }} /></div>}>
            <LoginForm />
        </React.Suspense>
    );
}

function LoginForm() {
    const { login, user, loading } = useAuth();
    const router       = useRouter();
    const searchParams = useSearchParams();
    const from         = searchParams.get("from") || "/dashboard";

    const [email,    setEmail]    = useState("");
    const [password, setPassword] = useState("");
    const [showPass, setShowPass] = useState(false);
    const [error,    setError]    = useState("");
    const [busy,     setBusy]     = useState(false);

    useEffect(() => {
        if (!loading && user) window.location.href = from;
    }, [user, loading, from]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(""); setBusy(true);
        try {
            await login(email.trim(), password);
            // Set auth cookie so middleware knows
            document.cookie = "ciphera_authed=1; path=/; max-age=2592000; SameSite=Lax";
            window.location.href = from;
        } catch (err: any) {
            setError(err.message || "Login failed. Check your credentials.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", cursor: "none" }}>
            <div style={{ width: "100%", maxWidth: "420px" }}>

                {/* Logo */}
                <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "40px", textDecoration: "none", justifyContent: "center" }}>
                    <div style={{ background: "#F5C400", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Shield style={{ width: 18, height: 18, color: "#080808" }} />
                    </div>
                    <span style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "22px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#EFEFEF" }}>Ciphera</span>
                </Link>

                {/* Card */}
                <div style={{ border: "1px solid rgba(239,239,239,0.07)", padding: "36px", background: "#0D0D0D" }}>
                    {/* Header */}
                    <div style={{ marginBottom: "28px" }}>
                        <h1 style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 900, fontSize: "28px", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: 0, marginBottom: "6px" }}>
                            Sign In
                        </h1>
                        <p style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", color: "rgba(239,239,239,0.7)", margin: 0 }}>
                            Access your redaction workspace
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(185,28,28,0.1)", border: "1px solid rgba(185,28,28,0.3)", marginBottom: "20px" }}>
                            <AlertCircle style={{ width: 14, height: 14, color: "#B91C1C", flexShrink: 0 }} />
                            <span style={{ fontFamily: "Barlow, sans-serif", fontSize: "12px", color: "#fca5a5" }}>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* Email */}
                        <div>
                            <label style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: "bold", color: "rgba(239,239,239,0.8)", display: "block", marginBottom: "6px" }}>
                                Email Address
                            </label>
                            <input
                                type="email" required autoComplete="email"
                                value={email} onChange={e => setEmail(e.target.value)}
                                style={{ width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "10px 14px", fontFamily: "Arial, sans-serif", fontSize: "14px", color: "#EFEFEF", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
                                onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"}
                                placeholder="you@company.com"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: "bold", color: "rgba(239,239,239,0.8)", display: "block", marginBottom: "6px" }}>
                                Password
                            </label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showPass ? "text" : "password"} required autoComplete="current-password"
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    style={{ width: "100%", background: "#080808", border: "1px solid rgba(239,239,239,0.12)", padding: "10px 40px 10px 14px", fontFamily: "Arial, sans-serif", fontSize: "14px", color: "#EFEFEF", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
                                    onFocus={e => e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"}
                                    onBlur={e  => e.currentTarget.style.borderColor = "rgba(239,239,239,0.12)"}
                                    placeholder="••••••••"
                                />
                                <button type="button" onClick={() => setShowPass(v => !v)}
                                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.6)", padding: 0, display: "flex" }}>
                                    {showPass ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                                </button>
                            </div>
                        </div>

                        {/* Submit */}
                        <button type="submit" disabled={busy}
                            style={{ background: busy ? "rgba(245,196,0,0.5)" : "#F5C400", color: "#080808", border: "none", padding: "12px 24px", fontFamily: "Arial, sans-serif", fontSize: "14px", fontWeight: "bold", cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "4px", transition: "background 0.15s" }}>
                            {busy && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
                            {busy ? "Signing In…" : "Sign In"}
                        </button>
                    </form>

                    {/* Footer */}
                    <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(239,239,239,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", color: "rgba(239,239,239,0.7)" }}>
                            No account?
                        </span>
                        <Link href="/register" style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", fontWeight: "bold", color: "#F5C400", textDecoration: "none" }}>
                            Create Account
                        </Link>
                    </div>
                </div>

                {/* Trust line */}
                <p style={{ textAlign: "center", fontFamily: "Courier New, monospace", fontSize: "8px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.15)", marginTop: "20px" }}>
                    Zero retention · Client-side inference · DPDP Act 2023
                </p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
