"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Download, FileText, Settings2, Eye, EyeOff, Shield, ChevronLeft, UploadCloud, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { redactionEngine, Token } from '@/lib/redactionEngine';
import { AnimatedToken, PlainTextToken } from '@/components/redact/AnimatedToken';

export default function WorkspacePage() {
    const { rawText, setRawText, previewMode, rules, setPreviewMode, toggleRule } = useDocumentStore();
    const [tokens, setTokens] = useState<Token[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Dynamically tokenize the text whenever rules or raw text changes.
    useEffect(() => {
        const fetchAST = async () => {
            const result = await redactionEngine.tokenize(rawText, rules);
            setTokens(result);
        };
        fetchAST();
    }, [rawText, rules]);

    const activeRulesCount = Object.values(rules).filter(r => r.isActive).length;
    const totalMatches = tokens.filter(t => t.type !== 'text').length;

    // --- File Upload & Drag Logic ---
    const handleFileUpload = (file: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                setRawText(e.target.result as string);
            }
        };
        reader.readAsText(file);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    // --- Export Logic ---
    const exportSecureFile = () => {
        // Construct the final redacted string based on current active rules
        const redactedText = tokens.map(token => {
            if (token.type === 'text') return token.value;

            // Only redact if the rule is active, else return original
            const isRuleActive = rules[token.type as RuleType]?.isActive;
            if (!isRuleActive) return token.value;

            const action = rules[token.type as RuleType]?.action || 'replace';
            return redactionEngine.getRedactionReplacement(token.type as RuleType, token.value, action);
        }).join('');

        const blob = new Blob([redactedText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Workspace_Redacted.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- Shared Sidebar/Drawer Content ---
    const ConfigPanelContent = () => (
        <>
            {/* Header & Preview Toggle */}
            <div className="p-5 md:p-6 border-b border-[#3B3B3B] shrink-0">
                {/* Mobile Drawer Handle */}
                <div className="flex items-center justify-between md:justify-start gap-3">
                    <div className="flex items-center gap-3">
                        <Settings2 className="w-5 h-5 text-[#FFA500]" />
                        <h2 className="text-lg font-medium text-white">Redaction Workspace</h2>
                    </div>
                    {/* Close button — mobile only */}
                    <button
                        onClick={() => setIsDrawerOpen(false)}
                        className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-[#3B3B3B] rounded-lg transition-colors cursor-pointer"
                        aria-label="Close drawer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Rules List */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
                <div>
                    <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">Active Pattern Rules</h3>
                    <div className="space-y-3">

                        {[
                            { id: 'email', label: 'Email Addresses', desc: 'Matches standard RFC 5322 formats' },
                            { id: 'phone', label: 'Phone Numbers', desc: 'Matches international & local formats' },
                            { id: 'creditCard', label: 'Credit Cards', desc: 'Matches Visa, MC, Amex patterns' },
                            { id: 'ssn', label: 'Social Security (SSN)', desc: 'Matches XXX-XX-XXXX patterns' },
                            { id: 'names', label: 'Proper Names (NLP)', desc: 'Uses local NER model to find names' },
                        ].map((rule) => {
                            const isRuleActive = rules[rule.id as RuleType].isActive;

                            // Calculate dynamic matches on the fly from the current AST
                            const matchCount = tokens.filter(t => t.type === rule.id).length;

                            return (
                                <div
                                    key={rule.id}
                                    onClick={() => toggleRule(rule.id as RuleType)}
                                    className={`group flex items-start justify-between p-4 rounded-xl border transition-all duration-300 cursor-pointer select-none
                                    ${isRuleActive
                                            ? 'bg-[#FFA500]/5 border-[#FFA500]/30 hover:border-[#FFA500]/60'
                                            : 'bg-[#212121] border-[#3B3B3B] hover:border-gray-500'}`}
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-medium ${isRuleActive ? 'text-white' : 'text-gray-400'}`}>
                                                {rule.label}
                                            </span>
                                            {isRuleActive && matchCount > 0 && (
                                                <span className="px-2 py-0.5 rounded-full bg-[#FFA500]/20 text-[#FFA500] text-[10px] font-mono border border-[#FFA500]/30 transition-all">
                                                    {matchCount} MATCHES
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">{rule.desc}</p>
                                    </div>

                                    {/* Sleek Custom Switch */}
                                    <div className={`relative w-10 h-5 rounded-full transition-colors duration-300 mt-0.5 shrink-0 ${isRuleActive ? 'bg-[#FFA500]' : 'bg-[#3B3B3B]'}`}>
                                        <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform duration-300 ${isRuleActive ? 'translate-x-5 shadow-sm' : 'translate-x-0'}`}></div>
                                    </div>
                                </div>
                            )
                        })}

                    </div>
                </div>

                {/* Engine Info Box */}
                <div className="mt-8 p-4 rounded-xl border border-[#3B3B3B] bg-[#212121] flex items-start gap-3">
                    <EyeOff className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <h4 className="text-sm font-medium text-gray-300">
                            {activeRulesCount > 0 ? "Local Presidio Engine Active" : "Scanning Halted"}
                        </h4>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            {activeRulesCount > 0
                                ? "FastAPI Presidio local server is scanning raw inputs and feeding AST arrays to React."
                                : "Enable rules to begin local protocol data discovery and parsing."}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );

    return (
        <div className="w-full font-sans flex flex-col md:flex-row h-[calc(100vh-64px)] md:h-screen selection:bg-[#FFA500] selection:text-black relative">

            {/* LEFT PANE: Document Viewer */}
            <section className="w-full md:w-[60%] lg:w-[65%] flex flex-col border-r border-[#3B3B3B] h-full">

                {/* Toolbar */}
                <header className="flex items-center justify-between p-3 px-4 md:p-4 md:px-6 bg-[#1E1E1E] border-b border-[#3B3B3B] shrink-0">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-[#2A2A2A] cursor-pointer">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-[#FFA500]" />
                                <h1 className="text-sm font-medium text-white">Workspace.txt</h1>
                            </div>
                            <span className="text-xs font-mono text-gray-500 mt-0.5 hidden md:block">Live Editable Buffer</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                        {/* Hidden File Input */}
                        <input
                            type="file"
                            accept=".txt,.csv,.json"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={(e) => {
                                if (e.target.files?.length) handleFileUpload(e.target.files[0]);
                            }}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 text-gray-300 hover:text-white bg-[#2A2A2A] hover:bg-[#3B3B3B] px-3 py-2 md:px-4 rounded-md font-medium text-sm transition-all duration-200 cursor-pointer"
                        >
                            <UploadCloud className="w-4 h-4" />
                            <span className="hidden sm:inline">Load File</span>
                        </button>

                        <button
                            onClick={exportSecureFile}
                            className="flex items-center gap-2 bg-[#FFA500] hover:bg-[#ffb733] text-black px-3 py-2 md:px-4 rounded-md font-medium text-sm transition-all duration-200 shadow-[0_0_15px_rgba(255,165,0,0.2)] hover:shadow-[0_0_20px_rgba(255,165,0,0.4)] hover:-translate-y-0.5 cursor-pointer"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export Secure</span>
                        </button>
                    </div>
                </header>

                {/* Editor / Text Area */}
                <div
                    className={`flex-1 relative bg-[#212121] transition-colors duration-300 overflow-y-auto ${isDragging ? 'bg-[#2A2A2A]' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                >
                    {isDragging && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#FFA500]/10 backdrop-blur-sm border-2 border-[#FFA500] border-dashed">
                            <h2 className="text-xl font-medium text-[#FFA500] flex items-center gap-3">
                                <UploadCloud className="w-8 h-8 animate-bounce" />
                                Drop File to Parse
                            </h2>
                        </div>
                    )}

                    <div className="relative w-full max-w-3xl mx-auto min-h-full">
                        <div className="relative w-full p-4 md:p-10 pb-32 md:pb-24">
                            {/* The Render Layer (Highlights / Redactions) */}
                            {/* Provides the natural height of the document so the scrollbar works properly. */}
                            <div className="font-mono text-[14px] leading-[1.75] break-words whitespace-pre-wrap pointer-events-none w-full min-h-[500px]">
                                {tokens.map((token) => {
                                    if (token.type === 'text') {
                                        return <PlainTextToken key={token.id} token={token} isRedacted={previewMode === 'redacted'} />;
                                    }

                                    const isRedacted = previewMode === 'redacted';
                                    const action = rules[token.type as RuleType]?.action || 'replace';

                                    return (
                                        <AnimatedToken
                                            key={token.id}
                                            token={token}
                                            isRedacted={isRedacted}
                                            action={action}
                                        />
                                    );
                                })}
                                {/* Buffer for typing new lines */}
                                {'\n\n\n'}
                            </div>

                            {/* The Interactivity Layer (Only inputtable in 'original' mode) */}
                            {/* Absolutely positioned over the exact padding box of the parent to ensure 1:1 overlap */}
                            {previewMode === 'original' && (
                                <textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    className="absolute inset-4 md:inset-10 bottom-32 md:bottom-24 z-10 block bg-transparent text-gray-400 font-mono text-[14px] leading-[1.75] resize-none outline-none border-0 p-0 m-0 focus:ring-0 whitespace-pre-wrap break-words overflow-hidden"
                                    spellCheck="false"
                                    placeholder="Paste raw text here or drop a file..."
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Floating Preview Toggle Button (FAB) */}
                <button
                    onClick={() => setPreviewMode(previewMode === 'original' ? 'redacted' : 'original')}
                    className="absolute bottom-[4.5rem] md:bottom-8 right-4 md:right-8 z-30 flex items-center gap-2 bg-[#212121] hover:bg-[#2A2A2A] text-white px-5 py-3.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-[#3B3B3B] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer group"
                >
                    {previewMode === 'original' ? (
                        <>
                            <div className="relative">
                                <Shield className="w-5 h-5 text-[#FFA500] group-hover:scale-110 transition-transform" />
                            </div>
                            <span className="text-sm font-medium pr-1">Lock Document</span>
                        </>
                    ) : (
                        <>
                            <Eye className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                            <span className="text-sm font-medium pr-1">Edit Original</span>
                        </>
                    )}
                </button>
            </section>

            {/* ========================== */}
            {/* DESKTOP SIDEBAR (md+)      */}
            {/* ========================== */}
            <section className="hidden md:flex md:w-[40%] lg:w-[35%] flex-col h-full bg-[#1E1E1E]">
                <ConfigPanelContent />
            </section>

            {/* ===================================== */}
            {/* MOBILE BOTTOM DRAWER (< md)           */}
            {/* ===================================== */}

            {/* Drawer Handle / Tab - Always visible on mobile */}
            <button
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 py-3.5 bg-[#1E1E1E]/95 backdrop-blur-md border-t border-[#3B3B3B] cursor-pointer active:bg-[#2A2A2A] transition-colors"
                style={{ display: isDrawerOpen ? 'none' : undefined }}
                aria-label="Open redaction options"
            >
                <ChevronUp className="w-5 h-5 text-[#FFA500] animate-bounce" />
                <span className="text-sm font-medium text-white">
                    Redaction Options
                </span>
                {totalMatches > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#FFA500]/20 text-[#FFA500] text-[10px] font-mono border border-[#FFA500]/30">
                        {totalMatches} found
                    </span>
                )}
            </button>

            {/* Backdrop overlay */}
            {isDrawerOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    onClick={() => setIsDrawerOpen(false)}
                />
            )}

            {/* The Drawer Panel itself */}
            <div
                className={`md:hidden fixed left-0 right-0 bottom-0 z-50 bg-[#1E1E1E] border-t border-[#3B3B3B] rounded-t-2xl flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
                style={{ maxHeight: '85vh' }}
            >
                {/* Drag indicator pill */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-[#3B3B3B]" />
                </div>
                <ConfigPanelContent />
            </div>

        </div>
    );
}
