"use client";

import { useUiStore } from "@/store/uiStore";
import { motion, AnimatePresence } from "framer-motion";
import { designTokens } from "@/lib/designTokens";

export function MobileDrawer() {
    const { isMobileMenuOpen, setMobileMenu } = useUiStore();

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
                                className="w-8 h-8 rounded-full bg-[#1E1E1E] flex items-center justify-center text-muted-foreground hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <nav className="flex flex-col gap-2">
                            <div className="px-4 py-3 rounded-xl bg-primary text-black font-medium">
                                Dashboard
                            </div>
                            <div className="px-4 py-3 rounded-xl bg-transparent text-secondary-foreground hover:bg-[#1E1E1E] cursor-pointer font-medium transition-colors">
                                Redact Documents
                            </div>
                            <div className="px-4 py-3 rounded-xl bg-transparent text-secondary-foreground hover:bg-[#1E1E1E] cursor-pointer font-medium transition-colors">
                                Settings
                            </div>
                        </nav>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
