"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShieldCheck, Settings, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const NAV = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", sublabel: "Overview & telemetry logs" },
    { href: "/redact",    icon: ShieldCheck,      label: "Redact",        sublabel: "Visual workspace" },
    { href: "/batch",     icon: Layers,           label: "Batch",   sublabel: "Pipeline assembly line" },
    { href: "/settings",  icon: Settings,         label: "Settings",   sublabel: "Engine config console" },
];

export function AppSidebar() {
    const pathname   = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside
            className="hidden md:flex flex-col bg-[#0a0a0b] transition-all duration-300 ease-out relative border-r border-[rgba(239,239,239,0.07)]"
            style={{ width: collapsed ? '72px' : '260px' }}
        >
            {/* Logo */}
            <Link href="/" className="h-[72px] flex items-center gap-3 px-5 shrink-0 border-b border-[rgba(239,239,239,0.07)] group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(245,196,0,0.05)] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
                <div className="shrink-0 w-[6px] h-[6px] bg-[#F5C400] transition-all duration-300 group-hover:shadow-[0_0_12px_rgba(245,196,0,0.6)] group-hover:scale-110" />
                {!collapsed && (
                    <div className="overflow-hidden flex flex-col justify-center transform transition-transform duration-300 group-hover:translate-x-1">
                        <div className="text-[#EFEFEF] uppercase leading-none" style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: '18px', letterSpacing: '0.05em' }}>CIPHERA</div>
                        <div className="uppercase" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, color: 'rgba(239,239,239,0.7)', marginTop: '2px', letterSpacing: '0.1em' }}>v3 CORE</div>
                    </div>
                )}
            </Link>

            {/* Nav */}
            <nav className="flex-1 py-6 flex flex-col gap-2 overflow-hidden px-3">
                {NAV.map(({ href, icon: Icon, label, sublabel }) => {
                    const active = pathname === href;
                    return (
                        <Link key={href} href={href}
                            className={`group relative flex items-center gap-4 px-3 py-3 transition-all duration-300 overflow-hidden ${active ? 'bg-[rgba(245,196,0,0.06)]' : 'hover:bg-[rgba(239,239,239,0.04)]'}`}
                        >
                            {/* Active Indicator / Hover Border */}
                            <div className={`absolute left-0 top-0 bottom-0 w-[2px] transition-all duration-300 ease-out ${active ? 'bg-[#F5C400] shadow-[0_0_8px_rgba(245,196,0,0.5)]' : 'bg-[rgba(239,239,239,0.2)] opacity-0 group-hover:opacity-100 scale-y-0 group-hover:scale-y-100'}`} />

                            {/* Icon */}
                            <div className={`relative z-10 shrink-0 transition-all duration-300 ${active ? 'text-[#F5C400] scale-110 drop-shadow-[0_0_8px_rgba(245,196,0,0.5)]' : 'text-[#EFEFEF] opacity-70'} group-hover:text-[#F5C400] group-hover:scale-110`}>
                                <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.5 : 2} />
                            </div>

                            {/* Labels */}
                            {!collapsed && (
                                <div className="relative z-10 flex-1 min-w-0 overflow-hidden flex flex-col gap-1 transform transition-transform duration-300 group-hover:translate-x-1">
                                    <div className={`uppercase truncate transition-all duration-300`}
                                         style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: '11px', fontWeight: active ? 600 : 500, letterSpacing: '0.12em', color: active ? '#F5C400' : '#EFEFEF' }}>
                                        {label}
                                    </div>
                                    <div className={`truncate transition-colors duration-300`}
                                         style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: active ? 'rgba(239,239,239,0.9)' : 'rgba(239,239,239,0.6)' }}>
                                        {sublabel}
                                    </div>
                                </div>
                            )}

                            {/* Active indicator dot (collapsed) */}
                            {active && collapsed && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#F5C400] rounded-full shadow-[0_0_6px_rgba(245,196,0,0.6)]" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Status & Collapse */}
            <div className="border-t border-[rgba(239,239,239,0.07)] flex flex-col shrink-0 bg-[#0a0a0b] relative z-20">
                {!collapsed && (
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(239,239,239,0.03)] bg-gradient-to-r from-[rgba(74,222,128,0.03)] to-transparent">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shrink-0 shadow-[0_0_8px_rgba(74,222,128,0.6)]" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
                        <span className="truncate" style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, letterSpacing: '0.02em', color: '#EFEFEF' }}>Inference engine: Active</span>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="w-full flex items-center justify-center gap-3 px-5 py-4 text-[#EFEFEF] opacity-70 hover:opacity-100 hover:bg-[rgba(239,239,239,0.03)] transition-all cursor-pointer bg-transparent border-none outline-none group"
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed
                        ? <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        : <><ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" /><span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, letterSpacing: '0.02em', color: '#EFEFEF' }}>Collapse sidebar</span></>
                    }
                </button>
            </div>
            
            <style jsx global>{`
                @keyframes pulse-dot {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.2); }
                }
            `}</style>
        </aside>
    );
}