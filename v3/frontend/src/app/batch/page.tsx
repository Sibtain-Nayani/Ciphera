"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UploadCloud, X, Download, Eye, Archive } from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { redactionEngine } from '@/lib/redactionEngine';
import { extractTextFromFile } from '@/lib/fileFormat';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { PageLoader } from '@/components/layout/PageLoader';

type JobStatus   = 'queued' | 'processing' | 'done' | 'error';
type ExportFormat = 'txt' | 'pdf' | 'docx' | 'md' | 'csv';

interface BatchJob {
    id:       string;
    file:     File;
    status:   JobStatus;
    progress: number;      // 0–100
    result?:  string;
    error?:   string;
    entities: number;
    elapsedMs?: number;
}

// ── Preview modal (unchanged from original) ───────────────────────────────────
const PreviewModal: React.FC<{ job: BatchJob; onClose: () => void }> = ({ job, onClose }) => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-[#080808]/90 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-3xl mx-4 bg-[#131315] border border-[rgba(239,239,239,0.15)] shadow-2xl flex flex-col max-h-[85vh]">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C400] to-transparent opacity-50" />
            <div className="flex items-center justify-between px-6 py-5 border-b border-[rgba(239,239,239,0.07)] shrink-0 bg-[#0d0d0d]">
                <div>
                    <h2 style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', fontWeight: 600, color: '#EFEFEF' }}>{job.file.name}</h2>
                    <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, color: '#4ade80', marginTop: '4px' }}>// {job.entities} PII signatures neutralized</p>
                </div>
                <button onClick={onClose}
                    style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, color: 'rgba(239,239,239,0.7)', background: 'rgba(239,239,239,0.05)', border: '1px solid rgba(239,239,239,0.15)', padding: '6px 14px', cursor: 'pointer' }}
                    className="hover:border-[#F5C400] hover:text-[#F5C400] hover:bg-[rgba(245,196,0,0.05)] transition-all">[CLOSE]</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0b]">
                <pre className="font-mono text-[12px] leading-[1.8] text-[rgba(239,239,239,0.85)] whitespace-pre-wrap break-words selection:bg-[#F5C400] selection:text-black">{job.result}</pre>
            </div>
        </div>
    </div>
);

// ── File download helpers (unchanged) ─────────────────────────────────────────
function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function buildBlob(text: string, format: ExportFormat): Promise<{ blob: Blob; ext: string }> {
    if (format === 'txt' || format === 'md' || format === 'csv')
        return { blob: new Blob([text], { type: 'text/plain' }), ext: format };
    if (format === 'pdf') {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        pdf.setDocumentProperties({ title: 'Redacted Document', author: '', creator: 'Ciphera' });
        pdf.text(pdf.splitTextToSize(text, 532), 40, 40);
        return { blob: pdf.output('blob'), ext: 'pdf' };
    }
    if (format === 'docx') {
        const doc = new Document({ sections: [{ properties: {}, children: text.split('\n').map(line => new Paragraph({ children: [new TextRun(line)] })) }] });
        return { blob: await Packer.toBlob(doc), ext: 'docx' };
    }
    return { blob: new Blob([text], { type: 'text/plain' }), ext: 'txt' };
}

const FORMAT_OPTS: { value: ExportFormat; label: string }[] = [
    { value: 'txt',  label: '.TXT'  },
    { value: 'pdf',  label: '.PDF'  },
    { value: 'docx', label: '.DOCX' },
    { value: 'md',   label: '.MD'   },
    { value: 'csv',  label: '.CSV'  },
];

