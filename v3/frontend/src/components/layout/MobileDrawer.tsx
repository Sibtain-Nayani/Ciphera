"use client";

import { useUiStore } from "@/store/uiStore";
import { motion, AnimatePresence } from "framer-motion";
import { designTokens } from "@/lib/designTokens";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShieldCheck, Settings } from "lucide-react";

export function MobileDrawer() {
    const { isMobileMenuOpen, setMobileMenu } = useUiStore();
    const pathname = usePathname();

    return (
        <AnimatePresence>
            {isMobileMenuOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setMobileMenu(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={designTokens.animations.drawerSpring}
                        className="fixed inset-y-0 left-0 w-64 bg-[#141414] border-r border-[#3B3B3B] z-50 md:hidden flex flex-col p-4"
                    >
                        <div className="flex items-center justify-between mb-8">
                            <span className="font-semibold text-xl text-white">Navigation</span>
                            <button
                                onClick={() => setMobileMenu(false)}
                                className="w-8 h-8 rounded-full bg-[#1E1E1E] flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <nav className="flex flex-col gap-2">
                            <Link
                                href="/dashboard"
                                onClick={() => setMobileMenu(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${pathname === "/dashboard"
                                        ? "bg-primary text-black"
                                        : "bg-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1E]"
                                    }`}
                            >
                                <LayoutDashboard className="w-5 h-5 shrink-0" />
                                <span>Dashboard</span>
                            </Link>
                            <Link
                                href="/redact"
                                onClick={() => setMobileMenu(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${pathname === "/redact"
                                        ? "bg-primary text-black"
                                        : "bg-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1E]"
                                    }`}
                            >
                                <ShieldCheck className="w-5 h-5 shrink-0" />
                                <span>Redact Documents</span>
                            </Link>
                            <Link
                                href="/settings"
                                onClick={() => setMobileMenu(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${pathname === "/settings"
                                        ? "bg-primary text-black"
                                        : "bg-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1E]"
                                    }`}
                            >
                                <Settings className="w-5 h-5 shrink-0" />
                                <span>Settings</span>
                            </Link>
                        </nav>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
