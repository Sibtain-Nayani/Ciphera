"use client";

import React, { useState, useRef } from 'react';
import {
    UploadCloud, X, Play, Download, CheckCircle2,
    AlertCircle, Clock, Loader2, FileText, Trash2,
    Layers, Eye,
} from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { redactionEngine } from '@/lib/redactionEngine';
import { extractTextFromFile } from '@/lib/fileFormat';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { PageLoader } from '@/components/layout/PageLoader';

type JobStatus = 'queued' | 'processing' | 'done' | 'error';
type ExportFormat = 'txt' | 'pdf' | 'docx' | 'md' | 'csv';

interface BatchJob {
    id:       string;
    file:     File;
    status:   JobStatus;
    progress: number;
    result?:  string;
    error?:   string;
    entities: number;
}

const PreviewModal: React.FC<{ job: BatchJob; onClose: () => void }> = ({ job, onClose }) => {
    const textSharpness: React.CSSProperties = {
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
    };
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-3xl mx-4 bg-[#080808] border border-white/10 rounded-none shadow-2xl flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0 bg-[#0c0c0c]">
                    <div>
                        <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', ...textSharpness }} className="font-semibold text-white">{job.file.name}</h2>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', ...textSharpness }} className="text-emerald-400 mt-0.5">// {job.entities} PII signatures neutralized successfully</p>
                    </div>
                    <button onClick={onClose} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', fontWeight: 600 }}
                        className="px-2 py-1 border border-white/10 hover:border-[#F5C400] hover:text-[#F5C400] text-gray-400 rounded-none cursor-pointer transition-colors">
                        [CLOSE]
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 bg-[#030303]">
                    <pre className="font-mono text-[12px] leading-[1.8] text-gray-300 whitespace-pre-wrap break-words">{job.result}</pre>
                </div>
            </div>
        </div>
    );
};

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function buildBlob(text: string, format: ExportFormat): Promise<{ blob: Blob; ext: string }> {
    if (format === 'txt' || format === 'md' || format === 'csv') return { blob: new Blob([text], { type: 'text/plain' }), ext: format };
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

const STATUS_ICON: Record<JobStatus, React.ReactNode> = {
    queued:     <Clock className="w-4 h-4 text-gray-600" />,
    processing: <Loader2 className="w-4 h-4 text-[#F5C400] animate-spin" />,
    done:       <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error:      <AlertCircle className="w-4 h-4 text-red-400" />,
};
const STATUS_COLOR: Record<JobStatus, string> = {
    queued: 'text-gray-500', processing: 'text-[#F5C400]', done: 'text-emerald-400', error: 'text-red-400',
};
const STATUS_LABEL: Record<JobStatus, string> = {
    queued: 'QUEUED', processing: 'DE-IDENTIFYING…', done: 'DECLASSIFIED', error: 'FAILED',
};

export default function BatchPage() {
    const { rules, customRules } = useDocumentStore();
    const { addAuditLog, incrementMetrics } = useSessionStore();

    const [jobs,         setJobs]         = useState<BatchJob[]>([]);
    const [isRunning,    setIsRunning]    = useState(false);
    const [isDragging,   setIsDragging]   = useState(false);
    const [globalFormat, setGlobalFormat] = useState<ExportFormat>('txt');
    const [previewJob,   setPreviewJob]   = useState<BatchJob | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFiles = (files: FileList | File[]) => {
        const arr = Array.from(files);
        const supported = arr.filter(f => ['txt','csv','json','md','docx'].includes(f.name.split('.').pop()?.toLowerCase() || ''));
        const skipped = arr.length - supported.length;
        if (skipped > 0) useUiStore.getState().addToast(`${skipped} file(s) skipped — PDF & images require the visual sandbox portal`, 'warning');
        setJobs(prev => [...prev, ...supported.map(file => ({
            id: `b_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            file, status: 'queued' as JobStatus, progress: 0, entities: 0,
        }))]);
    };

    const removeJob = (id: string) => { if (!isRunning) setJobs(prev => prev.filter(j => j.id !== id)); };
    const clearDone = () => setJobs(prev => prev.filter(j => j.status === 'queued' || j.status === 'processing'));
    const clearAll  = () => { if (!isRunning) setJobs([]); };

    const runBatch = async () => {
        const queued = jobs.filter(j => j.status === 'queued');
        if (!queued.length || isRunning) return;
        setIsRunning(true);
        for (const job of queued) {
            setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing', progress: 15 } : j));
            try {
                const { text } = await extractTextFromFile(job.file);
                setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: 40 } : j));
                const result = await redactionEngine.tokenize(text, rules, customRules, 0.50, false, false);
                if (result.failed) throw new Error('Local core backend offline — uvicorn required');
                setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: 75 } : j));
                const redacted = result.tokens.map(t => {
                    if (t.type === 'text') return t.value;
                    const isBI   = t.type in rules;
                    const cr     = customRules.find(r => `custom_${r.id}` === t.type || r.id === t.type);
                    const active = isBI ? rules[t.type as RuleType]?.isActive : cr?.isActive;
                    if (!active) return t.value;
                    const action = isBI ? (rules[t.type as RuleType]?.action || 'replace') : (cr?.action || 'replace');
                    return redactionEngine.getRedactionReplacement(t.type, t.value, action, customRules);
                }).join('');
                const entityCount = result.tokens.filter(t => t.type !== 'text').length;
                addAuditLog({ id: 'BATCH-' + Math.floor(Math.random() * 100000), name: job.file.name, size: (job.file.size / 1024).toFixed(1) + ' KB', date: new Date().toLocaleString(), status: 'Completed', entitiesDiscovered: entityCount, rulesApplied: Array.from(new Set(result.tokens.filter(t => t.type !== 'text').map(t => t.type))) });
                incrementMetrics(1, entityCount);
                setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'done', progress: 100, result: redacted, entities: entityCount } : j));
            } catch (err: any) {
                setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', progress: 0, error: err.message } : j));
            }
        }
        setIsRunning(false);
        useUiStore.getState().addToast('Batch declassification complete', 'success');
    };

    const downloadOne = async (job: BatchJob) => {
        if (!job.result) return;
        const base = job.file.name.replace(/\.[^.]+$/, '');
        const { blob, ext } = await buildBlob(job.result, globalFormat);
        triggerDownload(blob, `${base}_Secure.${ext}`);
    };

    const downloadAll = async () => {
        const done = jobs.filter(j => j.status === 'done' && j.result);
        if (!done.length) return;
        if (done.length === 1) { await downloadOne(done[0]); return; }
        const zip = new JSZip();
        for (const job of done) {
            const base = job.file.name.replace(/\.[^.]+$/, '');
            const { blob, ext } = await buildBlob(job.result!, globalFormat);
            zip.file(`${base}_Secure.${ext}`, await blob.arrayBuffer());
        }
        triggerDownload(await zip.generateAsync({ type: 'blob' }), `Ciphera_Batch_${new Date().toISOString().slice(0,10)}.zip`);
    };

    const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };

    const queuedCount     = jobs.filter(j => j.status === 'queued').length;
    const processingCount = jobs.filter(j => j.status === 'processing').length;
    const doneCount       = jobs.filter(j => j.status === 'done').length;
    const totalEntities   = jobs.reduce((s, j) => s + j.entities, 0);

    const textSharpness: React.CSSProperties = {
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
    };

    return (
        <PageLoader page="batch">
        <div className="w-full p-6 md:p-10 min-h-screen selection:bg-[#F5C400] selection:text-black" style={{ background: 'transparent' }}>
            {previewJob && <PreviewModal job={previewJob} onClose={() => setPreviewJob(null)} />}
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-white/10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-[18px] h-[2px] bg-red-700 shrink-0" />
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase', ...textSharpness }}>
                                // BATCH PROCESSING ARRAY
                            </span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase', ...textSharpness }}>
                            <Layers className="w-5 h-5 text-[#818CF8]" />
                            Pipeline Assembly Line
                        </h1>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'rgba(239,239,239,0.38)', letterSpacing: '0.08em', marginTop: '4px', ...textSharpness }}>
                            MASS DECLASSIFICATION PIPELINE · ENFORCES CURRENT SANDBOX SECURE POLICIES LOCALLY
                        </p>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'rgba(239,239,239,0.22)', letterSpacing: '0.05em', marginTop: '4px', ...textSharpness }}>
                            * PDF & image pixel-level coordinate redaction requires the interactive declassification editor page
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {doneCount > 0 && (
                            <button onClick={downloadAll} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.05em', fontWeight: 700 }}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-none transition-all cursor-pointer">
                                <Download className="w-4 h-4" />DOWNLOAD ZIP
                            </button>
                        )}
                        <button onClick={runBatch} disabled={isRunning || queuedCount === 0}
                            style={{ background: '#F5C400', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.05em', fontWeight: 700 }}
                            className="flex items-center gap-2 px-4 py-2 text-black rounded-none transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110">
                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            {isRunning ? 'SECURING…' : queuedCount > 0 ? `RUN ${queuedCount} VOLUMES` : 'START ASSEMBLY'}
                        </button>
                    </div>
                </header>

                {/* Stats */}
                {jobs.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { label: 'Ingested',     value: jobs.length,     color: 'text-white' },
                            { label: 'Queued Buffers',value: queuedCount,     color: 'text-gray-500' },
                            { label: 'Active Arrays', value: processingCount, color: 'text-[#F5C400]' },
                            { label: 'Declassified',  value: doneCount,       color: 'text-emerald-400' },
                            { label: 'Neutralized',   value: totalEntities,   color: 'text-[#818CF8]' },
                        ].map(s => (
                            <div key={s.label} className="bg-[#080808] border border-white/5 rounded-none p-3">
                                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.12em', color: 'rgba(239,239,239,0.35)', ...textSharpness }} className="uppercase mb-1">{s.label}</p>
                                <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '28px', ...textSharpness }} className={`font-extrabold font-mono leading-none ${s.color}`}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Export format + dropzone */}
                <div className="space-y-4">
                    {/* Global format picker */}
                    <div className="flex items-center gap-3 bg-[#080808] border border-white/5 p-3 rounded-none">
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.05em', color: 'rgba(239,239,239,0.45)', ...textSharpness }} className="font-semibold shrink-0">EXPORT ENVELOPE FORMAT:</span>
                        <div className="flex gap-1.5 flex-wrap">
                            {FORMAT_OPTS.map(opt => (
                                <button key={opt.value} onClick={() => setGlobalFormat(opt.value)}
                                    style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px' }}
                                    className={`px-3 py-1 rounded-none font-semibold transition-all cursor-pointer border ${globalFormat === opt.value ? 'bg-[#F5C400]/15 text-[#F5C400] border-[#F5C400]/30' : 'text-gray-600 border-white/5 hover:text-gray-300 hover:border-white/10 bg-black/40'}`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Drop zone */}
                    <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative border border-dashed rounded-none p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-[#080808] ${isDragging ? 'border-[#F5C400]/40 bg-[#F5C400]/5' : 'border-white/10 hover:border-[#F5C400]/40'}`}>
                        <input ref={fileInputRef} type="file" multiple className="hidden" accept=".txt,.csv,.json,.md,.docx"
                            onChange={e => { if (e.target.files?.length) addFiles(e.target.files); }} />
                        <UploadCloud className={`w-10 h-10 mb-3 transition-colors ${isDragging ? 'text-[#F5C400]' : 'text-gray-600'}`} />
                        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '18px', ...textSharpness }} className="text-white font-bold uppercase tracking-wide mb-1">Bulk Ingestion Portal</p>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'rgba(239,239,239,0.38)', ...textSharpness }} className="mb-4">Drop local files here or click to mount buffers</p>
                        <div className="flex gap-2 text-[9px] font-mono text-gray-600">
                            {['TXT','CSV','JSON','MD','DOCX'].map(ext => (
                                <span key={ext} className="bg-black/50 border border-white/5 px-2.5 py-0.5 rounded-none font-semibold">.{ext}</span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Job list */}
                {jobs.length > 0 && (
                    <div className="bg-[#080808] border border-white/5 rounded-none overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#080808]">
                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#fff', ...textSharpness }} className="font-semibold">{jobs.length} WORK INVENTORY BUFFERS</p>
                            <div className="flex items-center gap-4">
                                {doneCount > 0 && <button onClick={clearDone} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px' }} className="text-gray-500 hover:text-[#F5C400] transition-colors cursor-pointer">// Clear Completed</button>}
                                <button onClick={clearAll} disabled={isRunning} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px' }} className="flex items-center gap-1.5 text-gray-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-30"><Trash2 className="w-3 h-3" /> // Clear All</button>
                            </div>
                        </div>

                        <div className="divide-y divide-white/5">
                            {jobs.map(job => (
                                <div key={job.id} className="flex items-center gap-3 px-5 py-4 hover:bg-white/[0.01] transition-colors group">
                                    <div className="shrink-0">{STATUS_ICON[job.status]}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', ...textSharpness }} className="text-white font-medium truncate">{job.file.name}</p>
                                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: 'rgba(239,239,239,0.25)' }} className="bg-black border border-white/5 px-1.5 py-0.5 rounded-none shrink-0">{(job.file.size / 1024).toFixed(1)} KB</span>
                                        </div>
                                        {job.status === 'processing' && (
                                            <div className="h-1 bg-white/5 rounded-none overflow-hidden mt-2">
                                                <div className="h-full bg-[#F5C400] rounded-none transition-all duration-500" style={{ width: `${job.progress}%` }} />
                                            </div>
                                        )}
                                        {job.status === 'done' && <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', ...textSharpness }} className="text-emerald-400 mt-1">// {job.entities} PII signatures neutralized</p>}
                                        {job.status === 'error' && <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', ...textSharpness }} className="text-red-400 mt-1">{job.error}</p>}
                                    </div>

                                    {/* Actions — right side */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', letterSpacing: '0.05em', ...textSharpness }} className={`font-bold whitespace-nowrap ${STATUS_COLOR[job.status]}`}>{STATUS_LABEL[job.status]}</span>

                                        {job.status === 'done' && job.result && (
                                            <>
                                                <button onClick={() => setPreviewJob(job)}
                                                    style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px' }}
                                                    className="flex items-center gap-1 px-2.5 py-1 text-gray-400 hover:text-white hover:bg-white/5 rounded-none transition-colors cursor-pointer border border-white/5 hover:border-white/15 whitespace-nowrap">
                                                    <Eye className="w-3 h-3" /> Preview
                                                </button>
                                                <button onClick={() => downloadOne(job)}
                                                    style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', fontWeight: 700 }}
                                                    className="flex items-center gap-1 px-2.5 py-1 text-[#F5C400] hover:text-black hover:bg-[#F5C400] rounded-none transition-all cursor-pointer border border-[#F5C400]/30 whitespace-nowrap">
                                                    <Download className="w-3 h-3" /> .{globalFormat.toUpperCase()}
                                                </button>
                                            </>
                                        )}
                                        {job.status !== 'processing' && (
                                            <button onClick={() => removeJob(job.id)}
                                                className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-white/5 rounded-none cursor-pointer opacity-0 group-hover:opacity-100 transition-all">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {jobs.length === 0 && (
                    <div className="text-center py-8 space-y-1" style={{ fontFamily: "'IBM Plex Mono', monospace", ...textSharpness }}>
                        <p className="text-xs text-gray-600 uppercase tracking-widest">[ Queue buffer is currently empty ]</p>
                        <p className="text-[10px] text-gray-700 uppercase tracking-wider">Your active sandboxed policies will enforce de-identification on ingestion.</p>
                    </div>
                )}
            </div>
        </div>
        </PageLoader>
    );
}