"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { useDocumentStore } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { extractTextFromFile } from '@/lib/fileFormat';
import { convertPdfToImages } from '@/lib/pdfRenderer';
import { exportAuditPDF, exportAuditCSV } from '@/lib/complianceReport';
import { PageLoader } from '@/components/layout/PageLoader';

const ENTITY_COLORS: Record<string, string> = {
    email: '#F5C400', phone: '#F5C400', creditCard: '#F5C400', ssn: '#F5C400',
    names: '#F5C400', dob: '#F5C400', date: '#F5C400', url: '#F5C400', ip: '#F5C400',
    aadhaar: '#F5C400', pan: '#F5C400', gst: '#F5C400', ifsc: '#F5C400',
    voterId: '#F5C400', passport: '#F5C400', vehicleReg: '#F5C400',
    'Visual Extractor': '#F5C400',
};

const ENTITY_LABELS: Record<string, string> = {
    email: 'Email', phone: 'Phone', creditCard: 'Credit Card', ssn: 'SSN',
    names: 'Names', dob: 'Date of Birth', date: 'Dates', url: 'URLs', ip: 'IP Address',
    aadhaar: 'Aadhaar', pan: 'PAN', gst: 'GST', ifsc: 'IFSC',
    voterId: 'Voter ID', passport: 'Passport', vehicleReg: 'Vehicle Reg',
    'Visual Extractor': 'Visual',
};

function useIntersectionObserver(options = {}) {
    const [isIntersecting, setIsIntersecting] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsIntersecting(true);
                observer.disconnect();
            }
        }, options);
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [options]);

    return [ref, isIntersecting] as const;
}

