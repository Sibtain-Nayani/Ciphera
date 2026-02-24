"use client";

import { useUiStore } from "@/store/uiStore";

export function AppSidebar() {
    const { isSidebarCollapsed } = useUiStore();

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
                <div className="flex items-center px-4 py-3 rounded-xl bg-primary text-black font-medium relative group cursor-pointer">
                    <span className="w-5 h-5 bg-black/20 rounded shrink-0" />
                    {!isSidebarCollapsed && <span className="ml-3">Dashboard</span>}
                </div>

                <div className="flex items-center px-4 py-3 rounded-xl bg-transparent text-secondary-foreground hover:bg-[#1E1E1E] font-medium transition-colors cursor-pointer">
                    <span className="w-5 h-5 bg-white/10 rounded shrink-0" />
                    {!isSidebarCollapsed && <span className="ml-3">Redact Documents</span>}
                </div>
            </nav>
        </aside>
    );
}
