"use client";

/**
 * Batch Processor Page
 * Place at: v3/frontend/src/app/batch/page.tsx
 */

import React, { useState, useRef } from 'react';
import {
    UploadCloud, X, Play, Download, CheckCircle2,
    AlertCircle, Clock, Loader2, FileText, Trash2, Layers,
} from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { redactionEngine } from '@/lib/redactionEngine';
import { extractTextFromFile } from '@/lib/fileFormat';
import JSZip from 'jszip';

type JobStatus = 'queued' | 'processing' | 'done' | 'error';

interface BatchJob {
    id:       string;
    file:     File;
    status:   JobStatus;
    progress: number;
    result?:  string;
    error?:   string;
    entities: number;
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function BatchPage() {
    const { rules, customRules } = useDocumentStore();
    const { addAuditLog, incrementMetrics } = useSessionStore();

    const [jobs,       setJobs]       = useState<BatchJob[]>([]);
    const [isRunning,  setIsRunning]  = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const SUPPORTED = ['txt','csv','json','md','docx'];

    const addFiles = (files: FileList | File[]) => {
        const arr       = Array.from(files);
        const supported = arr.filter(f => SUPPORTED.includes(f.name.split('.').pop()?.toLowerCase() || ''));
        const skipped   = arr.length - supported.length;
        if (skipped > 0) useUiStore.getState().addToast(`${skipped} file(s) skipped — PDF/images not supported in batch mode`, 'warning');
        const newJobs: BatchJob[] = supported.map(file => ({
            id: `b_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            file, status: 'queued', progress: 0, entities: 0,
        }));
        setJobs(prev => [...prev, ...newJobs]);
    };

    const removeJob = (id: string) => {
        if (isRunning) return;
        setJobs(prev => prev.filter(j => j.id !== id));
    };

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
                if (result.failed) throw new Error('Backend unreachable — start the backend first');
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

                addAuditLog({
                    id: 'BATCH-' + Math.floor(Math.random() * 100000),
                    name: job.file.name,
                    size: (job.file.size / 1024).toFixed(1) + ' KB',
                    date: new Date().toLocaleString(),
                    status: 'Completed',
                    entitiesDiscovered: entityCount,
                    rulesApplied: Array.from(new Set(result.tokens.filter(t => t.type !== 'text').map(t => t.type))),
                });
                incrementMetrics(1, entityCount);

                setJobs(prev => prev.map(j =>
                    j.id === job.id ? { ...j, status: 'done', progress: 100, result: redacted, entities: entityCount } : j
                ));
            } catch (err: any) {
                setJobs(prev => prev.map(j =>
                    j.id === job.id ? { ...j, status: 'error', progress: 0, error: err.message } : j
                ));
            }
        }

        setIsRunning(false);
        useUiStore.getState().addToast('Batch complete', 'success');
    };

    const downloadAll = async () => {
        const done = jobs.filter(j => j.status === 'done' && j.result);
        if (!done.length) return;
        if (done.length === 1) {
            const job  = done[0];
            const base = job.file.name.replace(/\.[^.]+$/, '');
            triggerDownload(new Blob([job.result!], { type: 'text/plain' }), `${base}_Secure.txt`);
            return;
        }
        const zip = new JSZip();
        done.forEach(job => {
            const base = job.file.name.replace(/\.[^.]+$/, '');
            zip.file(`${base}_Secure.txt`, job.result!);
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(blob, `Ciphera_Batch_${new Date().toISOString().slice(0,10)}.zip`);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    };

    const queuedCount     = jobs.filter(j => j.status === 'queued').length;
    const processingCount = jobs.filter(j => j.status === 'processing').length;
    const doneCount       = jobs.filter(j => j.status === 'done').length;
    const errorCount      = jobs.filter(j => j.status === 'error').length;
    const totalEntities   = jobs.reduce((s, j) => s + j.entities, 0);

    const STATUS_ICON: Record<JobStatus, React.ReactNode> = {
        queued:     <Clock className="w-4 h-4 text-gray-500" />,
        processing: <Loader2 className="w-4 h-4 text-[#FFA500] animate-spin" />,
        done:       <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
        error:      <AlertCircle className="w-4 h-4 text-red-400" />,
    };
    const STATUS_COLOR: Record<JobStatus, string> = {
        queued: 'text-gray-500', processing: 'text-[#FFA500]', done: 'text-emerald-400', error: 'text-red-400',
    };
    const STATUS_LABEL: Record<JobStatus, string> = {
        queued: 'Queued', processing: 'Processing…', done: 'Secured', error: 'Failed',
    };

    return (
        <div className="w-full p-6 md:p-10 font-sans min-h-screen selection:bg-[#FFA500] selection:text-black">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2A2A2A]">
                    <div>
                        <h1 className="text-xl font-semibold text-white flex items-center gap-2.5">
                            <Layers className="w-5 h-5 text-[#FFA500]" />
                            Batch Processor
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Redact multiple documents at once using your current rule configuration</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {doneCount > 0 && (
                            <button onClick={downloadAll}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-medium transition-all cursor-pointer">
                                <Download className="w-4 h-4" />
                                {doneCount === 1 ? 'Download' : `Download All as ZIP`}
                            </button>
                        )}
                        <button onClick={runBatch} disabled={isRunning || queuedCount === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-[#FFA500] hover:bg-[#ffb733] text-black rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            {isRunning ? 'Processing…' : queuedCount > 0 ? `Run ${queuedCount} File${queuedCount > 1 ? 's' : ''}` : 'Run Batch'}
                        </button>
                    </div>
                </header>

                {/* Stats — only show when there are jobs */}
                {jobs.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { label: 'Total',      value: jobs.length,     color: 'text-white' },
                            { label: 'Queued',     value: queuedCount,     color: 'text-gray-400' },
                            { label: 'Processing', value: processingCount, color: 'text-[#FFA500]' },
                            { label: 'Secured',    value: doneCount,       color: 'text-emerald-400' },
                            { label: 'Entities',   value: totalEntities,   color: 'text-blue-400' },
                        ].map(s => (
                            <div key={s.label} className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-3">
                                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">{s.label}</p>
                                <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Drop zone */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${isDragging ? 'border-[#FFA500] bg-[#FFA500]/5' : 'border-[#2A2A2A] hover:border-[#FFA500]/40 bg-[#141414] hover:bg-[#181818]'}`}
                >
                    <input ref={fileInputRef} type="file" multiple className="hidden"
                        accept=".txt,.csv,.json,.md,.docx"
                        onChange={e => { if (e.target.files?.length) addFiles(e.target.files); }} />
                    <UploadCloud className={`w-10 h-10 mb-3 transition-colors ${isDragging ? 'text-[#FFA500]' : 'text-gray-600'}`} />
                    <p className="text-white font-medium mb-1">Drop files here or click to browse</p>
                    <p className="text-sm text-gray-500 mb-3">You can add multiple files at once — they'll join the queue</p>
                    <div className="flex gap-2 text-[10px] font-mono text-gray-600">
                        {['TXT','CSV','JSON','MD','DOCX'].map(ext => (
                            <span key={ext} className="bg-[#1E1E1E] border border-[#2A2A2A] px-2 py-1 rounded">.{ext}</span>
                        ))}
                    </div>
                    <p className="text-[11px] text-gray-700 mt-3">PDF and image files require the Redact page — use that for visual redaction</p>
                </div>

                {/* Job queue */}
                {jobs.length > 0 && (
                    <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2A2A2A] bg-[#1A1A1A]">
                            <p className="text-sm font-semibold text-white">{jobs.length} file{jobs.length > 1 ? 's' : ''}</p>
                            <div className="flex items-center gap-3">
                                {doneCount > 0 && (
                                    <button onClick={clearDone} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer transition-colors">
                                        Clear completed
                                    </button>
                                )}
                                <button onClick={clearAll} disabled={isRunning}
                                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-30">
                                    <Trash2 className="w-3.5 h-3.5" /> Clear All
                                </button>
                            </div>
                        </div>

                        <div className="divide-y divide-[#2A2A2A]/60">
                            {jobs.map(job => (
                                <div key={job.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#181818] transition-colors group">
                                    <div className="shrink-0">{STATUS_ICON[job.status]}</div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <FileText className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                            <p className="text-sm text-white font-medium truncate">{job.file.name}</p>
                                            <span className="text-[10px] text-gray-600 font-mono shrink-0">
                                                {(job.file.size / 1024).toFixed(1)} KB
                                            </span>
                                        </div>

                                        {job.status === 'processing' && (
                                            <div className="h-1 bg-[#2A2A2A] rounded-full overflow-hidden mt-1.5">
                                                <div className="h-full bg-[#FFA500] rounded-full transition-all duration-500"
                                                    style={{ width: `${job.progress}%` }} />
                                            </div>
                                        )}
                                        {job.status === 'done' && (
                                            <p className="text-[11px] text-emerald-400 font-mono">
                                                {job.entities} entities redacted
                                            </p>
                                        )}
                                        {job.status === 'error' && (
                                            <p className="text-[11px] text-red-400">{job.error}</p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`text-[11px] font-medium ${STATUS_COLOR[job.status]}`}>
                                            {STATUS_LABEL[job.status]}
                                        </span>
                                        {job.status === 'done' && job.result && (
                                            <button
                                                onClick={() => {
                                                    const base = job.file.name.replace(/\.[^.]+$/, '');
                                                    triggerDownload(new Blob([job.result!], { type: 'text/plain' }), `${base}_Secure.txt`);
                                                }}
                                                className="p-1.5 text-gray-500 hover:text-white hover:bg-[#2A2A2A] rounded-lg transition-colors cursor-pointer"
                                                title="Download this file">
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {job.status !== 'processing' && (
                                            <button onClick={() => removeJob(job.id)}
                                                className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-[#2A2A2A] rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                                                title="Remove">
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
                    <div className="text-center py-6 space-y-1">
                        <p className="text-sm text-gray-600">No files in queue.</p>
                        <p className="text-xs text-gray-700">Your active rule configuration from the Redact page will be applied to all files.</p>
                    </div>
                )}
            </div>
        </div>
    );
}