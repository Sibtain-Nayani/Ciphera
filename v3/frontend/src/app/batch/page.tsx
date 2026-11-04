"use client";

import React, { useState, useRef } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { useUiStore } from '@/store/uiStore';
import { PageLoader } from '@/components/layout/PageLoader';

type JobStatus = 'queued' | 'error';

interface BatchJob {
    id:       string;
    file:     File;
    status:   JobStatus;
    error?:   string;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BatchPage() {
    const { isGuest } = useAuth();
    const [jobs,         setJobs]         = useState<BatchJob[]>([]);
    const [isDragging,   setIsDragging]   = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Add files ─────────────────────────────────────────────────────────────
    const addFiles = (files: FileList | File[]) => {
        const arr       = Array.from(files);
        const supported = arr.filter(f => ['txt','csv','json','md','docx'].includes(
            f.name.split('.').pop()?.toLowerCase() || ''
        ));
        const skipped = arr.length - supported.length;
        if (skipped > 0)
            useUiStore.getState().addToast(
                `${skipped} file(s) skipped — PDF & images require the Redact page`, 'warning'
            );
        setJobs(prev => [
            ...prev,
            ...supported.map(file => ({
                id:       `b_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                file,
                status:   'queued' as JobStatus,
            })),
        ]);
    };

    const removeJob = (id: string) => {
        setJobs(prev => prev.filter(j => j.id !== id));
    };

    // ── Process a single file ─────────────────────────────────────────────────
    // Do not emit browser-generated artifacts that bypass server verification.
    const runBatch = async () => {
        if (isGuest) {
            useUiStore.getState().addToast("Create a free account to use batch processing.", "info");
            return;
        }
        const queued = jobs.filter(j => j.status === 'queued');
        if (!queued.length) return;
        const message = 'Verified batch export is temporarily unavailable. Use the Redact workspace to process each document through the verified job workflow.';
        setJobs(prev => prev.map(job => job.status === 'queued'
            ? { ...job, status: 'error', error: message }
            : job
        ));
        useUiStore.getState().addToast(message, 'warning');
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    };

    const queuedCount    = jobs.filter(j => j.status === 'queued').length;
    const errorCount = jobs.filter(j => j.status === 'error').length;

    return (
        <PageLoader page="batch">
        <div className="w-full p-6 md:p-10 min-h-screen selection:bg-[#F5C400] selection:text-black bg-[#0d0d0d]">
            <main className="max-w-5xl mx-auto space-y-10 pb-16">

                {/* ── HEADER (unchanged styles) ────────────────────────────── */}
                <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 animate-header-in border-b border-[rgba(239,239,239,0.07)]">
                    <div>
                        <div className="flex items-center gap-3 mb-3 w-fit animate-eyebrow-in" style={{ clipPath: 'inset(0 100% 0 0)' }}>
                            <div className="w-[24px] h-[2px] bg-[#B91C1C] shrink-0" />
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, letterSpacing: '0.24em', color: '#ff4d4d', textTransform: 'uppercase' }}>{'// BATCH'}</span>
                        </div>
                        <h1 className="text-[#EFEFEF] uppercase animate-title-in opacity-0 drop-shadow-md"
                            style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: 1, letterSpacing: '0.02em' }}>
                            BATCH PROCESSING
                        </h1>
                        <div className="animate-subline-in opacity-0" style={{ marginTop: '12px' }}>
                            <p style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.04em' }}>
                                Verified batch export is temporarily unavailable
                            </p>
                            <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: 'rgba(239,239,239,0.5)', marginTop: '6px' }}>
                                Use the Redact workspace to process documents through the verified job workflow
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-2 flex-wrap">
                        <button onClick={runBatch} disabled={queuedCount === 0}
                            style={{ background: '#F5C400', fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', color: '#080808', textTransform: 'uppercase', padding: '12px 24px', border: 'none' }}
                            className="flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#ffe166] hover:shadow-[0_0_15px_rgba(245,196,0,0.4)] group">
                            <><span className="inline-block transition-transform group-hover:scale-105">START BATCH</span> <span className="inline-block transition-transform group-hover:translate-x-1">→</span></>
                        </button>
                    </div>
                </header>

                {/* ── LIVE STATS BAR (new — only when jobs exist) ──────────── */}
                {jobs.length > 0 && (
                    <div className="bg-[#131315] border border-[rgba(239,239,239,0.07)] flex" style={{ padding: '14px 24px', gap: '32px', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Queued', value: queuedCount, color: 'rgba(239,239,239,0.5)' },
                            { label: 'Blocked', value: errorCount, color: '#ef4444' },
                        ].map(s => (
                            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.35)' }}>{s.label}</span>
                                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: '28px', lineHeight: 1, color: s.color }}>{s.value}</span>
                            </div>
                        ))}
                    </div>
                )}

                {isGuest && (
                    <div style={{ border: '1px solid rgba(245,196,0,0.2)', background: 'rgba(245,196,0,0.03)', padding: '40px', textAlign: 'center' }}>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,196,0,0.7)', marginBottom: '12px' }}>
                            [ BATCH PROCESSING · ACCOUNT REQUIRED ]
                        </div>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,239,239,0.35)', letterSpacing: '0.14em', marginBottom: '20px', lineHeight: 1.8 }}>
                            Batch export is temporarily disabled until verified backend jobs are supported.<br />
                            Single-file redaction is available on the Redact page.
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Link href="/register" style={{ background: '#F5C400', color: '#080808', fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, padding: '10px 20px', textDecoration: 'none', transition: 'all 0.15s' }}>
                                Create Free Account →
                            </Link>
                            <Link href="/redact" style={{ background: 'transparent', border: '1px solid rgba(239,239,239,0.15)', color: 'rgba(239,239,239,0.6)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', padding: '10px 20px', textDecoration: 'none', transition: 'all 0.15s' }}>
                                Go to Redact →
                            </Link>
                        </div>
                    </div>
                )}
                {!isGuest && (
                    <>
                {/* ── DROP ZONE (unchanged styles) ─────────────────────────── */}
                <div onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`group relative flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 overflow-hidden ${isDragging
                        ? 'border-[#F5C400] bg-[rgba(245,196,0,0.02)] shadow-[0_0_30px_rgba(245,196,0,0.1)]'
                        : 'border-[rgba(239,239,239,0.15)] bg-[#131315] hover:border-[#F5C400]'}`}
                    style={{ minHeight: '260px', borderStyle: 'solid', borderWidth: '1px', padding: '40px', gap: '16px' }}>
                    {!isDragging && <div className="absolute top-0 left-0 w-[150%] h-[1px] bg-gradient-to-r from-transparent via-[#F5C400] to-transparent opacity-0 group-hover:opacity-40 transition-opacity" style={{ animation: 'scanline-horizontal 3s linear infinite' }} />}
                    <input ref={fileInputRef} type="file" multiple className="hidden" accept=".txt,.csv,.json,.md,.docx"
                        onChange={e => { if (e.target.files?.length) addFiles(e.target.files); }} />
                    <div className="relative">
                        <div className="absolute inset-0 bg-[#F5C400] blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 rounded-full" />
                        <UploadCloud className="w-10 h-10 transition-transform duration-500 group-hover:-translate-y-2 group-hover:text-[#F5C400]" style={{ color: 'rgba(239,239,239,0.4)' }} />
                    </div>
                    <h2 className="text-[#EFEFEF] uppercase group-hover:text-[#F5C400] transition-colors"
                        style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: '24px', fontWeight: 900, margin: 0, letterSpacing: '0.05em' }}>
                        BATCH UPLOAD
                    </h2>
                    <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.6)', margin: 0 }}>
                        Drop files here or click to select · 3 concurrent
                    </p>
                    <div className="flex gap-[8px] justify-center flex-wrap mt-2">
                        {['.TXT','.CSV','.JSON','.MD','.DOCX'].map(ext => (
                            <span key={ext}
                                style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(239,239,239,0.6)', border: '1px solid rgba(239,239,239,0.2)', background: 'rgba(17,17,19,0.5)', padding: '4px 10px', textTransform: 'uppercase' }}
                                className="group-hover:border-[rgba(245,196,0,0.5)] group-hover:text-[#F5C400] transition-colors">
                                {ext}
                            </span>
                        ))}
                    </div>
                </div>

                {/* ── JOB LIST ─────────────────────────────────────────────── */}
                {jobs.length === 0 ? (
                    <div className="bg-[#131315] border border-[rgba(239,239,239,0.07)] flex flex-col items-center justify-center animate-card-in"
                        style={{ padding: '40px', gap: '12px' }}>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, color: 'rgba(239,239,239,0.4)', letterSpacing: '0.22em' }}>[ NO FILES QUEUED ]</div>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 400, color: 'rgba(239,239,239,0.3)', letterSpacing: '0.14em' }}>VERIFIED BATCH EXPORT IS TEMPORARILY DISABLED</div>
                        <div className="flex items-center gap-[10px] mt-[12px]">
                            {['REGEX','PRESIDIO','SPACY','ENSEMBLE'].map((stage, idx) => (
                                <React.Fragment key={stage}>
                                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, letterSpacing: '0.14em', color: 'rgba(239,239,239,0.5)', border: '1px solid rgba(239,239,239,0.15)', padding: '4px 12px', background: '#0d0d0d' }}>{stage}</span>
                                    {idx < 3 && <span style={{ color: 'rgba(245,196,0,0.5)', fontSize: '10px' }}>→</span>}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-[#131315] border border-[rgba(239,239,239,0.15)] shadow-lg">
                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.15)] flex justify-between items-center"
                            style={{ padding: '14px 24px' }}>
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, color: 'rgba(239,239,239,0.7)' }}>{`// QUEUE · [${jobs.length} FILES]`}</span>
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: 'rgba(239,239,239,0.5)' }}>
                                VERIFIED BACKEND FLOW REQUIRED
                            </span>
                        </div>

                        <div className="flex flex-col bg-transparent">
                            {jobs.map(job => (
                                <div key={job.id}
                                    className="hover:bg-[rgba(245,196,0,0.03)] transition-colors border-b border-[rgba(239,239,239,0.07)] last:border-b-0 animate-row-in group relative"
                                    style={{ padding: '16px 24px' }}>
                                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />

                                    {/* Top row: filename + size + status + actions */}
                                    <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto auto', gap: '16px', marginBottom: job.status === 'error' ? '8px' : '0' }}>
                                        <div className="flex items-center gap-3 pr-4 min-w-0">
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, color: '#EFEFEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                className="transition-colors group-hover:text-[#F5C400]">
                                                {job.file.name}
                                            </span>
                                            {job.status === 'error' && (
                                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap' }} title={job.error}>
                                                    ✗ ERROR
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: 'rgba(239,239,239,0.4)', whiteSpace: 'nowrap' }}>
                                            {(job.file.size / 1024).toFixed(1)} KB
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 justify-end">
                                            {job.status === 'queued' && (
                                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(239,239,239,0.4)', textTransform: 'uppercase' }}>QUEUED</span>
                                            )}
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => removeJob(job.id)}
                                                    className="p-1.5 text-[rgba(239,239,239,0.4)] hover:text-[#ff4d4d] bg-transparent border-none cursor-pointer transition-colors">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Error message */}
                                    {job.status === 'error' && job.error && (
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,68,68,0.7)', marginTop: '4px', letterSpacing: '0.08em' }}>
                                            {job.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                </>
                )}

            </main>

            <style jsx global>{`
                @keyframes pulse-border { 0%,100%{border-color:rgba(239,239,239,0.07)} 50%{border-color:rgba(239,239,239,0.2)} }
                @keyframes scanline-horizontal { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
                @keyframes eyebrow-in { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0% 0 0)} }
                @keyframes title-in { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
                @keyframes card-in { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
                @keyframes row-in { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
                @keyframes pulse-txt { 0%,100%{opacity:1} 50%{opacity:0.4} }
                .animate-eyebrow-in { animation: eyebrow-in 0.3s ease-out forwards; }
                .animate-title-in { animation: title-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay:150ms; }
                .animate-subline-in { animation: title-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay:250ms; }
                .animate-card-in { animation: card-in 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }
                .animate-row-in { animation: row-in 0.3s ease forwards; }
            `}</style>
        </div>
        </PageLoader>
    );
}
