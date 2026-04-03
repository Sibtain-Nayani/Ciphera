"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/store/uiStore";
import { useDocumentStore } from "@/store/documentStore";
import { Search, LayoutDashboard, Settings2, ShieldCheck, Trash2, Command, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function CommandPalette() {
    const { isCommandPaletteOpen, setCommandPalette } = useUiStore();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");

    // Command registration
    const commands = [
        {
            id: 'nav-dashboard',
            title: 'Go to Dashboard',
            icon: <LayoutDashboard className="w-4 h-4 text-gray-400" />,
            action: () => router.push('/dashboard')
        },
        {
            id: 'nav-redact',
            title: 'Open Redaction Workspace',
            icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
            action: () => router.push('/redact')
        },
        {
            id: 'nav-settings',
            title: 'Manage System Settings',
            icon: <Settings2 className="w-4 h-4 text-[#FFA500]" />,
            action: () => router.push('/settings')
        },
        {
            id: 'action-wipe',
            title: 'Secure Wipe Workspace',
            icon: <Trash2 className="w-4 h-4 text-red-400" />,
            action: () => {
                useDocumentStore.getState().clearWorkspace();
                useUiStore.getState().addToast('Workspace memory wiped', 'success');
            }
        }
    ];

    const filteredCommands = commands.filter(cmd => 
        cmd.title.toLowerCase().includes(query.toLowerCase())
    );

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPalette(!isCommandPaletteOpen);
            }
            if (e.key === 'Escape') {
                setCommandPalette(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCommandPaletteOpen, setCommandPalette]);

    useEffect(() => {
        if (isCommandPaletteOpen) {
            setQuery("");
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isCommandPaletteOpen]);

    return (
        <AnimatePresence>
            {isCommandPaletteOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setCommandPalette(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed top-[15vh] left-1/2 -translate-x-1/2 w-full max-w-xl z-[100]"
                    >
                        <div className="bg-[#1A1A1A] border border-[#3B3B3B] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                            {/* Input Area */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3B3B3B] bg-[#212121]">
                                <Search className="w-5 h-5 text-gray-500 shrink-0" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search commands or jump to..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="flex-1 bg-transparent border-none text-white focus:outline-none focus:ring-0 placeholder:text-gray-500 placeholder:font-medium"
                                />
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <kbd className="px-2 py-1 bg-[#141414] border border-[#3B3B3B] rounded text-[10px] font-mono text-gray-400">ESC</kbd>
                                </div>
                            </div>

                            {/* Results */}
                            <div className="max-h-[300px] overflow-y-auto p-2">
                                {filteredCommands.length === 0 ? (
                                    <div className="p-8 text-center text-sm text-gray-500">
                                        No commands found for "{query}"
                                    </div>
                                ) : (
                                    filteredCommands.map((cmd) => (
                                        <button
                                            key={cmd.id}
                                            onClick={() => {
                                                cmd.action();
                                                setCommandPalette(false);
                                            }}
                                            className="w-full flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-[#FFA500]/10 hover:text-[#FFA500] text-gray-300 transition-colors group text-left cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-md bg-[#252525] border border-[#3B3B3B] flex items-center justify-center group-hover:bg-[#FFA500]/20 group-hover:border-[#FFA500]/30 transition-colors">
                                                    {cmd.icon}
                                                </div>
                                                <span className="font-medium">{cmd.title}</span>
                                            </div>
                                            <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#FFA500]" />
                                        </button>
                                    ))
                                )}
                            </div>
                            
                            <div className="bg-[#141414] px-4 py-2 border-t border-[#3B3B3B] flex items-center gap-2">
                                <Command className="w-3.5 h-3.5 text-gray-500" />
                                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Ciphera Command Matrix</span>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