// ── Per-file progress bar ─────────────────────────────────────────────────────
function ProgressBar({ progress, status }: { progress: number; status: JobStatus }) {
    const color  = status === 'error' ? '#ef4444' : status === 'done' ? '#4ade80' : '#F5C400';
    const filled = Math.max(0, Math.min(100, progress));
    const blocks = 20;
    const filledBlocks = Math.round((filled / 100) * blocks);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color, letterSpacing: '0.02em' }}>
                [{'█'.repeat(filledBlocks)}{'░'.repeat(blocks - filledBlocks)}]
            </div>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,239,239,0.5)', letterSpacing: '0.1em', minWidth: '32px' }}>
                {filled}%
            </span>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BatchPage() {
    const { isGuest } = useAuth();
    const { rules, customRules }           = useDocumentStore();
    const { addAuditLog, incrementMetrics } = useSessionStore();

    const [jobs,         setJobs]         = useState<BatchJob[]>([]);
    const [isRunning,    setIsRunning]    = useState(false);
    const [isDragging,   setIsDragging]   = useState(false);
    const [globalFormat, setGlobalFormat] = useState<ExportFormat>('txt');
    const [previewJob,   setPreviewJob]   = useState<BatchJob | null>(null);
    const [isMounted,    setIsMounted]    = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setIsMounted(true); }, []);

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
                progress: 0,
                entities: 0,
            })),
        ]);
    };

    const removeJob = (id: string) => {
        if (!isRunning) setJobs(prev => prev.filter(j => j.id !== id));
    };

    // ── Process a single file ─────────────────────────────────────────────────
    const processFile = useCallback(async (job: BatchJob) => {
        const t0 = Date.now();

        const setProgress = (progress: number) =>
            setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress } : j));

        setJobs(prev => prev.map(j =>
            j.id === job.id ? { ...j, status: 'processing', progress: 10 } : j
        ));

        try {
            const { text } = await extractTextFromFile(job.file);
            setProgress(35);

            const result = await redactionEngine.tokenize(
                text, rules, customRules, 0.50, false, false
            );
            if (result.failed) throw new Error('Local core backend offline — uvicorn required');
            setProgress(70);

            const redacted = result.tokens.map(t => {
                if (t.type === 'text') return t.value;
                const isBI   = t.type in rules;
                const cr     = customRules.find(r => `custom_${r.id}` === t.type || r.id === t.type);
                const active = isBI ? rules[t.type as RuleType]?.isActive : cr?.isActive;
                if (!active) return t.value;
                const action = isBI
                    ? (rules[t.type as RuleType]?.action || 'replace')
                    : (cr?.action || 'replace');
                return redactionEngine.getRedactionReplacement(t.type, t.value, action, customRules);
            }).join('');

            const entityCount  = result.tokens.filter(t => t.type !== 'text').length;
            const rulesApplied = Array.from(new Set(result.tokens.filter(t => t.type !== 'text').map(t => t.type)));
            const elapsedMs    = Date.now() - t0;

            addAuditLog({
                id:                 'BATCH-' + Math.floor(Math.random() * 100000),
                name:               job.file.name,
                size:               (job.file.size / 1024).toFixed(1) + ' KB',
                date:               new Date().toLocaleString(),
                status:             'Completed',
                entitiesDiscovered: entityCount,
                rulesApplied,
            });
            incrementMetrics(1, entityCount);

            setJobs(prev => prev.map(j =>
                j.id === job.id
                    ? { ...j, status: 'done', progress: 100, result: redacted, entities: entityCount, elapsedMs }
                    : j
            ));
        } catch (err: any) {
            setJobs(prev => prev.map(j =>
                j.id === job.id ? { ...j, status: 'error', progress: 0, error: err.message } : j
            ));
        }
    }, [rules, customRules, addAuditLog, incrementMetrics]);

    // ── Run batch — parallel with concurrency = 3 ─────────────────────────────
    const runBatch = async () => {
        if (isGuest) {
            useUiStore.getState().addToast("Create a free account to use batch processing.", "info");
            return;
        }
        const queued = jobs.filter(j => j.status === 'queued');
        if (!queued.length || isRunning) return;
        setIsRunning(true);

        const CONCURRENCY = 3;
        for (let i = 0; i < queued.length; i += CONCURRENCY) {
            const chunk = queued.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(job => processFile(job)));
        }

        setIsRunning(false);
        useUiStore.getState().addToast('Batch declassification complete', 'success');
    };

    // ── Download one ──────────────────────────────────────────────────────────
    const downloadOne = async (job: BatchJob) => {
        if (!job.result) return;
        const base        = job.file.name.replace(/\.[^.]+$/, '');
        const { blob, ext } = await buildBlob(job.result, globalFormat);
        triggerDownload(blob, `${base}_Secure.${ext}`);
    };

    // ── Download all as ZIP ───────────────────────────────────────────────────
    const downloadAllZip = async () => {
        const completed = jobs.filter(j => j.status === 'done' && j.result);
        if (!completed.length) return;

        useUiStore.getState().addToast('Building ZIP…', 'info');
        const zip = new JSZip();

        await Promise.all(completed.map(async job => {
            const base        = job.file.name.replace(/\.[^.]+$/, '');
            const { blob, ext } = await buildBlob(job.result!, globalFormat);
            const arrayBuf    = await blob.arrayBuffer();
            zip.file(`${base}_Secure.${ext}`, arrayBuf);
        }));

        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        triggerDownload(zipBlob, `ciphera-batch-${Date.now()}.zip`);
        useUiStore.getState().addToast(`${completed.length} files zipped and downloaded.`, 'success');
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    };

    const queuedCount    = jobs.filter(j => j.status === 'queued').length;
    const completedCount = jobs.filter(j => j.status === 'done').length;
    const totalEntities  = jobs.filter(j => j.status === 'done').reduce((s, j) => s + j.entities, 0);

    return (
        <PageLoader page="batch">
        <div className="w-full p-6 md:p-10 min-h-screen selection:bg-[#F5C400] selection:text-black bg-[#0d0d0d]">
            {previewJob && <PreviewModal job={previewJob} onClose={() => setPreviewJob(null)} />}
            <main className="max-w-5xl mx-auto space-y-10 pb-16">

                {/* ── HEADER (unchanged styles) ────────────────────────────── */}
                <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 animate-header-in border-b border-[rgba(239,239,239,0.07)]">
                    <div>
                        <div className="flex items-center gap-3 mb-3 w-fit animate-eyebrow-in" style={{ clipPath: 'inset(0 100% 0 0)' }}>
                            <div className="w-[24px] h-[2px] bg-[#B91C1C] shrink-0" />
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, letterSpacing: '0.24em', color: '#ff4d4d', textTransform: 'uppercase' }}>// BATCH</span>
                        </div>
                        <h1 className="text-[#EFEFEF] uppercase animate-title-in opacity-0 drop-shadow-md"
                            style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: 1, letterSpacing: '0.02em' }}>
                            BATCH PROCESSING
                        </h1>
                        <div className="animate-subline-in opacity-0" style={{ marginTop: '12px' }}>
                            <p style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.04em' }}>
                                Process multiple documents — 3 files in parallel
                            </p>
                            <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: 'rgba(239,239,239,0.5)', marginTop: '6px' }}>
                                PDF & image redaction requires the Redact page
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-2 flex-wrap">
                        {/* ZIP download — shown when any files are done */}
                        {completedCount > 0 && (
                            <button onClick={downloadAllZip}
                                style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', color: '#EFEFEF', textTransform: 'uppercase', padding: '12px 20px', border: '1px solid rgba(239,239,239,0.15)', background: 'transparent' }}
                                className="flex items-center gap-2 transition-all cursor-pointer hover:border-[#F5C400] hover:text-[#F5C400] group">
                                <Archive className="w-3.5 h-3.5" />
                                DOWNLOAD ALL ({completedCount}) ZIP
                            </button>
                        )}
                        <button onClick={runBatch} disabled={isRunning || queuedCount === 0}
                            style={{ background: '#F5C400', fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', color: '#080808', textTransform: 'uppercase', padding: '12px 24px', border: 'none' }}
                            className="flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#ffe166] hover:shadow-[0_0_15px_rgba(245,196,0,0.4)] group">
                            {isRunning
                                ? 'PROCESSING…'
                                : <><span className="inline-block transition-transform group-hover:scale-105">START BATCH</span> <span className="inline-block transition-transform group-hover:translate-x-1">→</span></>
                            }
                        </button>
                    </div>
                </header>

                {/* ── LIVE STATS BAR (new — only when jobs exist) ──────────── */}
                {jobs.length > 0 && (
                    <div className="bg-[#131315] border border-[rgba(239,239,239,0.07)] flex" style={{ padding: '14px 24px', gap: '32px', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Queued',    value: queuedCount,                         color: 'rgba(239,239,239,0.5)' },
                            { label: 'Processing',value: jobs.filter(j=>j.status==='processing').length, color: '#F5C400' },
                            { label: 'Complete',  value: completedCount,                      color: '#4ade80' },
                            { label: 'Errors',    value: jobs.filter(j=>j.status==='error').length,   color: '#ef4444' },
                            { label: 'Entities removed', value: totalEntities,                color: '#F5C400' },
                        ].map(s => (
                            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.35)' }}>{s.label}</span>
                                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: '28px', lineHeight: 1, color: s.color }}>{s.value}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── EXPORT FORMAT STRIP (unchanged) ─────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-[#111113]"
                    style={{ border: '1px solid rgba(239,239,239,0.07)', padding: '16px 24px' }}>
                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(239,239,239,0.6)', textTransform: 'uppercase' }}>EXPORT FORMAT:</span>
                    <div className="flex gap-3 flex-wrap">
                        {FORMAT_OPTS.map(opt => (
                            <button key={opt.value} onClick={() => setGlobalFormat(opt.value)}
                                style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '6px 14px' }}
                                className={`transition-all cursor-pointer ${globalFormat === opt.value
                                    ? 'bg-[#F5C400] text-[#080808] border border-[#F5C400] shadow-[0_0_10px_rgba(245,196,0,0.2)]'
                                    : 'bg-[#0d0d0d] text-[rgba(239,239,239,0.6)] border border-[rgba(239,239,239,0.15)] hover:border-[rgba(239,239,239,0.4)] hover:text-[#EFEFEF]'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {isGuest && (
                    <div style={{ border: '1px solid rgba(245,196,0,0.2)', background: 'rgba(245,196,0,0.03)', padding: '40px', textAlign: 'center' }}>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,196,0,0.7)', marginBottom: '12px' }}>
                            [ BATCH PROCESSING · ACCOUNT REQUIRED ]
                        </div>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,239,239,0.35)', letterSpacing: '0.14em', marginBottom: '20px', lineHeight: 1.8 }}>
                            Batch processing requires an account.<br />
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
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 400, color: 'rgba(239,239,239,0.3)', letterSpacing: '0.14em' }}>ALL FILES PROCESSED THROUGH THE ACTIVE DETECTION PIPELINE · 3 CONCURRENT</div>
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
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, color: 'rgba(239,239,239,0.7)' }}>// QUEUE · [{jobs.length} FILES]</span>
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: 'rgba(239,239,239,0.5)' }}>
                                {isRunning ? `PROCESSING — 3 CONCURRENT` : 'AWAITING PROCESSING'}
                            </span>
                        </div>

                        <div className="flex flex-col bg-transparent">
                            {jobs.map((job, i) => (
                                <div key={job.id}
                                    className="hover:bg-[rgba(245,196,0,0.03)] transition-colors border-b border-[rgba(239,239,239,0.07)] last:border-b-0 animate-row-in group relative"
                                    style={{ padding: '16px 24px' }}>
                                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />

                                    {/* Top row: filename + size + status + actions */}
                                    <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto auto', gap: '16px', marginBottom: job.status === 'processing' || job.status === 'done' || job.status === 'error' ? '8px' : '0' }}>
                                        <div className="flex items-center gap-3 pr-4 min-w-0">
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, color: '#EFEFEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                className="transition-colors group-hover:text-[#F5C400]">
                                                {job.file.name}
                                            </span>
                                            {job.status === 'done' && (
                                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, letterSpacing: '0.12em', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', padding: '2px 8px', background: 'rgba(74,222,128,0.05)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                                    ✓ {job.entities} entities{job.elapsedMs ? ` · ${(job.elapsedMs / 1000).toFixed(1)}s` : ''}
                                                </span>
                                            )}
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
                                            {/* Status label when not done */}
                                            {job.status === 'queued' && (
                                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(239,239,239,0.4)', textTransform: 'uppercase' }}>QUEUED</span>
                                            )}
                                            {job.status === 'processing' && (
                                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.1em', color: '#F5C400', textTransform: 'uppercase', animation: 'pulse-txt 1.2s ease-in-out infinite' }}>PROCESSING</span>
                                            )}
                                            {/* Done actions */}
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {job.status === 'done' && job.result && (
                                                    <>
                                                        <button onClick={() => setPreviewJob(job)}
                                                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500 }}
                                                            className="px-3 py-1.5 bg-transparent text-[rgba(239,239,239,0.7)] border border-[rgba(239,239,239,0.2)] hover:border-[#F5C400] hover:text-[#F5C400] transition-colors cursor-pointer">
                                                            PREVIEW
                                                        </button>
                                                        <button onClick={() => downloadOne(job)}
                                                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600 }}
                                                            className="px-3 py-1.5 bg-[#F5C400] text-[#080808] border-none hover:bg-[#ffe166] hover:shadow-[0_0_10px_rgba(245,196,0,0.4)] transition-all cursor-pointer flex items-center gap-1">
                                                            <Download className="w-3.5 h-3.5" />DL
                                                        </button>
                                                    </>
                                                )}
                                                {job.status !== 'processing' && (
                                                    <button onClick={() => removeJob(job.id)}
                                                        className="p-1.5 text-[rgba(239,239,239,0.4)] hover:text-[#ff4d4d] bg-transparent border-none cursor-pointer transition-colors">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Per-file progress bar (new) */}
                                    {(job.status === 'processing' || job.status === 'done' || job.status === 'error') && (
                                        <ProgressBar progress={job.progress} status={job.status} />
                                    )}

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