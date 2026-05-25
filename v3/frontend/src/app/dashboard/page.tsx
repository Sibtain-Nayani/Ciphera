"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    UploadCloud, CheckCircle2, Clock, ShieldCheck, FileText,
    Activity, Lock, XCircle, BarChart3, PieChart, FileDown, ChevronDown,
} from 'lucide-react';
import { useDocumentStore } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { extractTextFromFile } from '@/lib/fileFormat';
import { convertPdfToImages } from '@/lib/pdfRenderer';
import { exportAuditPDF, exportAuditCSV } from '@/lib/complianceReport';
import { PageLoader } from '@/components/layout/PageLoader';

const ENTITY_COLORS: Record<string, string> = {
    email: '#60A5FA', phone: '#34D399', creditCard: '#F59E0B', ssn: '#F472B6',
    names: '#3B82F6', dob: '#F87171', date: '#94A3B8', url: '#06B6D4', ip: '#A78BFA',
    aadhaar: '#F97316', pan: '#EAB308', gst: '#2DD4BF', ifsc: '#38BDF8',
    voterId: '#EC4899', passport: '#818CF8', vehicleReg: '#FB7185',
    'Visual Extractor': '#FFA500',
};

const ENTITY_LABELS: Record<string, string> = {
    email: 'Email', phone: 'Phone', creditCard: 'Credit Card', ssn: 'SSN',
    names: 'Names', dob: 'Date of Birth', date: 'Dates', url: 'URLs', ip: 'IP Address',
    aadhaar: 'Aadhaar', pan: 'PAN', gst: 'GST', ifsc: 'IFSC',
    voterId: 'Voter ID', passport: 'Passport', vehicleReg: 'Vehicle Reg',
    'Visual Extractor': 'Visual',
};

