"use client";

import { useUiStore } from "@/store/uiStore";
import { Logo } from "./Logo";

export function MobileHeader() {
    const { toggleMobileMenu } = useUiStore();

    return (
        <header className="md:hidden flex items-center justify-between h-16 px-4 bg-[#1E1E1E] border-b border-[#3B3B3B] z-40 relative">
            <div className="flex items-center gap-2">
                <Logo className="w-8 h-8" />
                <span className="font-semibold text-lg text-white tracking-tight">Ciphera</span>
            </div>

            <button
                onClick={toggleMobileMenu}
                className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-full font-medium transition-colors border border-primary/20"
            >
                Menu
            </button>
        </header>
    );
}