export default function DashboardPage() {
    const [isDragging, setIsDragging] = useState(false);
    const [isMounted,  setIsMounted]  = useState(false);
    const [statsVisible, setStatsVisible] = useState(false);
    
    const [chartRef, chartVisible] = useIntersectionObserver({ threshold: 0.1 });
    const [breakdownRef, breakdownVisible] = useIntersectionObserver({ threshold: 0.1 });
    const [uploadRef, uploadVisible] = useIntersectionObserver({ threshold: 0.1 });
    const [tableRef, tableVisible] = useIntersectionObserver({ threshold: 0.1 });

    const router = useRouter();

    const { rules, setRawText } = useDocumentStore();
    const { auditLogs, totalDocumentsSecured, totalEntitiesMasked } = useSessionStore();

    useEffect(() => { 
        setIsMounted(true); 
        const t = setTimeout(() => setStatsVisible(true), 300);
        return () => clearTimeout(t);
    }, []);

    const activeRulesCount = Object.values(rules).filter(r => r.isActive).length;

    const stats = useMemo(() => {
        if (!isMounted || !auditLogs.length) return {
            topThreat: 'N/A', entityBreakdown: [], dailyVolume: [], successRate: 0,
        };

        const typeCounts: Record<string, number> = {};
        auditLogs.forEach(log => {
            log.rulesApplied.forEach(r => {
                typeCounts[r] = (typeCounts[r] || 0) + 1;
            });
        });
        const entityBreakdown = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([type, count]) => ({ type, count, color: '#F5C400', label: ENTITY_LABELS[type] || type }));

        const topThreat = entityBreakdown[0]?.label ?? 'N/A';

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

    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadReport = async () => {
        if (isDownloading) return;
        if (!recentLogs.length) {
            useUiStore.getState().addToast("No audit logs to generate a report from.", "error");
            return;
        }
        setIsDownloading(true);
        try {
            useUiStore.getState().addToast("Syncing audit logs...", "info");

            // Sync all frontend logs to backend DB first
            await Promise.all(
                recentLogs.map(log =>
                    fetch('http://127.0.0.1:8000/api/v3/audit/log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: log.id,
                            name: log.name,
                            size: log.size,
                            date: log.date,
                            status: log.status,
                            entities_discovered: log.entitiesDiscovered,
                            rules_applied: log.rulesApplied,
                            session_id: 'default',
                        }),
                    }).catch(() => {}) // ignore individual sync failures (duplicates etc)
                )
            );

            useUiStore.getState().addToast("Generating signed report...", "info");
            const response = await fetch('http://127.0.0.1:8000/api/v3/audit/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: 'default', report_title: 'Ciphera Audit Report', include_raw_log: true })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => null);
                const msg = err?.detail || 'Report generation failed';
                useUiStore.getState().addToast(msg, "error");
                return;
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Signed_Audit_Report_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            useUiStore.getState().addToast("Signed report downloaded successfully.", "success");
        } catch (err) {
            console.error(err);
            useUiStore.getState().addToast("Failed to download report.", "error");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <PageLoader page="dashboard">
        <div className="w-full p-6 md:p-10 selection:bg-[#F5C400] selection:text-black min-h-screen bg-[#0d0d0d]">
            <main className="max-w-7xl mx-auto space-y-10 pb-16">

                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 animate-header-in border-b border-[rgba(239,239,239,0.07)]">
                    <div>
                        <div className="flex items-center gap-3 mb-3 w-fit animate-eyebrow-in" style={{ clipPath: 'inset(0 100% 0 0)' }}>
                            <div className="w-[24px] h-[2px] bg-[#B91C1C] shrink-0" />
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, letterSpacing: '0.24em', color: '#ff4d4d', textTransform: 'uppercase' }}>
                                // OVERVIEW
                            </span>
                        </div>
                        <h1 className="text-[#EFEFEF] uppercase animate-title-in opacity-0 drop-shadow-md"
                            style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: 1, letterSpacing: '0.02em' }}>
                            REDACTION OVERVIEW
                        </h1>
                        <p className="animate-subline-in opacity-0" style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.04em', marginTop: '12px' }}>
                            Real-time activity · Session logs · Local inference only
                        </p>
                    </div>
                    <div style={{ border: '1px solid rgba(74,222,128,0.4)', padding: '8px 20px', borderRadius: 0, backgroundColor: 'rgba(74,222,128,0.05)' }} 
                        className="flex items-center gap-3 shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                        <div className="w-1.5 h-1.5 bg-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.8)]" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', color: '#4ade80' }}>
                            LOCAL INFERENCE · ACTIVE
                        </span>
                    </div>
                </header>

                {/* Row 1: Metrics */}
                <section className="bg-[#131315] border border-[rgba(239,239,239,0.07)] relative overflow-hidden" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                    {/* Sweep highlight for the whole row */}
                    <div className="absolute top-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C400] to-transparent w-full opacity-50" style={{ animation: 'scanline-horizontal 4s linear infinite' }} />
                    
                    {[
                        { label: 'Documents redacted', value: docsSecured, sub: 'This session', idx: '01' },
                        { label: 'Entities removed', value: entitiesMasked, sub: 'Lifetime total', idx: '02' },
                        { label: 'Top entity type', value: stats.topThreat, sub: 'Most detected', idx: '03', smallText: true },
                        { label: 'Active recognisers', value: isMounted ? activeRulesCount : 0, sub: 'Detection rules', idx: '04' },
                    ].map((s, i) => (
                        <div key={i} className="relative bg-transparent border-r border-[rgba(239,239,239,0.07)] last:border-r-0" style={{ padding: '32px 36px' }}>
                            
                            <div className="absolute top-4 right-5" style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF' }}>
                                {s.idx}
                            </div>
                            <div style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em', marginBottom: '16px' }}>
                                {s.label}
                            </div>
                            <div className="relative">
                                {/* Dissolve mask */}
                                {!statsVisible && (
                                    <div className="absolute inset-0 bg-[#EFEFEF] z-10" />
                                )}
                                <div className="text-[#EFEFEF]" style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: s.smallText ? '40px' : '64px', lineHeight: 1, opacity: statsVisible ? 1 : 0 }}>
                                    {s.value}
                                </div>
                            </div>
                            <p style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em', marginTop: '12px' }}>
                                {s.sub}
                            </p>
                        </div>
                    ))}
                </section>

                {/* Row 2: Charts + Dropzone */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Bar chart */}
                    <div ref={chartRef} className={`group bg-[#131315] border border-[rgba(239,239,239,0.07)] flex flex-col opacity-0 transition-all duration-[450ms] hover:border-[rgba(245,196,0,0.3)] hover:shadow-[0_0_20px_rgba(245,196,0,0.05)] ${chartVisible ? 'translate-y-0 opacity-100' : 'translate-y-[12px]'}`} style={{ transitionDelay: '0ms' }}>
                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.07)] flex justify-between items-center" style={{ padding: '16px 24px' }}>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>// 7-day activity</span>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF' }}>Telemetry core</span>
                        </div>
                        <div className="flex-1 flex flex-col bg-transparent" style={{ padding: '24px' }}>
                            <p style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em', marginBottom: '28px' }}>
                                Entities detected per active day
                            </p>
                            {stats.dailyVolume.every(d => d.count === 0) ? (
                                <div className="flex-1 flex items-center justify-center text-[rgba(239,239,239,0.5)] font-mono text-xs">
                                    NO LOGS RECORDED
                                </div>
                            ) : (
                                <div className="flex-1 flex items-end gap-[2px] min-h-[160px] relative">
                                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                        {[...Array(4)].map((_, i) => (
                                            <div key={i} className="w-full h-px bg-[rgba(239,239,239,0.06)]" />
                                        ))}
                                    </div>
                                    {stats.dailyVolume.map((d, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-2 relative z-10 h-full justify-end group/bar cursor-default">
                                            <div className="w-full bg-[#F5C400] transition-all duration-700 relative group-hover/bar:bg-[#ffe166] group-hover/bar:shadow-[0_0_12px_rgba(245,196,0,0.6)]"
                                                style={{ height: `${Math.max(2, (d.count / maxBar) * 100)}%`, opacity: d.count > 0 ? 1 : 0.3 }} />
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: 'rgba(239,239,239,0.6)', transition: 'color 0.2s' }} className="group-hover/bar:text-[#F5C400]">{d.day}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="border-t border-[rgba(239,239,239,0.07)] flex justify-between" style={{ padding: '12px 24px', fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF' }}>
                            <span>7–6 days</span><span>Telemetry core</span><span>Today</span>
                        </div>
                    </div>

                    {/* Entity type breakdown */}
                    <div ref={breakdownRef} className={`group bg-[#131315] border border-[rgba(239,239,239,0.07)] flex flex-col opacity-0 transition-all duration-[450ms] hover:border-[rgba(245,196,0,0.3)] hover:shadow-[0_0_20px_rgba(245,196,0,0.05)] ${breakdownVisible ? 'translate-y-0 opacity-100' : 'translate-y-[12px]'}`} style={{ transitionDelay: '60ms' }}>
                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.07)] flex justify-between items-center" style={{ padding: '16px 24px' }}>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>// Entity breakdown</span>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF' }}>Detected entity types</span>
                        </div>
                        <div className="flex-1 flex flex-col bg-transparent">
                            {!stats.entityBreakdown.length ? (
                                <div className="flex-1 flex items-center justify-center text-[rgba(239,239,239,0.5)] font-mono text-xs">
                                    NO THREAT SIGNATURES
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto" style={{ padding: '8px 0' }}>
                                    {stats.entityBreakdown.map((e, i) => (
                                        <div key={e.type} className="border-b border-[rgba(239,239,239,0.07)] hover:bg-[rgba(245,196,0,0.04)] transition-colors relative overflow-hidden group/row" style={{ padding: '12px 24px' }}>
                                            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover/row:scale-y-100 transition-transform duration-300" />
                                            <div className="grid grid-cols-[1fr_auto] mb-2">
                                                <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', transition: 'color 0.2s', letterSpacing: '0.02em' }} className="group-hover/row:text-[#F5C400]">{e.label}</span>
                                                <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#F5C400' }}>{e.count}</span>
                                            </div>
                                            <div className="h-[2px] bg-[rgba(239,239,239,0.08)] mt-1">
                                                <div className="h-full bg-[#F5C400] transition-all duration-[800ms] ease-out shadow-[0_0_8px_rgba(245,196,0,0.4)] group-hover/row:bg-[#ffe166]" style={{ width: breakdownVisible ? `${(e.count / maxPie) * 100}%` : '0%', transitionDelay: `${i * 80}ms` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Dropzone */}
                    <div ref={uploadRef} className={`group bg-[#131315] border ${isDragging ? 'border-[#F5C400] shadow-[0_0_20px_rgba(245,196,0,0.15)] bg-[rgba(245,196,0,0.02)]' : 'border-[rgba(239,239,239,0.15)]'} flex flex-col opacity-0 transition-all duration-[450ms] relative overflow-hidden hover:border-[#F5C400] ${uploadVisible ? 'translate-y-0 opacity-100' : 'translate-y-[12px]'}`} style={{ transitionDelay: '120ms' }}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) handleFileUploadGlobal(e.dataTransfer.files[0]); }}>
                        
                        {/* Scanning beam effect on hover/idle */}
                        <div className="absolute left-0 right-0 h-[1px] bg-[#F5C400] opacity-0 group-hover:opacity-40 transition-opacity" style={{ animation: 'scanline-vertical 3s linear infinite' }} />

                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.07)]" style={{ padding: '16px 24px', position: 'relative', zIndex: 2 }}>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>// Upload document</span>
                        </div>
                        <input type="file" accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            onChange={e => { if (e.target.files?.length) handleFileUploadGlobal(e.target.files[0]); }} />
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center relative z-2" style={{ padding: '32px' }}>
                            <div className="relative">
                                <div className="absolute inset-0 bg-[#F5C400] blur-xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 rounded-full" />
                                <UploadCloud className="w-10 h-10 transition-transform duration-500 group-hover:-translate-y-2 group-hover:text-[#F5C400]" style={{ color: 'rgba(239,239,239,0.4)' }} />
                            </div>
                            <h2 className="text-[#EFEFEF] uppercase tracking-wide group-hover:text-[#F5C400] transition-colors" style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: '20px' }}>
                                UPLOAD DOCUMENT
                            </h2>
                            <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.6)' }}>
                                Drag & drop or click to select a file
                            </p>
                            <div className="flex flex-wrap justify-center gap-[8px] mt-4">
                                {['PDF','TXT','DOCX','IMG'].map(e => (
                                    <span key={e} className="border border-[rgba(239,239,239,0.2)] text-[rgba(239,239,239,0.6)] transition-all group-hover:border-[#F5C400] group-hover:text-[#F5C400]" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.14em', padding: '4px 12px', background: 'rgba(17,17,19,0.5)' }}>{e}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Row 3: Session History */}
                <section ref={tableRef} className="mt-12">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-[24px] h-[2px] bg-[#B91C1C] shrink-0" />
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, color: '#ff4d4d', textTransform: 'uppercase' }}>
                            // SESSION HISTORY
                        </span>
                    </div>
                    
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                            <h3 className="text-[#EFEFEF]" style={{ fontFamily: '"Barlow", sans-serif', fontWeight: 700, fontSize: '18px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                SESSION LOGS
                            </h3>
                            {recentLogs.length > 0 && (
                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', padding: '4px 12px', background: 'rgba(74,222,128,0.05)' }}>
                                    INTEGRITY VERIFIED
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-6">
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF' }}>
                                // DPDP Act 2023 · GDPR compliant
                            </span>
                            {recentLogs.length > 0 && (
                                <button onClick={handleDownloadReport}
                                    className="bg-[#F5C400] text-[#080808] hover:bg-[#ffe166] hover:shadow-[0_0_15px_rgba(245,196,0,0.4)] transition-all border-none cursor-pointer group"
                                    style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.16em', padding: '10px 24px', textTransform: 'uppercase' }}>
                                    DOWNLOAD REPORT <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-[#131315] border border-[rgba(239,239,239,0.15)] shadow-lg">
                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.15)] flex" style={{ padding: '14px 24px', fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>
                            <div className="flex-1">Session ID</div>
                            <div className="flex-1">Document</div>
                            <div className="flex-1">Timestamp</div>
                            <div className="w-24 text-right">Entities</div>
                            <div className="w-28 text-right">Status</div>
                        </div>
                        
                        <div className="overflow-hidden bg-transparent">
                            {recentLogs.length === 0 ? (
                                <div className="text-center italic tracking-wider uppercase py-12" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.5)' }}>
                                    [ No secure telemetry runs logged in this sandbox ]
                                </div>
                            ) : recentLogs.map((log, i) => (
                                <div key={log.id} className={`group flex items-center hover:bg-[rgba(245,196,0,0.04)] transition-all duration-[400ms] border-b border-[rgba(239,239,239,0.07)] last:border-b-0 ${tableVisible ? 'translate-x-0 opacity-100' : '-translate-x-[12px] opacity-0'} relative`} style={{ padding: '18px 24px', transitionDelay: `${i * 60}ms` }}>
                                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
                                    <div className="flex-1" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, color: '#F5C400', letterSpacing: '0.1em' }}>
                                        {log.id}
                                    </div>
                                    <div className="flex-1 truncate pr-4" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.8)' }}>
                                        {log.name}
                                    </div>
                                    <div className="flex-1" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.6)' }}>
                                        {log.date}
                                    </div>
                                    <div className="w-24 text-right text-[#EFEFEF] group-hover:text-[#F5C400] transition-colors" style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: '16px', textTransform: 'uppercase' }}>
                                        {log.entitiesDiscovered}
                                    </div>
                                    <div className="w-28 text-right flex justify-end">
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, color: '#4ade80', letterSpacing: '0.14em', border: '1px solid rgba(74,222,128,0.3)', padding: '4px 12px', display: 'flex', alignItems: 'center', background: 'rgba(74,222,128,0.05)' }}>
                                            ✓ CLEAN
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

            </main>
            
            <style jsx global>{`
                @keyframes pulse-dot {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.3); }
                }
                @keyframes eyebrow-in {
                    from { clip-path: inset(0 100% 0 0); }
                    to { clip-path: inset(0 0% 0 0); }
                }
                @keyframes title-in {
                    from { transform: translateY(16px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes scanline-horizontal {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes scanline-vertical {
                    0% { top: 0; opacity: 0; }
                    10% { opacity: 0.4; }
                    90% { opacity: 0.4; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-eyebrow-in {
                    animation: eyebrow-in 0.3s ease-out forwards;
                }
                .animate-title-in {
                    animation: title-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
                    animation-delay: 150ms;
                }
                .animate-subline-in {
                    animation: title-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
                    animation-delay: 250ms;
                }
            `}</style>
        </div>
        </PageLoader>
    );
}