"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
    LayoutDashboard, ShieldCheck, Settings,
    Layers, ChevronLeft, ChevronRight, LogOut, UserPlus,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Mission Control", sublabel: "Telemetry & audit"    },
    { href: "/redact",    icon: ShieldCheck,      label: "Sanitize",        sublabel: "Redact & secure docs" },
    { href: "/batch",     icon: Layers,           label: "Assembly Line",   sublabel: "Bulk processing queue"},
    { href: "/settings",  icon: Settings,         label: "Engine Config",   sublabel: "Rules & preferences"  },
];

export function AppSidebar() {
    const pathname            = usePathname();
    const router              = useRouter();
    const { user, logout, isGuest } = useAuth();
    const [collapsed, setCollapsed] = useState(false);

    const handleLogout = async () => {
        await logout();
        // Clear both cookies — real account and guest
        document.cookie = "ciphera_authed=; path=/; max-age=0; SameSite=Lax";
        document.cookie = "ciphera_guest=; path=/; max-age=0; SameSite=Lax";
        router.replace("/");
    };

    return (
        <aside style={{
            width: collapsed ? "72px" : "260px",
            background: "#080808",
            borderRight: "1px solid rgba(239,239,239,0.07)",
            transition: "width 0.25s ease",
            display: "flex", flexDirection: "column",
            flexShrink: 0, height: "100vh",
        }}>

            {/* ── Logo ─────────────────────────────────────────────────── */}
            <Link href="/" style={{ height: "64px", display: "flex", alignItems: "center", gap: "12px", padding: "0 20px", borderBottom: "1px solid rgba(239,239,239,0.07)", textDecoration: "none", flexShrink: 0 }}>
                <div style={{ width: "28px", height: "28px", background: "#F5C400", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ShieldCheck style={{ width: "16px", height: "16px", color: "#080808" }} />
                </div>
                {!collapsed && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "20px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#EFEFEF", lineHeight: 1 }}>Ciphera</div>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.15em", color: "rgba(239,239,239,0.4)", textTransform: "uppercase", marginTop: "3px" }}>V3</div>
                    </div>
                )}
            </Link>

            {/* ── Nav ──────────────────────────────────────────────────── */}
            <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: "4px", overflow: "hidden" }}>
                {NAV.map(({ href, icon: Icon, label, sublabel }) => {
                    const active = pathname === href || pathname.startsWith(href + "/");
                    return (
                        <Link key={href} href={href} style={{
                            display: "flex", alignItems: "center", gap: "12px",
                            padding: "12px 14px",
                            borderLeft: active ? "3px solid #F5C400" : "3px solid transparent",
                            background: active ? "rgba(245,196,0,0.06)" : "transparent",
                            textDecoration: "none", transition: "all 0.15s",
                        }}
                            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(239,239,239,0.03)"; e.currentTarget.style.borderLeft = "3px solid rgba(245,196,0,0.3)"; } }}
                            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderLeft = "3px solid transparent"; } }}>
                            <Icon style={{ width: "18px", height: "18px", color: active ? "#F5C400" : "rgba(239,239,239,0.4)", flexShrink: 0, transition: "color 0.15s" }} />
                            {!collapsed && (
                                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: "15px", letterSpacing: "0.05em", textTransform: "uppercase", color: active ? "#EFEFEF" : "rgba(239,239,239,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", whiteSpace: "nowrap" }}>{sublabel}</div>
                                </div>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* ── Bottom — user / guest ─────────────────────────────────── */}
            <div style={{ borderTop: "1px solid rgba(239,239,239,0.07)", flexShrink: 0 }}>

                {/* Real account row */}
                {user && !isGuest && (
                    <Link href="/account" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", textDecoration: "none", borderBottom: "1px solid rgba(239,239,239,0.07)", transition: "background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(239,239,239,0.04)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        {/* Avatar */}
                        <div style={{ width: "32px", height: "32px", background: "rgba(245,196,0,0.15)", border: "1px solid rgba(245,196,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "15px", color: "#F5C400" }}>
                                {user.full_name?.[0]?.toUpperCase() || "U"}
                            </span>
                        </div>
                        {!collapsed && (
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontWeight: 600, fontSize: "14px", color: "#EFEFEF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.full_name}</div>
                                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#F5C400", marginTop: "2px" }}>{user.plan} plan</div>
                            </div>
                        )}
                    </Link>
                )}

                {/* Guest row — show sign up CTA instead of account link */}
                {user && isGuest && !collapsed && (
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(239,239,239,0.07)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                            <div style={{ width: "32px", height: "32px", background: "rgba(239,239,239,0.06)", border: "1px solid rgba(239,239,239,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "13px", color: "rgba(239,239,239,0.4)" }}>G</span>
                            </div>
                            <div>
                                <div style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontWeight: 600, fontSize: "13px", color: "rgba(239,239,239,0.6)" }}>Guest Session</div>
                                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", marginTop: "2px" }}>Data not saved</div>
                            </div>
                        </div>
                        <Link href="/register" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "7px 0", background: "rgba(245,196,0,0.08)", border: "1px solid rgba(245,196,0,0.25)", textDecoration: "none", transition: "all 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,196,0,0.14)"; e.currentTarget.style.borderColor = "rgba(245,196,0,0.5)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(245,196,0,0.08)"; e.currentTarget.style.borderColor = "rgba(245,196,0,0.25)"; }}>
                            <UserPlus style={{ width: 12, height: 12, color: "#F5C400" }} />
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, color: "#F5C400" }}>Save your work →</span>
                        </Link>
                    </div>
                )}

                {/* Collapsed guest avatar */}
                {user && isGuest && collapsed && (
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(239,239,239,0.07)", display: "flex", justifyContent: "center" }}>
                        <div style={{ width: "32px", height: "32px", background: "rgba(239,239,239,0.06)", border: "1px solid rgba(239,239,239,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "13px", color: "rgba(239,239,239,0.4)" }}>G</span>
                        </div>
                    </div>
                )}

                {/* Status + collapse + logout */}
                <div style={{ padding: "10px 14px", paddingBottom: "12px" }}>
                    {!collapsed && (
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
                            <div style={{ width: 7, height: 7, background: "#22c55e", borderRadius: "50%", flexShrink: 0, boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
                            Local inference active
                        </div>
                    )}
                    <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => setCollapsed(c => !c)}
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: "7px", padding: "7px 0", background: "transparent", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.4)", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", transition: "color 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#EFEFEF"}
                            onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.4)"}>
                            {collapsed
                                ? <ChevronRight style={{ width: 15, height: 15 }} />
                                : <><ChevronLeft style={{ width: 15, height: 15 }} /><span>Collapse</span></>
                            }
                        </button>
                        {user && (
                            <button onClick={handleLogout} title={isGuest ? "Exit guest session" : "Sign out"}
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "7px 10px", background: "transparent", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.4)", transition: "color 0.15s" }}
                                onMouseEnter={e => e.currentTarget.style.color = isGuest ? "#F5C400" : "#fca5a5"}
                                onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.4)"}>
                                <LogOut style={{ width: 15, height: 15 }} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
}