"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isDestructive?: boolean;
}

export function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
    isDestructive = true
}: ConfirmModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onCancel}
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                    />
                    <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="bg-[#131315] border border-[#2A2A2A] rounded-2xl p-6 max-w-sm w-full shadow-2xl pointer-events-auto relative overflow-hidden"
                        >
                            {/* Subtle background glow */}
                            <div className={`absolute -left-10 -top-10 w-32 h-32 blur-[40px] rounded-full opacity-20 pointer-events-none ${isDestructive ? 'bg-red-500' : 'bg-[#F5C400]'}`} />

                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div className={`p-2 rounded-xl ${isDestructive ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-[#F5C400]/10 text-[#F5C400] border border-[#F5C400]/20'}`}>
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <button
                                    onClick={onCancel}
                                    className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-[#2A2A2A] transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="relative z-10">
                                <h3 className="text-lg font-semibold text-white mb-2 tracking-wide" style={{ fontFamily: '"Barlow", sans-serif' }}>
                                    {title}
                                </h3>
                                <p className="text-sm text-gray-400 mb-6 leading-relaxed" style={{ fontFamily: '"SF Pro Display", sans-serif' }}>
                                    {message}
                                </p>
                            </div>

                            <div className="flex gap-3 relative z-10">
                                <button
                                    onClick={onCancel}
                                    className="flex-1 px-4 py-2 bg-[#1E1E1E] hover:bg-[#2A2A2A] border border-[#3B3B3B] text-white rounded-xl text-sm font-medium transition-colors"
                                    style={{ fontFamily: '"SF Pro Display", sans-serif' }}
                                >
                                    {cancelText}
                                </button>
                                <button
                                    onClick={() => {
                                        onConfirm();
                                    }}
                                    className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                                        isDestructive 
                                            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30' 
                                            : 'bg-[#F5C400] hover:bg-[#d4a900] text-black border border-[#F5C400]'
                                    }`}
                                    style={{ fontFamily: '"SF Pro Display", sans-serif' }}
                                >
                                    {confirmText}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