export default function DashboardPage() {
    const [isDragging, setIsDragging] = useState(false);
    const [isMounted,  setIsMounted]  = useState(false);
    const router = useRouter();

    const { rules, setRawText } = useDocumentStore();
    const { auditLogs, totalDocumentsSecured, totalEntitiesMasked } = useSessionStore();

    useEffect(() => { setIsMounted(true); }, []);

    const activeRulesCount = Object.values(rules).filter(r => r.isActive).length;

    // ── Real stats from audit logs ────────────────────────────────────────────
    const stats = useMemo(() => {
        if (!isMounted || !auditLogs.length) return {
            topThreat: 'N/A', entityBreakdown: [], dailyVolume: [], successRate: 0,
        };

        // Entity type breakdown
        const typeCounts: Record<string, number> = {};
        auditLogs.forEach(log => {
            log.rulesApplied.forEach(r => {
                typeCounts[r] = (typeCounts[r] || 0) + 1;
            });
        });
        const entityBreakdown = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([type, count]) => ({ type, count, color: ENTITY_COLORS[type] || '#6B7280', label: ENTITY_LABELS[type] || type }));

        const topThreat = entityBreakdown[0]?.label ?? 'N/A';

        // Daily volume — last 7 days from audit log dates
        const dayMap: Record<string, number> = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now); d.setDate(d.getDate() - i);
            dayMap[d.toLocaleDateString('en-US', { weekday: 'short' })] = 0;
        }
        auditLogs.forEach(log => {
            try {
                const d = new Date(log.date);
                const key = d.toLocaleDateString('en-US', { weekday: 'short' });
                if (key in dayMap) dayMap[key] = (dayMap[key] || 0) + log.entitiesDiscovered;
            } catch {}
        });
        const dailyVolume = Object.entries(dayMap).map(([day, count]) => ({ day, count }));

        const successRate = auditLogs.length
            ? Math.round((auditLogs.filter(l => l.status === 'Completed').length / auditLogs.length) * 100)
            : 0;

        return { topThreat, entityBreakdown, dailyVolume, successRate };
    }, [auditLogs, isMounted]);

    const maxBar = Math.max(...stats.dailyVolume.map(d => d.count), 1);
    const maxPie = stats.entityBreakdown.reduce((s, e) => s + e.count, 0) || 1;

    const handleFileUploadGlobal = async (file: File) => {
        if (!file) return;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (['png','jpg','jpeg','webp'].includes(ext)) {
            useDocumentStore.getState().setFileMetadata(file.name, 'image');
            const reader = new FileReader();
            reader.onload = (e) => { if (e.target?.result) { useCanvasStore.getState().setImageSrc(e.target.result as string); router.push('/redact'); } };
            reader.readAsDataURL(file); return;
        }
        if (ext === 'pdf') {
            useDocumentStore.getState().setFileMetadata(file.name, 'pdf');
            try {
                const images = await convertPdfToImages(file);
                if (images.length > 0) { useCanvasStore.getState().setImageSrc(images[0].dataUri); router.push('/redact'); }
            } catch { useUiStore.getState().addToast("Failed to render PDF.", 'error'); }
            return;
        }
        try {
            const { text, type, name } = await extractTextFromFile(file);
            setRawText(text); useDocumentStore.getState().setFileMetadata(name, type); router.push('/redact');
        } catch { useUiStore.getState().addToast("Unsupported format.", 'error'); }
    };

    const docsSecured    = isMounted ? totalDocumentsSecured : 0;
    const entitiesMasked = isMounted ? totalEntitiesMasked : 0;
    const recentLogs     = isMounted ? auditLogs : [];

    const textSharpness: React.CSSProperties = {
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
    };

    return (
        <PageLoader page="dashboard">
        <div className="w-full p-6 md:p-10 selection:bg-[#F5C400] selection:text-black min-h-screen" style={{ background: 'transparent' }}>
            <main className="max-w-7xl mx-auto space-y-8 pb-16">

                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-[18px] h-[2px] bg-red-700 shrink-0" />
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase', ...textSharpness }}>
                                // SECURE TELEMETRY ENGINE
                            </span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase', ...textSharpness }}>
                            <Lock className="w-6 h-6 text-[#F5C400]" />
                            Neural Telemetry Core
                        </h1>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'rgba(239,239,239,0.38)', letterSpacing: '0.08em', marginTop: '4px', ...textSharpness }}>
                            REAL-TIME INFERENCE LOGS · {recentLogs.length} SECURE SESSION VOLUMES LOGGED
                        </p>
                    </div>
                    <div style={{ border: '1px solid rgba(52, 211, 153, 0.25)', background: 'rgba(52, 211, 153, 0.05)', ...textSharpness }} 
                        className="flex items-center gap-2.5 px-4 py-2 rounded-none">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#34d399]" />
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.12em', color: '#34d399', fontWeight: 600 }}>
                            LOCAL SANDBOX INFERENCE LIVE
                        </span>
                    </div>
                </header>

                {/* Row 1: Metrics */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Volumes Secured', value: docsSecured,    icon: <FileText className="w-4 h-4" />,    color: '#F5C400',  sub: `${recentLogs.length} local logs` },
                        { label: 'Entities Masked', value: entitiesMasked, icon: <ShieldCheck className="w-4 h-4" />, color: '#34D399',  sub: 'sandbox lifetime' },
                        { label: 'Top Signature',   value: stats.topThreat, icon: <Activity className="w-4 h-4" />,   color: '#60A5FA',  sub: 'primary matching pii', isText: true },
                        { label: 'Active Rules',    value: isMounted ? activeRulesCount : 0, icon: <Lock className="w-4 h-4" />, color: '#A78BFA', sub: 'enforced gatekeepers' },
                    ].map((s, i) => (
                        <div key={i} className="bg-[#080808] border border-white/5 rounded-none p-5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl -mr-8 -mt-8 transition-transform duration-500 group-hover:scale-125" style={{ backgroundColor: s.color + '08' }} />
                            <div className="flex justify-between items-start mb-2">
                                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(239,239,239,0.4)', ...textSharpness }} className="font-semibold uppercase">{s.label}</p>
                                <div style={{ color: s.color }}>{s.icon}</div>
                            </div>
                            {s.isText
                                ? <div className="text-xl font-bold text-white tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '26px', ...textSharpness }}>{s.value}</div>
                                : <div className="text-4xl font-black text-white tracking-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '42px', ...textSharpness }}>{s.value}</div>
                            }
                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: 'rgba(239,239,239,0.25)', letterSpacing: '0.05em', marginTop: '4px', ...textSharpness }}>{s.sub}</p>
                        </div>
                    ))}
                </section>

                {/* Row 2: Charts + Dropzone */}
                <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* Bar chart — daily entity volume */}
                    <div className="lg:col-span-2 bg-[#080808] border border-white/5 rounded-none p-6 flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart3 className="w-4 h-4 text-[#F5C400]" />
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '15px', ...textSharpness }}>
                                7-Day Telemetry Logs
                            </h3>
                        </div>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'rgba(239,239,239,0.38)', ...textSharpness }} className="mb-6">
                            PII signatures intercepted locally per active day
                        </p>
                        {stats.dailyVolume.every(d => d.count === 0) ? (
                            <div className="flex-1 flex items-center justify-center text-gray-700 text-xs font-mono">
                                NO LOGS RECORDED - RUN DECLASSIFIED JOBS
                            </div>
                        ) : (
                            <div className="flex-1 flex items-end gap-2.5 min-h-[140px]">
                                {stats.dailyVolume.map((d, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                        <div className="w-full transition-all duration-700 relative group/bar"
                                            style={{ height: `${Math.max(4, (d.count / maxBar) * 100)}%`, backgroundColor: d.count > 0 ? '#F5C400' : 'rgba(255,255,255,0.06)', minHeight: '4px' }}>
                                            {d.count > 0 && (
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#080808] border border-white/10 text-[9px] font-mono text-white px-2 py-0.5 rounded-none opacity-0 group-hover/bar:opacity-100 transition-all duration-200 whitespace-nowrap z-10">
                                                    {d.count}
                                                </div>
                                            )}
                                        </div>
                                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: 'rgba(239,239,239,0.3)' }}>{d.day}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: 'rgba(239,239,239,0.25)', borderTop: '1px solid rgba(255,255,255,0.05)', ...textSharpness }} 
                            className="flex justify-between mt-4 pt-2">
                            <span>T-6 DAYS</span><span>TELEMETRY CORE</span><span>TODAY</span>
                        </div>
                    </div>

                    {/* Entity type breakdown */}
                    <div className="lg:col-span-1 bg-[#080808] border border-white/5 rounded-none p-6 flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                            <PieChart className="w-4 h-4 text-[#818CF8]" />
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '15px', ...textSharpness }}>
                                Signature Mix
                            </h3>
                        </div>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'rgba(239,239,239,0.38)', ...textSharpness }} className="mb-4">
                            Matching classifications
                        </p>
                        {!stats.entityBreakdown.length ? (
                            <div className="flex-1 flex items-center justify-center text-gray-700 text-xs font-mono text-center">
                                NO THREAT SIGNATURES
                            </div>
                        ) : (
                            <div className="space-y-3 flex-1">
                                {stats.entityBreakdown.slice(0, 6).map(e => (
                                    <div key={e.type}>
                                        <div className="flex justify-between items-center mb-1">
                                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'rgba(239,239,239,0.5)', ...textSharpness }} className="truncate">{e.label}</span>
                                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'rgba(239,239,239,0.3)' }} className="shrink-0 font-mono ml-1">{e.count}</span>
                                        </div>
                                        <div className="h-1 bg-white/5 rounded-none overflow-hidden">
                                            <div className="h-full transition-all duration-700" style={{ width: `${(e.count / maxPie) * 100}%`, backgroundColor: e.color }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Dropzone */}
                    <div className={`lg:col-span-2 relative group bg-[#080808] border border-white/5 rounded-none p-8 flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer ${isDragging ? 'border-[#F5C400]/40 bg-[#F5C400]/5' : 'border-dashed border-white/10 hover:border-[#F5C400]/40'}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) handleFileUploadGlobal(e.dataTransfer.files[0]); }}>
                        <input type="file" accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onChange={e => { if (e.target.files?.length) handleFileUploadGlobal(e.target.files[0]); }} />
                        <div className="absolute inset-0 bg-[#F5C400] opacity-0 group-hover:opacity-[0.015] blur-[40px] transition-opacity rounded-none pointer-events-none" />
                        <div className={`p-4 rounded-none mb-4 transition-all duration-300 ${isDragging ? 'bg-[#F5C400] text-black scale-110 shadow-[0_0_15px_rgba(245,196,0,0.3)]' : 'bg-white/5 text-[#F5C400] group-hover:scale-105'}`}>
                            <UploadCloud className="w-8 h-8" />
                        </div>
                        <h2 className="text-base font-bold text-white mb-2 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '18px', ...textSharpness }}>
                            Secure Ingestion Portal
                        </h2>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'rgba(239,239,239,0.38)', ...textSharpness }} className="mb-4">
                            Drag & drop or <span className="text-[#F5C400]">browse local filesystem</span>
                        </p>
                        <div className="flex flex-wrap justify-center gap-1.5 text-[9px] font-mono text-gray-500">
                            {['PDF','TXT','DOCX','IMG'].map(e => (
                                <span key={e} className="bg-black/40 px-2.5 py-0.5 rounded-none border border-white/5 tracking-wider font-semibold">{e}</span>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Row 3: Audit trail */}
                <section className="bg-[#080808] border border-white/5 rounded-none overflow-hidden">
                    <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#080808]">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[#34D399]" />
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '16px', ...textSharpness }}>
                                Compliance Audit Logs
                            </h3>
                            {recentLogs.length > 0 && (
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.05em', color: '#34D399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }} 
                                    className="px-2 py-0.5 rounded-none ml-2">
                                    {stats.successRate}% INTEGRITY VERIFIED
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', letterSpacing: '0.08em', color: 'rgba(239,239,239,0.3)' }} 
                                className="hidden md:block">
                                // COMPLIANCE MATRIX: DPDP ACT 2023 · GDPR
                            </span>
                            {recentLogs.length > 0 && (
                                <div className="relative group/export">
                                    <button style={{ background: '#F5C400', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.05em', fontWeight: 700 }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-black rounded-none cursor-pointer transition-all hover:brightness-110">
                                        <FileDown className="w-3.5 h-3.5" />EXPORT <ChevronDown className="w-3 h-3" />
                                    </button>
                                    <div className="absolute top-full right-0 mt-1.5 w-40 bg-[#080808] border border-white/10 rounded-none shadow-2xl opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all z-50 p-1">
                                        <button onClick={() => exportAuditPDF(recentLogs, { totalDocs: docsSecured, totalEntities: entitiesMasked, activeRules: activeRulesCount })}
                                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px' }}
                                            className="block w-full text-left px-3 py-2 text-gray-300 hover:bg-white/5 hover:text-[#F5C400] rounded-none cursor-pointer transition-colors">
                                            📄 EXPORT AS PDF
                                        </button>
                                        <button onClick={() => exportAuditCSV(recentLogs)}
                                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px' }}
                                            className="block w-full text-left px-3 py-2 text-gray-300 hover:bg-white/5 hover:text-[#F5C400] rounded-none cursor-pointer transition-colors">
                                            📊 EXPORT AS CSV
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="overflow-x-auto min-h-[220px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10 bg-[#060606] text-[10px] font-semibold text-gray-400 uppercase tracking-widest" style={{ fontFamily: "'IBM Plex Mono', monospace", ...textSharpness }}>
                                    <th className="p-4 pl-6">Run Signature</th>
                                    <th className="p-4">Document Profile</th>
                                    <th className="p-4">Telemetry Epoch</th>
                                    <th className="p-4 text-center">Matches</th>
                                    <th className="p-4 pr-6 text-right">Verdict</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', ...textSharpness }}>
                                {recentLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-500 italic text-xs tracking-wider uppercase" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                            [ No secure telemetry runs logged in this sandbox ]
                                        </td>
                                    </tr>
                                ) : recentLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="p-4 pl-6 text-[#F5C400] font-semibold">{log.id}</td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                                <span className="text-gray-200 truncate max-w-[180px] font-medium">{log.name}</span>
                                                <span className="text-[9px] text-gray-500 bg-black border border-white/5 px-1.5 py-0.5 rounded-none">{log.size}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-400">{log.date}</td>
                                        <td className="p-4 text-center font-bold text-white">{log.entitiesDiscovered}</td>
                                        <td className="p-4 pr-6 text-right">
                                            {log.status === 'Completed' && (
                                                <span style={{ border: '1px solid rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.05)', fontSize: '10px' }} 
                                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-none text-emerald-400 font-bold tracking-wider">
                                                    ✓ SECURED
                                                </span>
                                            )}
                                            {log.status === 'Processing' && (
                                                <span style={{ border: '1px solid rgba(245,196,0,0.2)', background: 'rgba(245,196,0,0.05)', fontSize: '10px' }} 
                                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-none text-[#F5C400] font-bold tracking-wider">
                                                    ● SCANNING
                                                </span>
                                            )}
                                            {log.status === 'Failed' && (
                                                <span style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', fontSize: '10px' }} 
                                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-none text-red-400 font-bold tracking-wider">
                                                    ✕ ABORTED
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

            </main>
        </div>
        </PageLoader>
    );
}