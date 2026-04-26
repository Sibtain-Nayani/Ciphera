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
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-md mx-4 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[#FFA500]/10 border border-[#FFA500]/20">
                            <FileDown className="w-4 h-4 text-[#FFA500]" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-white">Export Redacted Document</h2>
                            <p className="text-[11px] text-gray-500 mt-0.5">{totalPages} page{totalPages > 1 ? 's' : ''} total</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-1.5 text-gray-500 hover:text-white hover:bg-[#2A2A2A] rounded-lg transition-colors cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-5">

                    {/* Page selection — only show for multi-page PDFs */}
                    {totalPages > 1 && (
                        <div>
                            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 block">
                                Pages to Redact &amp; Export
                            </label>

                            <div className="space-y-2">
                                {/* All pages */}
                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${mode === 'all' ? 'border-[#FFA500]/40 bg-[#FFA500]/5' : 'border-[#2A2A2A] hover:border-[#3A3A3A]'}`}>
                                    <input type="radio" name="pageMode" value="all" checked={mode === 'all'} onChange={() => setMode('all')} className="accent-[#FFA500]" />
                                    <div className="flex items-center gap-2 flex-1">
                                        <Layers className="w-4 h-4 text-[#FFA500]" />
                                        <div>
                                            <p className="text-sm font-medium text-white">All Pages</p>
                                            <p className="text-[11px] text-gray-500">Export all {totalPages} pages as one PDF</p>
                                        </div>
                                    </div>
                                    {mode === 'all' && (
                                        <span className="text-[10px] font-mono text-[#FFA500] bg-[#FFA500]/10 px-2 py-0.5 rounded-full">{totalPages} pages</span>
                                    )}
                                </label>

                                {/* Current page */}
                                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${mode === 'current' ? 'border-[#FFA500]/40 bg-[#FFA500]/5' : 'border-[#2A2A2A] hover:border-[#3A3A3A]'}`}>
                                    <input type="radio" name="pageMode" value="current" checked={mode === 'current'} onChange={() => setMode('current')} className="accent-[#FFA500]" />
                                    <div className="flex items-center gap-2 flex-1">
                                        <CheckSquare className="w-4 h-4 text-blue-400" />
                                        <div>
                                            <p className="text-sm font-medium text-white">Current Page Only</p>
                                            <p className="text-[11px] text-gray-500">Export only page {currentPage}</p>
                                        </div>
                                    </div>
                                    {mode === 'current' && (
                                        <span className="text-[10px] font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">p.{currentPage}</span>
                                    )}
                                </label>

                                {/* Custom range */}
                                <label className={`flex flex-col gap-2 p-3 rounded-xl border cursor-pointer transition-all ${mode === 'range' ? 'border-[#FFA500]/40 bg-[#FFA500]/5' : 'border-[#2A2A2A] hover:border-[#3A3A3A]'}`}>
                                    <div className="flex items-center gap-3">
                                        <input type="radio" name="pageMode" value="range" checked={mode === 'range'} onChange={() => setMode('range')} className="accent-[#FFA500]" />
                                        <div className="flex items-center gap-2 flex-1">
                                            <Hash className="w-4 h-4 text-purple-400" />
                                            <div>
                                                <p className="text-sm font-medium text-white">Custom Range</p>
                                                <p className="text-[11px] text-gray-500">e.g. 1,3,5-7</p>
                                            </div>
                                        </div>
                                        {mode === 'range' && getPageCount() > 0 && (
                                            <span className="text-[10px] font-mono text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">{getPageCount()} pages</span>
                                        )}
                                    </div>

                                    {mode === 'range' && (
                                        <div className="ml-6 mt-1">
                                            <input
                                                type="text"
                                                value={rangeInput}
                                                onChange={e => validateRange(e.target.value)}
                                                placeholder={`e.g. 1-3,5,7 (1–${totalPages})`}
                                                className="w-full px-3 py-2 bg-[#111] border border-[#3A3A3A] text-sm text-white font-mono rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none transition-colors"
                                                autoFocus
                                            />
                                            {rangeError && (
                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                    <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                                                    <p className="text-[10px] text-red-400">{rangeError}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Format selection */}
                    <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 block">
                            Export Format
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['pdf', 'png'] as const).map(fmt => (
                                <button key={fmt} onClick={() => setFormat(fmt)}
                                    className={`py-2.5 rounded-xl border text-sm font-mono font-semibold uppercase transition-all cursor-pointer ${format === fmt ? 'border-[#FFA500]/50 bg-[#FFA500]/10 text-[#FFA500]' : 'border-[#2A2A2A] text-gray-500 hover:border-[#3A3A3A] hover:text-gray-300'}`}>
                                    .{fmt}
                                    {fmt === 'pdf' && <span className="ml-1 text-[9px] opacity-60">recommended</span>}
                                </button>
                            ))}
                        </div>
                        {format === 'png' && mode === 'all' && totalPages > 1 && (
                            <p className="text-[10px] text-amber-400 mt-2 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                PNG exports pages as a ZIP archive with one image per page.
                            </p>
                        )}
                    </div>

                    {/* Summary */}
                    <div className="px-3 py-2.5 rounded-xl bg-[#111] border border-[#2A2A2A]">
                        <p className="text-[11px] text-gray-500 font-mono">
                            Will export{' '}
                            <span className="text-white font-semibold">
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
                <div className="flex items-center gap-3 px-5 py-4 border-t border-[#2A2A2A]">
                    <button onClick={onCancel} className="flex-1 py-2.5 border border-[#2A2A2A] text-gray-400 hover:text-white hover:bg-[#2A2A2A] rounded-xl text-sm font-medium transition-all cursor-pointer">
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isExporting || (mode === 'range' && (!!rangeError || !rangeInput.trim()))}
                        className="flex-1 py-2.5 bg-[#FFA500] hover:bg-[#ffb733] text-black rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isExporting ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                Exporting…
                            </>
                        ) : (
                            <>
                                <FileDown className="w-4 h-4" />
                                Export
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};