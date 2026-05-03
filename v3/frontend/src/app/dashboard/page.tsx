"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    UploadCloud, CheckCircle2, Clock, ShieldCheck, FileText,
    Activity, Lock, XCircle, TrendingUp, FileDown, ChevronDown,
    BarChart3, PieChart, Zap,
} from 'lucide-react';
import { useDocumentStore } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { extractTextFromFile } from '@/lib/fileFormat';
import { convertPdfToImages } from '@/lib/pdfRenderer';
import { exportAuditPDF, exportAuditCSV } from '@/lib/complianceReport';

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

    return (
        <div className="w-full p-6 md:p-10 font-sans selection:bg-[#FFA500] selection:text-black min-h-screen">
            <main className="max-w-7xl mx-auto space-y-8 pb-16">

                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2A2A2A]">
                    <div>
                        <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-3">
                            <Lock className="w-6 h-6 text-[#FFA500]" />Mission Control
                        </h1>
                        <p className="text-sm text-gray-400 mt-1">Real-time telemetry · {recentLogs.length} sessions logged</p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#1E1E1E] border border-[#2A2A2A] rounded-full">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10B981]" />
                        <span className="text-xs font-mono text-gray-300 tracking-wider">LOCAL INFERENCE LIVE</span>
                    </div>
                </header>

                {/* Row 1: Metrics */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Docs Secured',   value: docsSecured,    icon: <FileText className="w-4 h-4" />,    color: '#FFA500',  sub: `${recentLogs.length} sessions` },
                        { label: 'Entities Masked', value: entitiesMasked, icon: <ShieldCheck className="w-4 h-4" />, color: '#10B981',  sub: 'total lifetime' },
                        { label: 'Top Threat',      value: stats.topThreat, icon: <Activity className="w-4 h-4" />,   color: '#60A5FA',  sub: 'most detected type', isText: true },
                        { label: 'Active Rules',    value: isMounted ? activeRulesCount : 0, icon: <Lock className="w-4 h-4" />, color: '#A78BFA', sub: 'policies enforcing' },
                    ].map((s, i) => (
                        <div key={i} className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-28 h-28 rounded-full blur-3xl -mr-8 -mt-8 transition-transform group-hover:scale-110" style={{ backgroundColor: s.color + '10' }} />
                            <div className="flex justify-between items-start mb-3">
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{s.label}</p>
                                <div style={{ color: s.color }}>{s.icon}</div>
                            </div>
                            {s.isText
                                ? <div className="text-xl font-bold text-white">{s.value}</div>
                                : <div className="text-3xl font-bold text-white font-mono">{s.value}</div>
                            }
                            <p className="text-[10px] text-gray-600 mt-1">{s.sub}</p>
                        </div>
                    ))}
                </section>

                {/* Row 2: Charts + Dropzone */}
                <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                    {/* Bar chart — daily entity volume */}
                    <div className="lg:col-span-2 bg-[#141414] border border-[#2A2A2A] rounded-2xl p-6 flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart3 className="w-4 h-4 text-[#FFA500]" />
                            <h3 className="text-sm font-semibold text-white">7-Day Activity</h3>
                        </div>
                        <p className="text-xs text-gray-500 mb-5">Entities intercepted per day</p>
                        {stats.dailyVolume.every(d => d.count === 0) ? (
                            <div className="flex-1 flex items-center justify-center text-gray-700 text-xs font-mono">No data yet — start redacting</div>
                        ) : (
                            <div className="flex-1 flex items-end gap-2 min-h-[120px]">
                                {stats.dailyVolume.map((d, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                        <div className="w-full rounded-t-sm transition-all duration-700 relative group/bar"
                                            style={{ height: `${Math.max(4, (d.count / maxBar) * 100)}%`, backgroundColor: d.count > 0 ? '#FFA500' : '#2A2A2A', minHeight: '4px' }}>
                                            {d.count > 0 && (
                                                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#1E1E1E] border border-[#2A2A2A] text-[9px] font-mono text-white px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap">
                                                    {d.count}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[9px] text-gray-600 font-mono">{d.day}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-between mt-3 text-[9px] font-mono text-gray-600 border-t border-[#2A2A2A] pt-2">
                            <span>7 days ago</span><span>Today</span>
                        </div>
                    </div>

                    {/* Entity type breakdown */}
                    <div className="lg:col-span-1 bg-[#141414] border border-[#2A2A2A] rounded-2xl p-6 flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                            <PieChart className="w-4 h-4 text-[#818CF8]" />
                            <h3 className="text-sm font-semibold text-white">Threat Mix</h3>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">By entity type</p>
                        {!stats.entityBreakdown.length ? (
                            <div className="flex-1 flex items-center justify-center text-gray-700 text-xs font-mono text-center">No data yet</div>
                        ) : (
                            <div className="space-y-2 flex-1">
                                {stats.entityBreakdown.slice(0, 6).map(e => (
                                    <div key={e.type}>
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="text-[10px] text-gray-400 truncate">{e.label}</span>
                                            <span className="text-[10px] font-mono text-gray-500 shrink-0 ml-1">{e.count}</span>
                                        </div>
                                        <div className="h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(e.count / maxPie) * 100}%`, backgroundColor: e.color }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Dropzone */}
                    <div className={`lg:col-span-2 relative group bg-[#181818] border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer ${isDragging ? 'border-[#FFA500] bg-[#FFA500]/5' : 'border-[#2A2A2A] hover:border-[#FFA500]/60'}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) handleFileUploadGlobal(e.dataTransfer.files[0]); }}>
                        <input type="file" accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onChange={e => { if (e.target.files?.length) handleFileUploadGlobal(e.target.files[0]); }} />
                        <div className="absolute inset-0 bg-[#FFA500] opacity-0 group-hover:opacity-[0.03] blur-[50px] transition-opacity rounded-2xl pointer-events-none" />
                        <div className={`p-4 rounded-xl mb-4 transition-all duration-300 ${isDragging ? 'bg-[#FFA500] text-black scale-110' : 'bg-[#2A2A2A] text-[#FFA500] group-hover:scale-105'}`}>
                            <UploadCloud className="w-8 h-8" />
                        </div>
                        <h2 className="text-base font-semibold text-white mb-2">Sanitize Local File</h2>
                        <p className="text-sm text-gray-500 mb-4">Drag & drop or <span className="text-[#FFA500]">browse</span></p>
                        <div className="flex flex-wrap justify-center gap-1.5 text-[10px] font-mono text-gray-600">
                            {['PDF','TXT','DOCX','IMG'].map(e => <span key={e} className="bg-[#212121] px-2 py-0.5 rounded border border-[#2A2A2A]">{e}</span>)}
                        </div>
                    </div>
                </section>

                {/* Row 3: Audit trail */}
                <section className="bg-[#141414] border border-[#2A2A2A] rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-[#2A2A2A] flex justify-between items-center bg-[#1A1A1A]">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <h3 className="text-sm font-semibold text-white">Compliance Audit Trail</h3>
                            {recentLogs.length > 0 && (
                                <span className="text-[10px] font-mono text-gray-600 bg-[#252525] px-2 py-0.5 rounded-full border border-[#2A2A2A]">
                                    {stats.successRate}% success
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-500 hidden md:block">DPDP Act 2023 compliant</span>
                            {recentLogs.length > 0 && (
                                <div className="relative group/export">
                                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFA500] hover:bg-[#ffb733] text-black text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                                        <FileDown className="w-3.5 h-3.5" />Export <ChevronDown className="w-3 h-3" />
                                    </button>
                                    <div className="absolute top-full right-0 mt-1.5 w-36 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl shadow-2xl opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all z-50 p-1">
                                        <button onClick={() => exportAuditPDF(recentLogs, { totalDocs: docsSecured, totalEntities: entitiesMasked, activeRules: activeRulesCount })}
                                            className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#2A2A2A] hover:text-white rounded-lg cursor-pointer">
                                            📄 Export as PDF
                                        </button>
                                        <button onClick={() => exportAuditCSV(recentLogs)}
                                            className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#2A2A2A] hover:text-white rounded-lg cursor-pointer">
                                            📊 Export as CSV
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="overflow-x-auto min-h-[200px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[#2A2A2A] bg-[#1A1A1A] text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                                    <th className="p-4 pl-6 font-mono">Run ID</th>
                                    <th className="p-4">Document</th>
                                    <th className="p-4">Timestamp</th>
                                    <th className="p-4 text-center">Entities</th>
                                    <th className="p-4 pr-6 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2A2A2A]/40">
                                {recentLogs.length === 0 ? (
                                    <tr><td colSpan={5} className="p-12 text-center text-sm text-gray-600 italic">No sessions logged yet.</td></tr>
                                ) : recentLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-[#1A1A1A] transition-colors">
                                        <td className="p-4 pl-6 text-[13px] font-mono text-[#FFA500]">{log.id}</td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                                <span className="text-[13px] text-gray-200 truncate max-w-[180px]">{log.name}</span>
                                                <span className="text-[10px] text-gray-600 font-mono bg-[#252525] px-1.5 py-0.5 rounded shrink-0">{log.size}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-[13px] font-mono text-gray-500">{log.date}</td>
                                        <td className="p-4 text-[13px] text-center font-bold text-white">{log.entitiesDiscovered}</td>
                                        <td className="p-4 pr-6 text-right">
                                            {log.status === 'Completed' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" />SECURED</span>}
                                            {log.status === 'Processing' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FFA500]/10 text-[#FFA500] border border-[#FFA500]/20"><Clock className="w-3 h-3" />PROCESSING</span>}
                                            {log.status === 'Failed' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20"><XCircle className="w-3 h-3" />FAILED</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

            </main>
        </div>
    );
}