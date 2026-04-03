"use client";

import { useUiStore, ToastType } from "@/store/uiStore";
import { CheckCircle2, AlertTriangle, Info, ShieldAlert, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const iconMap: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    error: <ShieldAlert className="w-5 h-5 text-red-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-[#FFA500]" />,
    info: <Info className="w-5 h-5 text-blue-400" />
};

const borderMap: Record<ToastType, string> = {
    success: 'border-emerald-500/30',
    error: 'border-red-500/30',
    warning: 'border-[#FFA500]/30',
    info: 'border-blue-500/30'
};

const glowMap: Record<ToastType, string> = {
    success: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    error: 'shadow-[0_0_15px_rgba(239,68,68,0.15)]',
    warning: 'shadow-[0_0_15px_rgba(255,165,0,0.15)]',
    info: 'shadow-[0_0_15px_rgba(59,130,246,0.15)]'
};

export function Toaster() {
    const { toasts, removeToast } = useUiStore();

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className={`pointer-events-auto bg-[#1E1E1E] border ${borderMap[toast.type]} ${glowMap[toast.type]} 
                            rounded-xl p-4 min-w-[300px] max-w-sm flex items-start gap-3 backdrop-blur-xl shadow-2xl relative overflow-hidden`}
                    >
                        {/* Background subtle glow */}
                        <div className={`absolute -left-10 -top-10 w-24 h-24 blur-3xl rounded-full opacity-20 pointer-events-none
                            ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-red-500' : toast.type === 'warning' ? 'bg-[#FFA500]' : 'bg-blue-500'}
                        `} />
                        
                        <div className="shrink-0 mt-0.5 relative z-10">{iconMap[toast.type]}</div>
                        <div className="flex-1 relative z-10">
                            <p className="text-sm font-medium text-white shadow-sm">{toast.message}</p>
                        </div>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="shrink-0 p-1 -mr-2 -mt-1 text-gray-400 hover:text-white rounded-md hover:bg-[#3B3B3B] transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
