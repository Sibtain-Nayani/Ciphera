"use client";

import { useUiStore } from "@/store/uiStore";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppSidebar() {
    const { isSidebarCollapsed } = useUiStore();
    const pathname = usePathname();

    return (
        <aside
            className={`hidden md:flex flex-col border-r border-[#3B3B3B] bg-[#141414] transition-all duration-300 ${isSidebarCollapsed ? "w-20" : "w-64"
                }`}
        >
            <div className="h-16 flex items-center px-4 border-b border-[#3B3B3B]">
                <div className="w-8 h-8 rounded bg-primary flex items-center justify-center font-bold text-black shrink-0">
                    C
                </div>
                {!isSidebarCollapsed && (
                    <span className="ml-3 font-semibold text-xl text-white tracking-tight">Ciphera</span>
                )}
            </div>

            <nav className="flex-1 p-4 flex flex-col gap-2">
                <Link
                    href="/dashboard"
                    className={`flex items-center px-4 py-3 rounded-xl font-medium transition-colors cursor-pointer ${pathname === "/dashboard"
                            ? "bg-primary text-black"
                            : "bg-transparent text-secondary-foreground hover:bg-[#1E1E1E]"
                        }`}
                >
                    <span className={`w-5 h-5 rounded shrink-0 ${pathname === "/dashboard" ? "bg-black/20" : "bg-white/10"}`} />
                    {!isSidebarCollapsed && <span className="ml-3">Dashboard</span>}
                </Link>

                <Link
                    href="/redact"
                    className={`flex items-center px-4 py-3 rounded-xl font-medium transition-colors cursor-pointer ${pathname === "/redact"
                            ? "bg-primary text-black"
                            : "bg-transparent text-secondary-foreground hover:bg-[#1E1E1E]"
                        }`}
                >
                    <span className={`w-5 h-5 rounded shrink-0 ${pathname === "/redact" ? "bg-black/20" : "bg-white/10"}`} />
                    {!isSidebarCollapsed && <span className="ml-3">Redact Documents</span>}
                </Link>

                <Link
                    href="/settings"
                    className={`flex items-center px-4 py-3 rounded-xl font-medium transition-colors cursor-pointer ${pathname === "/settings"
                            ? "bg-primary text-black"
                            : "bg-transparent text-secondary-foreground hover:bg-[#1E1E1E]"
                        }`}
                >
                    <span className={`w-5 h-5 rounded shrink-0 ${pathname === "/settings" ? "bg-black/20" : "bg-white/10"}`} />
                    {!isSidebarCollapsed && <span className="ml-3">Settings</span>}
                </Link>
            </nav>
        </aside>
    );
}
