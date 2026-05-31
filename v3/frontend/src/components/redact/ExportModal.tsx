"use client";

import React, { useState, useEffect } from 'react';
import { X, FileDown, Layers, CheckSquare, Hash, AlertCircle } from 'lucide-react';

export type ExportPageSelection =
    | { mode: 'all' }
    | { mode: 'current'; page: number }
    | { mode: 'range'; pages: number[] };

interface ExportModalProps {
    isOpen:       boolean;
    totalPages:   number;
    currentPage:  number;
    onConfirm:    (selection: ExportPageSelection, format: string) => void;
    onCancel:     () => void;
    isExporting:  boolean;
}

/**
 * Parses a page range string like "1,3,5-7" into sorted unique page numbers.
 * Returns null if invalid.
 */
export function parsePageRange(input: string, totalPages: number): number[] | null {
    const parts = input.split(',').map(s => s.trim()).filter(Boolean);
    const pages = new Set<number>();

    for (const part of parts) {
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-');
            const start = parseInt(startStr, 10);
            const end   = parseInt(endStr, 10);
            if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) return null;
            for (let i = start; i <= end; i++) pages.add(i);
        } else {
            const n = parseInt(part, 10);
            if (isNaN(n) || n < 1 || n > totalPages) return null;
            pages.add(n);
        }
    }

    return pages.size > 0 ? Array.from(pages).sort((a, b) => a - b) : null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
    isOpen, totalPages, currentPage, onConfirm, onCancel, isExporting,
}) => {
    const [mode,       setMode]       = useState<'all' | 'current' | 'range'>('all');
    const [rangeInput, setRangeInput] = useState('');
    const [rangeError, setRangeError] = useState('');
    const [format,     setFormat]     = useState<'pdf' | 'png'>('pdf');

    // Reset when modal opens
    useEffect(() => {
        if (isOpen) {
            setMode(totalPages === 1 ? 'current' : 'all');
            setRangeInput('');
            setRangeError('');
            setFormat('pdf');
        }
    }, [isOpen, totalPages]);

    const validateRange = (val: string) => {
        setRangeInput(val);
        if (!val.trim()) { setRangeError(''); return; }
        const parsed = parsePageRange(val, totalPages);
        setRangeError(parsed ? '' : `Invalid range. Use format like "1,3,5-7" (max page: ${totalPages})`);
    };

    const handleConfirm = () => {
        let selection: ExportPageSelection;

        if (mode === 'all') {
            selection = { mode: 'all' };
        } else if (mode === 'current') {
            selection = { mode: 'current', page: currentPage };
        } else {
            const parsed = parsePageRange(rangeInput, totalPages);
            if (!parsed) { setRangeError('Fix the range before exporting.'); return; }
            selection = { mode: 'range', pages: parsed };
        }

        onConfirm(selection, format);
    };

    const getPageCount = () => {
        if (mode === 'all')     return totalPages;
        if (mode === 'current') return 1;
        const parsed = parsePageRange(rangeInput, totalPages);
        return parsed ? parsed.length : 0;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={onCancel} />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-[420px] bg-[#0d0d0d] border border-[#222] rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/5 flex flex-col">
                {/* Top decorative gradient */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FFA500]/50 to-transparent opacity-50" />

                {/* Header */}
                <div className="flex items-start justify-between px-6 py-5 border-b border-[#222] bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 rounded-xl bg-gradient-to-b from-[#FFA500]/20 to-[#FFA500]/5 border border-[#FFA500]/20 shadow-inner">
                            <FileDown className="w-5 h-5 text-[#FFA500]" />
                        </div>
                        <div>
                            <h2 className="text-[15px] font-medium text-gray-100 tracking-tight">Export Redacted Document</h2>
                            <p className="text-xs text-gray-500 mt-0.5">{totalPages} page{totalPages > 1 ? 's' : ''} total</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6">

                    {/* Page selection — only show for multi-page PDFs */}
                    {totalPages > 1 && (
                        <div>
                            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.1em] mb-3 block ml-1">
                                Pages to Redact &amp; Export
                            </label>

                            <div className="space-y-2.5">
                                {/* All pages */}
                                <label className={`flex items-center gap-4 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 group ${mode === 'all' ? 'border-[#FFA500]/40 bg-[#FFA500]/[0.08]' : 'border-[#222] hover:border-[#333] hover:bg-white/[0.02]'}`}>
                                    <div className="flex items-center justify-center relative w-5 h-5">
                                        <input type="radio" name="pageMode" value="all" checked={mode === 'all'} onChange={() => setMode('all')} className="absolute opacity-0 w-full h-full cursor-pointer" />
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${mode === 'all' ? 'border-[#FFA500]' : 'border-gray-600 group-hover:border-gray-400'}`}>
                                            {mode === 'all' && <div className="w-2 h-2 rounded-full bg-[#FFA500]" />}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className={`p-1.5 rounded-lg transition-colors ${mode === 'all' ? 'bg-[#FFA500]/10 text-[#FFA500]' : 'bg-[#222] text-gray-400'}`}>
                                            <Layers className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className={`text-sm font-medium transition-colors ${mode === 'all' ? 'text-white' : 'text-gray-300'}`}>All Pages</p>
                                            <p className="text-[11px] text-gray-500 mt-0.5">Export the entire document</p>
                                        </div>
                                    </div>
                                    {mode === 'all' && (
                                        <span className="text-[10px] font-mono font-medium text-[#FFA500] bg-[#FFA500]/10 border border-[#FFA500]/20 px-2 py-0.5 rounded-md shadow-sm">{totalPages} pages</span>
                                    )}
                                </label>

                                {/* Current page */}
                                <label className={`flex items-center gap-4 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 group ${mode === 'current' ? 'border-[#FFA500]/40 bg-[#FFA500]/[0.08]' : 'border-[#222] hover:border-[#333] hover:bg-white/[0.02]'}`}>
                                    <div className="flex items-center justify-center relative w-5 h-5">
                                        <input type="radio" name="pageMode" value="current" checked={mode === 'current'} onChange={() => setMode('current')} className="absolute opacity-0 w-full h-full cursor-pointer" />
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${mode === 'current' ? 'border-[#FFA500]' : 'border-gray-600 group-hover:border-gray-400'}`}>
                                            {mode === 'current' && <div className="w-2 h-2 rounded-full bg-[#FFA500]" />}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className={`p-1.5 rounded-lg transition-colors ${mode === 'current' ? 'bg-[#FFA500]/10 text-[#FFA500]' : 'bg-[#222] text-gray-400'}`}>
                                            <CheckSquare className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className={`text-sm font-medium transition-colors ${mode === 'current' ? 'text-white' : 'text-gray-300'}`}>Current Page Only</p>
                                            <p className="text-[11px] text-gray-500 mt-0.5">Export only page {currentPage}</p>
                                        </div>
                                    </div>
                                    {mode === 'current' && (
                                        <span className="text-[10px] font-mono font-medium text-[#FFA500] bg-[#FFA500]/10 border border-[#FFA500]/20 px-2 py-0.5 rounded-md shadow-sm">p.{currentPage}</span>
                                    )}
                                </label>

                                {/* Custom range */}
                                <div className={`flex flex-col gap-3 p-3.5 rounded-xl border transition-all duration-200 ${mode === 'range' ? 'border-[#FFA500]/40 bg-[#FFA500]/[0.08]' : 'border-[#222] hover:border-[#333] hover:bg-white/[0.02]'}`}>
                                    <label className="flex items-center gap-4 cursor-pointer group">
                                        <div className="flex items-center justify-center relative w-5 h-5">
                                            <input type="radio" name="pageMode" value="range" checked={mode === 'range'} onChange={() => setMode('range')} className="absolute opacity-0 w-full h-full cursor-pointer" />
                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${mode === 'range' ? 'border-[#FFA500]' : 'border-gray-600 group-hover:border-gray-400'}`}>
                                                {mode === 'range' && <div className="w-2 h-2 rounded-full bg-[#FFA500]" />}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 flex-1">
                                            <div className={`p-1.5 rounded-lg transition-colors ${mode === 'range' ? 'bg-[#FFA500]/10 text-[#FFA500]' : 'bg-[#222] text-gray-400'}`}>
                                                <Hash className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className={`text-sm font-medium transition-colors ${mode === 'range' ? 'text-white' : 'text-gray-300'}`}>Custom Range</p>
                                                <p className="text-[11px] text-gray-500 mt-0.5">e.g. 1,3,5-7</p>
                                            </div>
                                        </div>
                                        {mode === 'range' && getPageCount() > 0 && (
                                            <span className="text-[10px] font-mono font-medium text-[#FFA500] bg-[#FFA500]/10 border border-[#FFA500]/20 px-2 py-0.5 rounded-md shadow-sm">{getPageCount()} pages</span>
                                        )}
                                    </label>

                                    {mode === 'range' && (
                                        <div className="ml-[44px] mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                            <input
                                                type="text"
                                                value={rangeInput}
                                                onChange={e => validateRange(e.target.value)}
                                                placeholder={`e.g. 1-3,5,7 (1–${totalPages})`}
                                                className={`w-full px-3.5 py-2.5 bg-[#080808] border text-sm text-gray-100 font-mono rounded-xl placeholder:text-gray-600 transition-all focus:outline-none ${rangeError ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'border-[#333] focus:border-[#FFA500]/60 focus:ring-1 focus:ring-[#FFA500]/20 shadow-inner'}`}
                                                autoFocus
                                            />
                                            {rangeError && (
                                                <div className="flex items-center gap-1.5 mt-2">
                                                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                                    <p className="text-[11px] font-medium text-red-400/90">{rangeError}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Format selection */}
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.1em] mb-3 block ml-1">
                            Export Format
                        </label>
                        <div className="flex items-center p-1 bg-[#111] border border-[#222] rounded-xl shadow-inner">
                            {(['pdf', 'png'] as const).map(fmt => (
                                <button key={fmt} onClick={() => setFormat(fmt)}
                                    className={`flex-1 py-2 rounded-lg text-[13px] font-semibold uppercase tracking-wide transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${format === fmt ? 'bg-[#222] text-white shadow-sm ring-1 ring-white/10' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'}`}>
                                    .{fmt}
                                    {fmt === 'pdf' && format === 'pdf' && <span className="text-[9px] text-[#FFA500] font-medium ml-1 bg-[#FFA500]/10 px-1.5 py-0.5 rounded uppercase tracking-wider">Rec</span>}
                                </button>
                            ))}
                        </div>
                        {format === 'png' && mode === 'all' && totalPages > 1 && (
                            <div className="flex items-start gap-2 mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-400/90 font-medium leading-relaxed">
                                    PNG exports multiple pages as a ZIP archive containing individual images.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Summary */}
                    <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-white/[0.03] to-transparent border border-white/[0.05]">
                        <p className="text-xs text-gray-400 leading-relaxed">
                            Will export{' '}
                            <span className="text-white font-medium">
                                {mode === 'all' ? `all ${totalPages} pages` :
                                 mode === 'current' ? `page ${currentPage}` :
                                 getPageCount() > 0 ? `${getPageCount()} page${getPageCount() > 1 ? 's' : ''}` : '—'}
                            </span>
                            {' '}as a{' '}
                            <span className="text-[#FFA500] font-semibold">.{format.toUpperCase()}</span>
                            {' '}file with all redactions baked in.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 px-6 py-4 bg-[#111]/50 border-t border-[#222]">
                    <button onClick={onCancel} className="flex-1 py-2.5 bg-transparent hover:bg-white/5 border border-transparent hover:border-white/10 text-gray-400 hover:text-gray-200 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer">
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isExporting || (mode === 'range' && (!!rangeError || !rangeInput.trim()))}
                        className="flex-1 py-2.5 bg-[#FFA500] hover:bg-[#ffb733] text-black rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,165,0,0.15)] hover:shadow-[0_0_25px_rgba(255,165,0,0.25)]"
                    >
                        {isExporting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                <span>Exporting...</span>
                            </>
                        ) : (
                            <>
                                <FileDown className="w-4 h-4" />
                                <span>Export Document</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};