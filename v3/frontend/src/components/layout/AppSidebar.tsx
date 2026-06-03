"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, ShieldCheck, Settings, Layers, ChevronLeft, ChevronRight, LogOut, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Mission Control", sublabel: "Telemetry & audit" },
    { href: "/redact",    icon: ShieldCheck,      label: "Sanitize",        sublabel: "Redact & secure docs" },
    { href: "/batch",     icon: Layers,           label: "Assembly Line",   sublabel: "Bulk processing queue" },
    { href: "/settings",  icon: Settings,         label: "Engine Config",   sublabel: "Rules & preferences" },
];

export function AppSidebar() {
    const pathname    = usePathname();
    const router      = useRouter();
    const { user, logout } = useAuth();
    const [collapsed, setCollapsed] = useState(false);

    const handleLogout = async () => {
        await logout();
        document.cookie = "ciphera_authed=; path=/; max-age=0";
        router.replace("/login");
    };

    return (
        <aside style={{ width: collapsed ? "72px" : "260px", background: "#080808", borderRight: "1px solid rgba(239,239,239,0.07)", transition: "width 0.25s ease", display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", fontFamily: "Arial, sans-serif" }}>

            {/* Logo */}
            <Link href="/" style={{ height: "64px", display: "flex", alignItems: "center", gap: "12px", padding: "0 20px", borderBottom: "1px solid rgba(239,239,239,0.07)", textDecoration: "none", flexShrink: 0 }}>
                <div style={{ width: "28px", height: "28px", background: "#F5C400", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: "4px" }}>
                    <ShieldCheck style={{ width: "16px", height: "16px", color: "#080808" }} />
                </div>
                {!collapsed && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ fontWeight: 900, fontSize: "20px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#EFEFEF", lineHeight: 1 }}>Ciphera</div>
                        <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(239,239,239,0.4)", textTransform: "uppercase", marginTop: "4px" }}>V3</div>
                    </div>
                )}
            </Link>

            {/* Nav */}
            <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: "4px", overflow: "hidden" }}>
                {NAV.map(({ href, icon: Icon, label, sublabel }) => {
                    const active = pathname === href || pathname.startsWith(href + "/");
                    return (
                        <Link key={href} href={href} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderBottom: active ? "1px solid #F5C400" : "1px solid transparent", borderLeft: active ? "3px solid #F5C400" : "3px solid transparent", background: active ? "rgba(245,196,0,0.06)" : "transparent", textDecoration: "none", transition: "all 0.15s", borderRadius: "0 4px 4px 0" }}
                            onMouseEnter={e => { if (!active) { e.currentTarget.style.borderBottom = "1px solid rgba(245,196,0,0.3)"; e.currentTarget.style.background = "rgba(239,239,239,0.03)"; } }}
                            onMouseLeave={e => { if (!active) { e.currentTarget.style.borderBottom = "1px solid transparent"; e.currentTarget.style.background = "transparent"; } }}>
                            <Icon style={{ width: "18px", height: "18px", color: active ? "#F5C400" : "rgba(239,239,239,0.4)", flexShrink: 0, transition: "color 0.15s" }} />
                            {!collapsed && (
                                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <div style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "0.03em", textTransform: "uppercase", color: active ? "#EFEFEF" : "rgba(239,239,239,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                                    <div style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", whiteSpace: "nowrap" }}>{sublabel}</div>
                                </div>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* User profile + logout */}
            <div style={{ borderTop: "1px solid rgba(239,239,239,0.07)", flexShrink: 0, paddingBottom: "8px" }}>
                {user && (
                    <Link href="/account" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", textDecoration: "none", borderBottom: "1px solid rgba(239,239,239,0.07)", transition: "background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(239,239,239,0.04)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        {/* Avatar */}
                        <div style={{ width: "32px", height: "32px", background: "rgba(245,196,0,0.15)", border: "1px solid rgba(245,196,0,0.3)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontWeight: 900, fontSize: "15px", color: "#F5C400" }}>
                                {user.full_name?.[0]?.toUpperCase() || "U"}
                            </span>
                        </div>
                        {!collapsed && (
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: "15px", color: "#EFEFEF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "2px" }}>{user.full_name}</div>
                                <div style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.plan} plan</div>
                            </div>
                        )}
                    </Link>
                )}

                {/* Status + collapse */}
                <div style={{ padding: "12px 16px" }}>
                    {!collapsed && (
                        <div style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                            <div style={{ width: 8, height: 8, background: "#22c55e", borderRadius: "50%", flexShrink: 0, boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
                            Local inference active
                        </div>
                    )}
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => setCollapsed(c => !c)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: "8px", padding: "8px 0", background: "transparent", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.4)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", transition: "color 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#EFEFEF"}
                            onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.4)"}>
                            {collapsed ? <ChevronRight style={{ width: 16, height: 16 }} /> : <><ChevronLeft style={{ width: 16, height: 16 }} /><span>Collapse</span></>}
                        </button>
                        {user && (
                            <button onClick={handleLogout} title="Sign out" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", color: "rgba(239,239,239,0.4)", transition: "color 0.15s" }}
                                onMouseEnter={e => e.currentTarget.style.color = "#fca5a5"}
                                onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.4)"}>
                                <LogOut style={{ width: 16, height: 16 }} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
}
