"use client";

import { useUiStore } from "@/store/uiStore";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { LayoutDashboard, ShieldCheck, Settings, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const NAV = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Mission Control", sublabel: "Telemetry & audit",      color: "#FFA500", glow: "rgba(255,165,0,0.15)",    iconAnim: "group-hover:rotate-12 group-hover:scale-110" },
    { href: "/redact",    icon: ShieldCheck,      label: "Sanitize",        sublabel: "Redact & secure docs",   color: "#34D399", glow: "rgba(52,211,153,0.15)",  iconAnim: "group-hover:scale-125 group-hover:-rotate-6" },
    { href: "/batch",     icon: Layers,           label: "Assembly Line",   sublabel: "Bulk processing queue",  color: "#818CF8", glow: "rgba(129,140,248,0.15)", iconAnim: "group-hover:-translate-y-1 group-hover:scale-110" },
    { href: "/settings",  icon: Settings,         label: "Engine Config",   sublabel: "Rules & preferences",    color: "#F472B6", glow: "rgba(244,114,182,0.15)", iconAnim: "group-hover:rotate-90" },
];

export function AppSidebar() {
    const pathname   = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside
            className="hidden md:flex flex-col bg-[#0A0A0A] transition-all duration-300 ease-in-out relative"
            style={{ width: collapsed ? '72px' : '220px' }}
        >
            {/* Subtle right edge glow — replaces harsh border */}
            <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/5 to-transparent" />

            {/* Logo */}
            <Link href="/" className="h-16 flex items-center gap-3 px-4 shrink-0 group border-b border-white/[0.04]">
                <div className="shrink-0 p-1.5 rounded-lg bg-[#FFA500] group-hover:bg-[#ffb733] transition-colors">
                    <Logo className="w-5 h-5" />
                </div>
                {!collapsed && (
                    <div className="overflow-hidden">
                        <div className="font-bold text-white tracking-tight leading-none" style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '17px' }}>CIPHERA</div>
                        <div className="text-[9px] font-mono text-[#FFA500]/50 tracking-widest mt-0.5">V3 · SECURE</div>
                    </div>
                )}
            </Link>

            {/* Nav */}
            <nav className="flex-1 p-2.5 flex flex-col gap-1 overflow-hidden">
                {NAV.map(({ href, icon: Icon, label, sublabel, color, glow, iconAnim }) => {
                    const active = pathname === href;
                    return (
                        <Link key={href} href={href}
                            className={`group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 overflow-hidden ${active ? 'text-black' : 'text-gray-500 hover:text-white'}`}
                            style={active ? { backgroundColor: color } : {}}
                        >
                            {/* Hover background */}
                            {!active && (
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl"
                                    style={{ background: `radial-gradient(ellipse at left, ${glow}, transparent 70%)` }} />
                            )}

                            {/* Icon */}
                            <div className={`relative z-10 shrink-0 transition-all duration-300 ease-out ${iconAnim}`}
                                style={{ color: active ? 'black' : color }}>
                                <Icon className="w-[18px] h-[18px]" />
                            </div>

                            {/* Labels */}
                            {!collapsed && (
                                <div className="relative z-10 flex-1 min-w-0 overflow-hidden">
                                    <div className={`text-[13px] font-semibold truncate leading-tight transition-colors ${active ? 'text-black' : 'text-gray-300 group-hover:text-white'}`}>
                                        {label}
                                    </div>
                                    <div className={`text-[10px] font-mono truncate transition-colors ${active ? 'text-black/60' : 'text-gray-600 group-hover:text-gray-500'}`}>
                                        {sublabel}
                                    </div>
                                </div>
                            )}

                            {/* Active indicator dot (collapsed) */}
                            {active && collapsed && (
                                <div className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-black/30" />
                            )}

                            {/* Bottom accent line on hover */}
                            {!active && (
                                <div className="absolute bottom-0 left-3 right-3 h-px opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full"
                                    style={{ backgroundColor: color + '60' }} />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Collapse toggle + status */}
            <div className="p-2.5 border-t border-white/[0.04] space-y-2 shrink-0">
                {!collapsed && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03]">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="text-[9px] font-mono text-gray-600 truncate">LOCAL INFERENCE ACTIVE</span>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition-all cursor-pointer"
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed
                        ? <ChevronRight className="w-4 h-4" />
                        : <><ChevronLeft className="w-3.5 h-3.5" /><span className="text-[10px] font-mono">Collapse</span></>
                    }
                </button>
            </div>
        </aside>
    );
}