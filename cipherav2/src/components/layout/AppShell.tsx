"use client";

import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { MobileHeader } from "./MobileHeader";
import { MobileDrawer } from "./MobileDrawer";

export function AppShell({ children }: { children: ReactNode }) {
    return (
        <div className="relative min-h-screen flex flex-col md:flex-row bg-background overflow-hidden">
            <AppSidebar />
            <MobileDrawer />

            <div className="flex-1 flex flex-col min-h-screen min-w-0">
                <MobileHeader />

                <main className="flex-1 overflow-x-hidden overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
