"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, CheckCircle2, Clock, ShieldCheck, FileText, Activity, Lock, XCircle } from 'lucide-react';
import { useDocumentStore } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { extractTextFromFile } from '@/lib/fileFormat';
import { convertPdfToImages } from '@/lib/pdfRenderer';

export default function DashboardPage() {
    const [isDragging, setIsDragging] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const router = useRouter();
    
    const { rules, setRawText } = useDocumentStore();
    const { auditLogs, totalDocumentsSecured, totalEntitiesMasked } = useSessionStore();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const activeRulesCount = Object.values(rules).filter(r => r.isActive).length;

    // Determine the top threat type based on the audit logs
    const getTopThreat = () => {
        if (!auditLogs.length) return "N/A";
        const ruleCounts: Record<string, number> = {};
        auditLogs.forEach(log => {
            log.rulesApplied.forEach(r => {
                ruleCounts[r] = (ruleCounts[r] || 0) + 1;
            });
        });
        const sorted = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]);
        return sorted.length > 0 ? sorted[0][0].toUpperCase() : "None";
    };

    const topThreat = isMounted ? getTopThreat() : "N/A";
    const docsSecured = isMounted ? totalDocumentsSecured : 0;
    const entitiesMasked = isMounted ? totalEntitiesMasked : 0;
    const recentLogs = isMounted ? auditLogs : [];

    // --- Global File Upload & Routing ---
    const handleFileUploadGlobal = async (file: File) => {
        if (!file) return;

        const ext = file.name.split('.').pop()?.toLowerCase() || '';

        // Handle images -> Canvas Store
        if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            useDocumentStore.getState().setFileMetadata(file.name, 'image');
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) {
                    useCanvasStore.getState().setImageSrc(e.target.result as string);
                    router.push('/redact');
                }
            };
            reader.readAsDataURL(file);
            return;
        }

        // Handle PDFs -> Canvas Store
        if (ext === 'pdf') {
            useDocumentStore.getState().setFileMetadata(file.name, 'pdf');
            try {
                const images = await convertPdfToImages(file);
                if (images.length > 0) {
                    useCanvasStore.getState().setImageSrc(images[0]);
                    router.push('/redact');
                }
            } catch (error) {
                console.error("PDF Parsing Error:", error);
                useUiStore.getState().addToast("Failed to render PDF document.", 'error');
            }
            return;
        }

        // Handle texts -> Document Store
        try {
            const { text, type, name } = await extractTextFromFile(file);
            setRawText(text);
            useDocumentStore.getState().setFileMetadata(name, type);
            // Redirect user to the workspace immediately after loading into the buffer
            router.push('/redact');
        } catch (error) {
            console.error("Error parsing document:", error);
            useUiStore.getState().addToast("This format is currently unsupported by the Ciphera engine.", 'error');
        }
    };

    return (
        <div className="w-full p-6 md:p-12 font-sans selection:bg-[#FFA500] selection:text-black min-h-screen">
            <main className="max-w-7xl mx-auto space-y-8 pb-16">

                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#3B3B3B]">
                    <div>
                        <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-3">
                            <Lock className="w-6 h-6 text-[#FFA500]" />
                            Ciphera Security Operations
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Enterprise Telemetry &amp; Anonymization Gateway</p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#1E1E1E] border border-[#3B3B3B] rounded-full shadow-inner">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10B981]"></div>
                        <span className="text-xs font-mono font-medium text-gray-300 tracking-wider">LOCAL INFERENCE LIVE</span>
                    </div>
                </header>

                {/* Row 1: The "Security Posture" Metrics */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#141414] border border-[#3B3B3B] rounded-2xl p-5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFA500]/5 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Docs Secured</p>
                            <FileText className="w-4 h-4 text-[#FFA500]" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-white font-mono">{docsSecured}</span>
                            <span className="text-xs text-emerald-400 font-medium">+100% session</span>
                        </div>
                    </div>
                    
                    <div className="bg-[#141414] border border-[#3B3B3B] rounded-2xl p-5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Entities Masked</p>
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight text-white font-mono">{entitiesMasked}</span>
                        </div>
                    </div>

                    <div className="bg-[#141414] border border-[#3B3B3B] rounded-2xl p-5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top Threat</p>
                            <Activity className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-xl font-bold tracking-tight text-white">{topThreat}</span>
                        </div>
                    </div>

                    <div className="bg-[#141414] border border-[#3B3B3B] rounded-2xl p-5 relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Rules</p>
                            <Lock className="w-4 h-4 text-purple-500" />
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-bold tracking-tight text-white font-mono">{isMounted ? activeRulesCount : 0}</span>
                            <span className="text-xs text-gray-400 font-medium">policies enforcing</span>
                        </div>
                    </div>
                </section>

                {/* Row 2: Graph & Dropzone */}
                <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Placeholder for the Graph (Middle Left) */}
                    <div className="lg:col-span-3 bg-[#1A1A1A] border border-[#3B3B3B] rounded-2xl p-6 flex flex-col justify-between min-h-[300px]">
                        <div>
                            <h3 className="text-base font-semibold text-white">Detection Trend Pipeline</h3>
                            <p className="text-xs text-gray-400 mb-6">Real-time PII interception volume over the current session.</p>
                        </div>
                        
                        {/* Fake Visual Graph for demo */}
                        <div className="flex-1 flex items-end gap-1 px-2 h-32 opacity-80">
                            {[12, 18, 5, 24, 15, 30, 22, 10, 40, 25, 18, 32, 28, 45, 30, 20, 15, 8, 20, 25, 35].map((h, i) => (
                                <div key={i} className="flex-1 bg-gradient-to-t from-[#FFA500]/20 to-[#FFA500]/80 rounded-t-sm transition-all hover:bg-[#FFA500]" style={{ height: `${h}%` }}></div>
                            ))}
                        </div>
                        <div className="flex justify-between mt-4 text-[10px] font-mono text-gray-500 border-t border-[#3B3B3B] pt-2">
                            <span>SESSION INITIATED</span>
                            <span>LIVE</span>
                        </div>
                    </div>

                    {/* Quick Action Dropzone (Middle Right) */}
                    <div className={`lg:col-span-2 relative group bg-[#181818] border-2 border-dashed rounded-2xl p-8 flex flex-col
                        items-center justify-center text-center transition-all duration-300 ease-out cursor-pointer ${isDragging
                            ? 'border-[#FFA500] bg-[#FFA500]/5' : 'border-[#3B3B3B] hover:border-[#FFA500]/70'}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                handleFileUploadGlobal(e.dataTransfer.files[0]);
                            }
                        }}
                    >
                        <input
                            type="file"
                            accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onChange={(e) => {
                                if (e.target.files?.length) handleFileUploadGlobal(e.target.files[0]);
                            }}
                        />
                        <div className="absolute inset-0 bg-[#FFA500] opacity-0 group-hover:opacity-5 blur-[50px] transition-opacity duration-500 pointer-events-none rounded-2xl"></div>

                        <div className={`p-4 rounded-xl mb-4 transition-all duration-300 ${isDragging
                            ? 'bg-[#FFA500] text-black scale-110 shadow-lg shadow-[#FFA500]/30' : 'bg-[#2A2A2A] text-[#FFA500] group-hover:scale-105'}`}>
                            <UploadCloud className="w-8 h-8" />
                        </div>

                        <h2 className="text-lg font-semibold text-white mb-2">Sanitize Local File</h2>
                        <p className="text-sm text-gray-400 max-w-[200px] mb-4">
                            Drag & drop or <span className="text-[#FFA500] group-hover:underline">browse</span>
                        </p>

                        <div className="flex flex-wrap justify-center gap-2 text-[10px] font-mono text-gray-500">
                            <span className="bg-[#212121] px-2 py-1 rounded">.PDF</span>
                            <span className="bg-[#212121] px-2 py-1 rounded">.TXT</span>
                            <span className="bg-[#212121] px-2 py-1 rounded">IMG</span>
                        </div>
                    </div>
                </section>

                {/* Row 3: The Audit Ledger */}
                <section className="bg-[#141414] border border-[#3B3B3B] rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-5 border-b border-[#3B3B3B] flex justify-between items-center bg-[#1A1A1A]">
                        <h3 className="text-base font-semibold text-white flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            Compliance Audit Trail
                        </h3>
                        <span className="text-xs font-mono text-gray-400 px-2 py-1 bg-[#252525] rounded-md">LIVE READ-ONLY</span>
                    </div>

                    <div className="overflow-x-auto min-h-[250px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[#3B3B3B] bg-[#1E1E1E] text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    <th className="p-4 pl-6 font-mono">Run ID</th>
                                    <th className="p-4 font-sans">Document Source</th>
                                    <th className="p-4 font-sans">Timestamp</th>
                                    <th className="p-4 font-sans text-center">Entities Blocked</th>
                                    <th className="p-4 pr-6 text-right font-sans">Protocol Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#3B3B3B]/50">
                                {recentLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-sm text-gray-500 italic">
                                            No anonymization jobs run in this session yet.
                                        </td>
                                    </tr>
                                ) : (
                                    recentLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-[#1A1A1A] transition-colors duration-200 group">
                                            <td className="p-4 pl-6 text-[13px] font-mono text-[#FFA500]">{log.id}</td>
                                            <td className="p-4 text-[13px] font-medium text-gray-200 flex items-center gap-2.5">
                                                <FileText className="w-4 h-4 text-gray-500" />
                                                <span className="truncate max-w-[200px]" title={log.name}>{log.name}</span>
                                                <span className="text-[10px] text-gray-500 font-mono bg-[#252525] px-1.5 py-0.5 rounded">{log.size}</span>
                                            </td>
                                            <td className="p-4 text-[13px] font-mono text-gray-400">{log.date}</td>
                                            <td className="p-4 text-[13px] text-center font-bold text-white">{log.entitiesDiscovered}</td>
                                            <td className="p-4 pr-6 text-right">
                                                {log.status === 'Completed' && (
                                                    <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> SECURED
                                                    </span>
                                                )}
                                                {log.status === 'Processing' && (
                                                    <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-[#FFA500]/10 text-[#FFA500] border border-[#FFA500]/20">
                                                        <Clock className="w-3.5 h-3.5 animate-spin-slow" /> PROCESSING
                                                    </span>
                                                )}
                                                {log.status === 'Failed' && (
                                                    <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-red-500/10 text-red-400 border border-red-500/20">
                                                        <XCircle className="w-3.5 h-3.5" /> FAILED
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

            </main>
        </div>
    );
}
