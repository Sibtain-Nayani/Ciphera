"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLanding = pathname === "/";

    return (
        <div className="flex h-screen overflow-hidden">
            {!isLanding && <AppSidebar />}
            <main className="flex-1 overflow-y-auto min-w-0">
                {children}
            </main>
        </div>
    );
}