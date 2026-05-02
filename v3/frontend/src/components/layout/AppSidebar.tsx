"use client";

import { useUiStore } from "@/store/uiStore";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import {
    LayoutDashboard, ShieldCheck, Settings, Layers,
} from "lucide-react";

const NAV = [
    {
        href:    "/dashboard",
        icon:    LayoutDashboard,
        label:   "Mission Control",
        sublabel: "Telemetry & audit",
        color:   "#FFA500",
        animation: "group-hover:rotate-12 group-hover:scale-110",
    },
    {
        href:    "/redact",
        icon:    ShieldCheck,
        label:   "Sanitize",
        sublabel: "Redact & secure docs",
        color:   "#34D399",
        animation: "group-hover:scale-125 group-hover:-rotate-6",
    },
    {
        href:    "/batch",
        icon:    Layers,
        label:   "Assembly Line",
        sublabel: "Bulk processing queue",
        color:   "#818CF8",
        animation: "group-hover:translate-y-[-3px] group-hover:scale-110",
    },
    {
        href:    "/settings",
        icon:    Settings,
        label:   "Engine Config",
        sublabel: "Rules & preferences",
        color:   "#F472B6",
        animation: "group-hover:rotate-90",
    },
];

export function AppSidebar() {
    const { isSidebarCollapsed } = useUiStore();
    const pathname = usePathname();

    return (
        <aside
            className={`hidden md:flex flex-col border-r border-[#2A2A2A] bg-[#0E0E0E] transition-all duration-300 ease-in-out ${isSidebarCollapsed ? "w-20" : "w-64"}`}
        >
            {/* Logo */}
            <div className="h-16 flex items-center justify-center md:justify-start px-4 md:px-5 border-b border-[#2A2A2A] shrink-0">
                <div className="shrink-0 flex items-center justify-center">
                    <Logo className="w-8 h-8 md:w-9 md:h-9" />
                </div>
                {!isSidebarCollapsed && (
                    <div className="ml-3">
                        <span className="font-bold text-xl text-white tracking-tight">Ciphera</span>
                        <div className="text-[9px] font-mono text-[#FFA500]/60 tracking-widest uppercase">v3 · secure</div>
                    </div>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 p-3 flex flex-col gap-1.5">
                {NAV.map(({ href, icon: Icon, label, sublabel, color, animation }) => {
                    const active = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`group relative flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-all duration-200 overflow-hidden ${
                                active
                                    ? "text-black"
                                    : "text-gray-500 hover:text-white"
                            }`}
                            style={active ? { backgroundColor: color } : {}}
                        >
                            {/* Hover background glow */}
                            {!active && (
                                <div
                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl"
                                    style={{ backgroundColor: color + '12' }}
                                />
                            )}

                            {/* Active left accent bar */}
                            {active && (
                                <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-black/20" />
                            )}

                            {/* Icon with animation */}
                            <div
                                className={`relative z-10 shrink-0 transition-all duration-300 ease-out ${animation}`}
                                style={active ? { color: 'black' } : { color: active ? 'black' : '#6B7280' }}
                            >
                                <Icon
                                    className="w-5 h-5"
                                    style={{ color: active ? 'black' : undefined }}
                                />
                            </div>

                            {/* Label */}
                            {!isSidebarCollapsed && (
                                <div className="relative z-10 flex-1 min-w-0 overflow-hidden">
                                    <div
                                        className={`text-sm font-semibold truncate transition-all duration-200 ${
                                            active ? 'text-black' : 'text-gray-300 group-hover:text-white'
                                        }`}
                                        style={active ? {} : {}}
                                    >
                                        {label}
                                    </div>
                                    <div
                                        className={`text-[10px] font-mono truncate transition-all duration-200 ${
                                            active ? 'text-black/60' : 'text-gray-600 group-hover:text-gray-400'
                                        }`}
                                    >
                                        {sublabel}
                                    </div>
                                </div>
                            )}

                            {/* Active dot indicator (collapsed mode) */}
                            {isSidebarCollapsed && active && (
                                <div className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-black/30" />
                            )}

                            {/* Hover color bar at bottom */}
                            {!active && (
                                <div
                                    className="absolute bottom-0 left-3 right-3 h-px opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            {!isSidebarCollapsed && (
                <div className="p-4 border-t border-[#2A2A2A] shrink-0">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#141414] border border-[#2A2A2A]">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="text-[9px] font-mono text-gray-600 truncate">LOCAL INFERENCE ACTIVE</span>
                    </div>
                </div>
            )}
        </aside>
    );
}