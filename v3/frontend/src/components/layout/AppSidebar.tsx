"use client";
import { useUiStore } from "@/store/uiStore";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { LayoutDashboard, ShieldCheck, Settings, Layers } from "lucide-react";

const NAV = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/redact",    icon: ShieldCheck,      label: "Redact Documents" },
    { href: "/batch",     icon: Layers,           label: "Batch Process" },
    { href: "/settings",  icon: Settings,         label: "Settings" },
];

export function AppSidebar() {
    const { isSidebarCollapsed } = useUiStore();
    const pathname = usePathname();

    return (
        <aside className={`hidden md:flex flex-col border-r border-[#3B3B3B] bg-[#141414] transition-all duration-300 ${isSidebarCollapsed ? "w-20" : "w-64"}`}>
            <div className="h-16 flex items-center justify-center md:justify-start px-4 md:px-5 border-b border-[#3B3B3B]">
                <div className="shrink-0 flex items-center justify-center">
                    <Logo className="w-8 h-8 md:w-9 md:h-9" />
                </div>
                {!isSidebarCollapsed && (
                    <span className="ml-3 font-semibold text-xl text-white tracking-tight">Ciphera</span>
                )}
            </div>

            <nav className="flex-1 p-4 flex flex-col gap-2">
                {NAV.map(({ href, icon: Icon, label }) => {
                    const active = pathname === href;
                    return (
                        <Link key={href} href={href}
                            className={`flex items-center px-4 py-3 rounded-xl font-medium transition-colors cursor-pointer ${active ? "bg-primary text-black" : "bg-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1E]"}`}>
                            <Icon className={`w-5 h-5 shrink-0 transition-transform ${active ? "scale-110" : "opacity-80"}`} />
                            {!isSidebarCollapsed && <span className="ml-3">{label}</span>}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}