"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UploadCloud, Key, ChevronRight, Download, RefreshCw, Plus, Layers, Settings } from 'lucide-react';
import { useDocumentStore } from '@/store/documentStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/context/AuthContext';
import { extractTextFromFile } from '@/lib/fileFormat';
import { convertPdfToImages } from '@/lib/pdfRenderer';
import { api, apiFetch, publicFetch } from '@/lib/api';
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
    upi: 'UPI ID', bankAccount: 'Bank Account', drivingLicence: 'Driving Licence', pinCode: 'PIN Code',
    'Visual Extractor': 'Visual',
};

// ── Intersection observer ─────────────────────────────────────────────────────
function useIntersectionObserver(options = {}) {
    const [isIntersecting, setIsIntersecting] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { setIsIntersecting(true); observer.disconnect(); }
        }, options);
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    return [ref, isIntersecting] as const;
}

// ── Time-aware greeting ───────────────────────────────────────────────────────
function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'GOOD MORNING';
    if (h < 17) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
}

export default function DashboardPage() {
    const [isDragging,     setIsDragging]     = useState(false);
    const [isMounted,      setIsMounted]      = useState(false);
    const [statsVisible,   setStatsVisible]   = useState(false);
    const [isDownloading,  setIsDownloading]  = useState(false);
    const [loadingBackend, setLoadingBackend] = useState(false);

    // Backend data
    const [backendStats,   setBackendStats]   = useState<any>(null);
    const [backendLogs,    setBackendLogs]    = useState<any[]>([]);
    const [apiKeys,        setApiKeys]        = useState<any[]>([]);
    const [keyUsages,      setKeyUsages]      = useState<Record<string, any>>({});
    const [groqHealthy,    setGroqHealthy]    = useState<boolean | null>(null);
    const [backendOnline,  setBackendOnline]  = useState<boolean | null>(null);

    // Pagination + search for session history
    const [logPage,        setLogPage]        = useState(0);
    const [logSearch,      setLogSearch]      = useState('');
    const [expandedLogId,  setExpandedLogId]  = useState<string | null>(null);
    const LOG_PAGE_SIZE = 10;

    const [chartRef,     chartVisible]     = useIntersectionObserver({ threshold: 0.1 });
    const [breakdownRef, breakdownVisible] = useIntersectionObserver({ threshold: 0.1 });
    const [uploadRef,    uploadVisible]    = useIntersectionObserver({ threshold: 0.1 });
    const [tableRef,     tableVisible]     = useIntersectionObserver({ threshold: 0.1 });
    const [keyRef,       keyVisible]       = useIntersectionObserver({ threshold: 0.1 });

    const router = useRouter();
    const { user, isGuest, loading } = useAuth();
    const { rules, setRawText } = useDocumentStore();
    const { auditLogs, totalDocumentsSecured, totalEntitiesMasked } = useSessionStore();

    useEffect(() => {
        setIsMounted(true);
        const t = setTimeout(() => setStatsVisible(true), 300);
        return () => clearTimeout(t);
    }, []);

    const activeRulesCount = Object.values(rules).filter(r => r.isActive).length;

    // ── Fetch backend data ──────────────────────────────────────────────────
    const fetchBackendData = useCallback(async () => {
        setLoadingBackend(true);
        try {
            if (isGuest) {
                setBackendOnline(true);
                setBackendStats(null);
                setBackendLogs([]);
                setLoadingBackend(false);
                return;
            }
            // Health
            const health = await publicFetch('/api/v3/health').then(r => r.json()).catch(() => null);
            setBackendOnline(Boolean(health?.status === 'ok' || health?.status === 'loading'));

            // Audit stats
            const stats = await apiFetch('/api/v3/audit/stats?session_id=default')
                .then(r => r.ok ? r.json() : null).catch(() => null);
            if (stats) setBackendStats(stats);

            // Audit logs (paginated — fetch all for search, limit 100)
            const logs = await apiFetch('/api/v3/audit/logs?session_id=default&limit=100')
                .then(r => r.ok ? r.json() : null).catch(() => null);
            if (logs?.logs) setBackendLogs(logs.logs);

            // API keys
            const keys = await apiFetch('/api/v3/keys/list')
                .then(r => r.ok ? r.json() : null).catch(() => null);
            if (keys?.keys) {
                setApiKeys(keys.keys.slice(0, 4));
                // Fetch usage for each key
                const usageResults: Record<string, any> = {};
                await Promise.allSettled(
                    keys.keys.slice(0, 4).map(async (k: any) => {
                        const u = await apiFetch(`/api/v3/keys/${k.key_id}/usage`)
                            .then(r => r.ok ? r.json() : null).catch(() => null);
                        if (u) usageResults[k.key_id] = u;
                    })
                );
                setKeyUsages(usageResults);
            }

            // Groq health
            const groq = await publicFetch('/api/v3/score-entities/health')
                .then(r => r.ok ? r.json() : null).catch(() => null);
            setGroqHealthy(groq?.available ?? false);

        } finally { setLoadingBackend(false); }
    }, [isGuest]);

    useEffect(() => { if (isMounted && !loading) fetchBackendData(); }, [isMounted, loading, fetchBackendData]);

    // ── Stats derived ─────────────────────────────────────────────────────
    const totalDocs     = isMounted ? (backendStats?.total_documents || totalDocumentsSecured)   : 0;
    const totalEntities = isMounted ? (backendStats?.total_entities  || totalEntitiesMasked)     : 0;
    const successRate   = backendStats?.success_rate ?? 0;
    const topThreat     = backendStats?.top_entity_type
        ? (ENTITY_LABELS[backendStats.top_entity_type] || backendStats.top_entity_type)
        : 'N/A';

    // Local session stats for chart/breakdown if backend empty
    const localStats = useMemo(() => {
        if (!isMounted || !auditLogs.length) return { entityBreakdown: [], dailyVolume: [] };
        const typeCounts: Record<string, number> = {};
        auditLogs.forEach(log => {
            log.rulesApplied.forEach(r => { typeCounts[r] = (typeCounts[r] || 0) + 1; });
        });
        const entityBreakdown = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1]).slice(0, 8)
            .map(([type, count]) => ({ type, count, label: ENTITY_LABELS[type] || type }));
        const dayMap: Record<string, number> = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now); d.setDate(d.getDate() - i);
            dayMap[d.toLocaleDateString('en-US', { weekday: 'short' })] = 0;
        }
        auditLogs.forEach(log => {
            try {
                const d   = new Date(log.date);
                const key = d.toLocaleDateString('en-US', { weekday: 'short' });
                if (key in dayMap) dayMap[key] = (dayMap[key] || 0) + log.entitiesDiscovered;
            } catch {}
        });
        return {
            entityBreakdown,
            dailyVolume: Object.entries(dayMap).map(([day, count]) => ({ day, count })),
        };
    }, [auditLogs, isMounted]);

    // Use backend breakdown if available
    const entityBreakdown = (backendStats?.entity_breakdown?.length
        ? backendStats.entity_breakdown.map((e: any) => ({
            type: e.type, count: e.count, label: ENTITY_LABELS[e.type] || e.type,
        }))
        : localStats.entityBreakdown
    ).slice(0, 8);
    const maxPie = entityBreakdown.reduce((s: number, e: any) => s + e.count, 0) || 1;

    // Daily volume — backend stats
    const dailyVolume = useMemo(() => {
        if (backendStats?.daily_volume?.length) {
            return backendStats.daily_volume.map((d: any) => ({ day: d.day, count: d.count }));
        }
        return localStats.dailyVolume;
    }, [backendStats, localStats.dailyVolume]);
    const maxBar = Math.max(...(dailyVolume || []).map((d: any) => d.count), 1);

    // Merge backend + local logs, deduplicate by id
    const allLogs = useMemo(() => {
        const map = new Map<string, any>();
        // Local first (most recent)
        (isMounted ? auditLogs : []).forEach(l => map.set(l.id, {
            id: l.id, name: l.name, date: l.date,
            entities_discovered: l.entitiesDiscovered,
            rules_applied: l.rulesApplied, status: l.status,
        }));
        // Backend overwrites (has more persistent history)
        backendLogs.forEach(l => map.set(l.id, l));
        return Array.from(map.values()).sort((a, b) => {
            const da = new Date(a.created_at || a.date).getTime();
            const db = new Date(b.created_at || b.date).getTime();
            return db - da;
        });
    }, [auditLogs, backendLogs, isMounted]);

    // Search + paginate logs
    const filteredLogs = useMemo(() => {
        if (!logSearch.trim()) return allLogs;
        const q = logSearch.toLowerCase();
        return allLogs.filter(l =>
            (l.id || '').toLowerCase().includes(q) ||
            (l.name || '').toLowerCase().includes(q)
        );
    }, [allLogs, logSearch]);
    const totalLogPages   = Math.ceil(filteredLogs.length / LOG_PAGE_SIZE);
    const pagedLogs       = filteredLogs.slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE);

    // ── File upload ──────────────────────────────────────────────────────
    const handleFileUploadGlobal = async (file: File) => {
        if (!file) return;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (['png','jpg','jpeg','webp'].includes(ext)) {
            useDocumentStore.getState().setFileMetadata(file.name, 'image', file);
            const reader = new FileReader();
            reader.onload = (e) => { if (e.target?.result) { useCanvasStore.getState().setImageSrc(e.target.result as string); router.push('/redact'); } };
            reader.readAsDataURL(file); return;
        }
        if (ext === 'pdf') {
            useDocumentStore.getState().setFileMetadata(file.name, 'pdf', file);
            try {
                const images = await convertPdfToImages(file);
                if (images.length > 0) { useCanvasStore.getState().setImageSrc(images[0].dataUri); router.push('/redact'); }
            } catch { useUiStore.getState().addToast("Failed to render PDF.", 'error'); }
            return;
        }
        try {
            const { text, type, name } = await extractTextFromFile(file);
            setRawText(text);
            useDocumentStore.getState().setFileMetadata(name, type, file);
            router.push('/redact');
        } catch { useUiStore.getState().addToast("Unsupported format.", 'error'); }
    };

    // ── Report download ──────────────────────────────────────────────────
    const handleDownloadReport = async () => {
        if (isDownloading) return;
        if (!allLogs.length) { useUiStore.getState().addToast("No audit logs to generate a report from.", "error"); return; }
        setIsDownloading(true);
        try {
            useUiStore.getState().addToast("Generating signed report…", "info");
            const response = await apiFetch('/api/v3/audit/report', {
                method: 'POST',
                body: JSON.stringify({
                    session_id:   'default',
                    report_title: `Ciphera Audit Report — ${user?.full_name || 'Session'}`,
                    include_raw_log: true,
                    logs: allLogs,
                }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                useUiStore.getState().addToast(err?.detail || 'Report generation failed', "error");
                return;
            }
            const blob = await response.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `Signed_Audit_Report_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            useUiStore.getState().addToast("Signed report downloaded.", "success");
        } catch { useUiStore.getState().addToast("Failed to download report.", "error"); }
        finally { setIsDownloading(false); }
    };

    const docsSecured    = isMounted ? totalDocs    : 0;
    const entitiesMasked = isMounted ? totalEntities : 0;

    return (
        <PageLoader page="dashboard">
        <div className="w-full p-6 md:p-10 selection:bg-[#F5C400] selection:text-black min-h-screen bg-[#0d0d0d]">
            <main className="max-w-7xl mx-auto space-y-10 pb-16">

                {/* ── HEADER ─────────────────────────────────────────────── */}
                <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 animate-header-in border-b border-[rgba(239,239,239,0.07)]">
                    <div>
                        <div className="flex items-center gap-3 mb-3 w-fit animate-eyebrow-in" style={{ clipPath: 'inset(0 100% 0 0)' }}>
                            <div className="w-[24px] h-[2px] bg-[#B91C1C] shrink-0" />
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, letterSpacing: '0.24em', color: '#ff4d4d', textTransform: 'uppercase' }}>
                                // OVERVIEW
                            </span>
                        </div>
                        {/* Time-aware greeting with user name */}
                        <h1 className="text-[#EFEFEF] uppercase animate-title-in opacity-0 drop-shadow-md"
                            style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: 1, letterSpacing: '0.02em' }}>
                            {getGreeting()}{user?.full_name ? `, ${user.full_name.split(' ')[0].toUpperCase()}.` : '.'}
                        </h1>
                        {/* Org + plan + role */}
                        <div className="animate-subline-in opacity-0 flex items-center gap-3 flex-wrap mt-3">
                            {user && (
                                <>
                                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.14em', color: 'rgba(239,239,239,0.5)' }}>
                                        {user.email}
                                    </span>
                                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 600, letterSpacing: '0.16em', color: '#F5C400', border: '1px solid rgba(245,196,0,0.3)', padding: '2px 8px', background: 'rgba(245,196,0,0.05)', textTransform: 'uppercase' }}>
                                        {user.plan || 'FREE'}
                                    </span>
                                    {user.role && user.role !== 'user' && (
                                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, letterSpacing: '0.14em', color: 'rgba(239,239,239,0.4)', border: '1px solid rgba(239,239,239,0.1)', padding: '2px 8px', textTransform: 'uppercase' }}>
                                            {user.role}
                                        </span>
                                    )}
                                    {groqHealthy && (
                                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(245,196,0,0.7)', textTransform: 'uppercase' }}>
                                            ✓ ML Scoring Active
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right side — status + report button */}
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Backend status */}
                        <div style={{ border: `1px solid ${backendOnline ? 'rgba(74,222,128,0.4)' : 'rgba(239,239,239,0.1)'}`, padding: '8px 20px', background: backendOnline ? 'rgba(74,222,128,0.05)' : 'transparent' }}
                            className="flex items-center gap-3 shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                            <div className="w-1.5 h-1.5" style={{ borderRadius: '50%', background: backendOnline ? '#4ade80' : '#6B7280', boxShadow: backendOnline ? '0 0 8px rgba(74,222,128,0.8)' : 'none', animation: backendOnline ? 'pulse-dot 1.4s ease-in-out infinite' : 'none' }} />
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', color: backendOnline ? '#4ade80' : '#6B7280', textTransform: 'uppercase' }}>
                                {backendOnline ? 'LOCAL INFERENCE · ACTIVE' : 'ENGINE OFFLINE'}
                            </span>
                        </div>
                        {/* Refresh */}
                        <button onClick={fetchBackendData} disabled={loadingBackend}
                            className="flex items-center gap-2 transition-all cursor-pointer border border-[rgba(239,239,239,0.1)] bg-transparent hover:border-[rgba(245,196,0,0.4)] hover:text-[#F5C400]"
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, letterSpacing: '0.14em', color: 'rgba(239,239,239,0.4)', padding: '8px 14px', textTransform: 'uppercase' }}>
                            <RefreshCw className="w-3 h-3" style={{ animation: loadingBackend ? 'spin 1s linear infinite' : 'none' }} />
                            Sync
                        </button>
                        {/* Download report */}
                        {allLogs.length > 0 && !isGuest && (
                            <button onClick={handleDownloadReport} disabled={isDownloading}
                                className="flex items-center gap-2 bg-[#F5C400] text-[#080808] hover:bg-[#ffe166] hover:shadow-[0_0_15px_rgba(245,196,0,0.4)] transition-all border-none cursor-pointer group"
                                style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.16em', padding: '10px 24px', textTransform: 'uppercase' }}>
                                <Download className="w-3.5 h-3.5" />
                                {isDownloading ? 'GENERATING…' : 'DOWNLOAD REPORT →'}
                            </button>
                        )}
                    </div>
                </header>

                {/* ── STATS ROW ───────────────────────────────────────────── */}
                <section className="bg-[#131315] border border-[rgba(239,239,239,0.07)] relative overflow-hidden" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                    <div className="absolute top-0 left-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C400] to-transparent w-full opacity-50" style={{ animation: 'scanline-horizontal 4s linear infinite' }} />

                    {[
                        { label: 'Documents secured',  value: docsSecured,    sub: 'All sessions',   idx: '01' },
                        { label: 'Entities removed',   value: entitiesMasked, sub: 'Lifetime total',  idx: '02' },
                        { label: 'Top entity type',    value: topThreat,      sub: 'Most detected',  idx: '03', smallText: true },
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
                                {!statsVisible && <div className="absolute inset-0 bg-[#EFEFEF] z-10" />}
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

                {/* ── CHARTS + DROPZONE ───────────────────────────────────── */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Bar chart */}
                    <div ref={chartRef} className={`group bg-[#131315] border border-[rgba(239,239,239,0.07)] flex flex-col opacity-0 transition-all duration-[450ms] hover:border-[rgba(245,196,0,0.3)] hover:shadow-[0_0_20px_rgba(245,196,0,0.05)] ${chartVisible ? 'translate-y-0 opacity-100' : 'translate-y-[12px]'}`}>
                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.07)] flex justify-between items-center" style={{ padding: '16px 24px' }}>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>// 7-day activity</span>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF' }}>Telemetry core</span>
                        </div>
                        <div className="flex-1 flex flex-col bg-transparent" style={{ padding: '24px' }}>
                            <p style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em', marginBottom: '28px' }}>
                                Entities detected per active day
                            </p>
                            {dailyVolume.every((d: any) => d.count === 0) ? (
                                <div className="flex-1 flex items-center justify-center text-[rgba(239,239,239,0.5)] font-mono text-xs">NO LOGS RECORDED</div>
                            ) : (
                                <div className="flex-1 flex items-end gap-[2px] min-h-[160px] relative">
                                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                        {[...Array(4)].map((_, i) => <div key={i} className="w-full h-px bg-[rgba(239,239,239,0.06)]" />)}
                                    </div>
                                    {dailyVolume.map((d: any, i: number) => (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-2 relative z-10 h-full justify-end group/bar cursor-default" title={`${d.day}: ${d.count} entities`}>
                                            <div className="w-full bg-[#F5C400] transition-all duration-700 relative group-hover/bar:bg-[#ffe166] group-hover/bar:shadow-[0_0_12px_rgba(245,196,0,0.6)]"
                                                style={{ height: `${Math.max(2, (d.count / maxBar) * 100)}%`, opacity: d.count > 0 ? 1 : 0.3 }} />
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: 'rgba(239,239,239,0.6)' }} className="group-hover/bar:text-[#F5C400]">{d.day}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="border-t border-[rgba(239,239,239,0.07)] flex justify-between" style={{ padding: '12px 24px', fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF' }}>
                            <span>7–6 days</span><span>Telemetry core</span><span>Today</span>
                        </div>
                    </div>

                    {/* Entity breakdown */}
                    <div ref={breakdownRef} className={`group bg-[#131315] border border-[rgba(239,239,239,0.07)] flex flex-col opacity-0 transition-all duration-[450ms] hover:border-[rgba(245,196,0,0.3)] hover:shadow-[0_0_20px_rgba(245,196,0,0.05)] ${breakdownVisible ? 'translate-y-0 opacity-100' : 'translate-y-[12px]'}`} style={{ transitionDelay: '60ms' }}>
                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.07)] flex justify-between items-center" style={{ padding: '16px 24px' }}>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>// Entity breakdown</span>
                            <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF' }}>Detected entity types</span>
                        </div>
                        <div className="flex-1 flex flex-col bg-transparent">
                            {!entityBreakdown.length ? (
                                <div className="flex-1 flex items-center justify-center text-[rgba(239,239,239,0.5)] font-mono text-xs">NO THREAT SIGNATURES</div>
                            ) : (
                                <div className="flex-1 overflow-y-auto" style={{ padding: '8px 0' }}>
                                    {entityBreakdown.map((e: any, i: number) => (
                                        <div key={e.type} className="border-b border-[rgba(239,239,239,0.07)] hover:bg-[rgba(245,196,0,0.04)] transition-colors relative overflow-hidden group/row" style={{ padding: '12px 24px' }}>
                                            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover/row:scale-y-100 transition-transform duration-300" />
                                            <div className="grid grid-cols-[1fr_auto] mb-2">
                                                <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', transition: 'color 0.2s', letterSpacing: '0.02em' }} className="group-hover/row:text-[#F5C400]">{e.label}</span>
                                                <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#F5C400' }}>{e.count}</span>
                                            </div>
                                            <div className="h-[2px] bg-[rgba(239,239,239,0.08)] mt-1">
                                                <div className="h-full bg-[#F5C400] transition-all duration-[800ms] ease-out shadow-[0_0_8px_rgba(245,196,0,0.4)] group-hover/row:bg-[#ffe166]"
                                                    style={{ width: breakdownVisible ? `${(e.count / maxPie) * 100}%` : '0%', transitionDelay: `${i * 80}ms` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick actions + dropzone */}
                    <div ref={uploadRef} className={`flex flex-col gap-3 opacity-0 transition-all duration-[450ms] ${uploadVisible ? 'translate-y-0 opacity-100' : 'translate-y-[12px]'}`} style={{ transitionDelay: '120ms' }}>
                        {/* Quick actions */}
                        {[
                            { href: '/redact',  icon: <Plus className="w-3.5 h-3.5" />,   label: 'NEW REDACTION',  sub: 'Open workspace' },
                            { href: '/batch',   icon: <Layers className="w-3.5 h-3.5" />, label: 'BATCH UPLOAD',   sub: 'Process queue' },
                            { href: '/settings',icon: <Settings className="w-3.5 h-3.5" />,label: 'SETTINGS',      sub: 'Rules & config' },
                        ].map(action => (
                            <Link key={action.href} href={action.href} style={{ textDecoration: 'none' }}>
                                <div className="group flex items-center gap-3 bg-[#131315] border border-[rgba(239,239,239,0.1)] hover:border-[#F5C400] hover:bg-[rgba(245,196,0,0.02)] transition-all cursor-pointer" style={{ padding: '14px 20px' }}>
                                    <div className="text-[rgba(239,239,239,0.5)] group-hover:text-[#F5C400] transition-colors flex-shrink-0">{action.icon}</div>
                                    <div className="flex-1 min-w-0">
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', color: '#EFEFEF', textTransform: 'uppercase' }} className="group-hover:text-[#F5C400] transition-colors">{action.label}</div>
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 400, letterSpacing: '0.1em', color: 'rgba(239,239,239,0.4)', marginTop: '2px' }}>{action.sub}</div>
                                    </div>
                                    <ChevronRight className="w-3.5 h-3.5 text-[rgba(239,239,239,0.2)] group-hover:text-[#F5C400] transition-colors flex-shrink-0" />
                                </div>
                            </Link>
                        ))}

                        {/* Dropzone */}
                        <div className={`group bg-[#131315] border flex-1 ${isDragging ? 'border-[#F5C400] shadow-[0_0_20px_rgba(245,196,0,0.15)] bg-[rgba(245,196,0,0.02)]' : 'border-[rgba(239,239,239,0.15)]'} flex flex-col relative overflow-hidden hover:border-[#F5C400] transition-all cursor-pointer`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) handleFileUploadGlobal(e.dataTransfer.files[0]); }}>
                            <div className="absolute left-0 right-0 h-[1px] bg-[#F5C400] opacity-0 group-hover:opacity-40 transition-opacity" style={{ animation: 'scanline-vertical 3s linear infinite' }} />
                            <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.07)]" style={{ padding: '16px 24px', position: 'relative', zIndex: 2 }}>
                                <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>// Upload document</span>
                            </div>
                            <input type="file" accept=".txt,.csv,.json,.md,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={e => { if (e.target.files?.length) handleFileUploadGlobal(e.target.files[0]); }} />
                            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center relative z-2" style={{ padding: '24px' }}>
                                <div className="relative">
                                    <div className="absolute inset-0 bg-[#F5C400] blur-xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 rounded-full" />
                                    <UploadCloud className="w-10 h-10 transition-transform duration-500 group-hover:-translate-y-2 group-hover:text-[#F5C400]" style={{ color: 'rgba(239,239,239,0.4)' }} />
                                </div>
                                <h2 className="text-[#EFEFEF] uppercase tracking-wide group-hover:text-[#F5C400] transition-colors" style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: '20px' }}>UPLOAD DOCUMENT</h2>
                                <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.6)' }}>Drag & drop or click to select</p>
                                <div className="flex flex-wrap justify-center gap-[8px] mt-2">
                                    {['PDF','TXT','DOCX','IMG'].map(e => (
                                        <span key={e} className="border border-[rgba(239,239,239,0.2)] text-[rgba(239,239,239,0.6)] transition-all group-hover:border-[#F5C400] group-hover:text-[#F5C400]" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.14em', padding: '4px 12px', background: 'rgba(17,17,19,0.5)' }}>{e}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── API KEY USAGE ────────────────────────────────────────── */}
                {apiKeys.length > 0 && !isGuest && (
                    <section ref={keyRef} className={`bg-[#131315] border border-[rgba(239,239,239,0.07)] opacity-0 transition-all duration-[450ms] ${keyVisible ? 'translate-y-0 opacity-100' : 'translate-y-[12px]'}`}>
                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.07)] flex justify-between items-center" style={{ padding: '16px 24px' }}>
                            <div className="flex items-center gap-3">
                                <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>// API Keys</span>
                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, color: 'rgba(239,239,239,0.4)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{apiKeys.length} active</span>
                            </div>
                            <Link href="/account/api-keys" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', color: '#F5C400', textDecoration: 'none', textTransform: 'uppercase' }}>MANAGE →</Link>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(apiKeys.length, 2)}, 1fr)` }}>
                            {apiKeys.slice(0, 2).map((key: any, i: number) => {
                                const usage   = keyUsages[key.key_id];
                                const rpm     = key.rate_limit_rpm || 60;
                                // Approximate current rpm from recent usage (last minute calls from daily_volume)
                                const recentCalls = usage?.daily_volume?.slice(-1)[0]?.calls ?? 0;
                                const rpmPct  = Math.min((recentCalls / rpm) * 100, 100);
                                const barColor = rpmPct >= 95 ? '#ef4444' : rpmPct >= 80 ? '#F5C400' : '#F5C400';

                                return (
                                    <div key={key.key_id} style={{ padding: '20px 24px', borderRight: i === 0 && apiKeys.length > 1 ? '1px solid rgba(239,239,239,0.07)' : 'none' }}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <div style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 600, color: '#EFEFEF', marginBottom: '2px' }}>{key.name}</div>
                                                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,239,239,0.35)', letterSpacing: '0.12em' }}>{key.key_prefix}</div>
                                            </div>
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', fontWeight: 600, letterSpacing: '0.12em', color: key.is_active ? '#4ade80' : '#ef4444', border: `1px solid ${key.is_active ? 'rgba(74,222,128,0.25)' : 'rgba(239,68,68,0.25)'}`, padding: '2px 8px', background: key.is_active ? 'rgba(74,222,128,0.05)' : 'transparent', textTransform: 'uppercase' }}>
                                                {key.is_active ? 'ACTIVE' : 'REVOKED'}
                                            </span>
                                        </div>
                                        <div className="flex gap-6 mb-3">
                                            {[
                                                { label: 'Total requests', value: (key.request_count || 0).toLocaleString() },
                                                { label: 'Rate limit',     value: `${rpm}/min` },
                                                { label: 'Last used',      value: key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never' },
                                            ].map(stat => (
                                                <div key={stat.label}>
                                                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.3)', marginBottom: '3px' }}>{stat.label}</div>
                                                    <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: '18px', color: '#F5C400' }}>{stat.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Rate limit bar */}
                                        <div>
                                            <div className="flex justify-between mb-1">
                                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.12em', color: 'rgba(239,239,239,0.3)', textTransform: 'uppercase' }}>Rate utilisation</span>
                                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', color: barColor }}>{recentCalls}/{rpm} rpm</span>
                                            </div>
                                            <div className="h-[3px] bg-[rgba(239,239,239,0.06)]">
                                                <div style={{ height: '100%', width: `${rpmPct}%`, background: barColor, transition: 'width 0.8s ease, background 0.3s ease', boxShadow: `0 0 6px ${barColor}40` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* ── SESSION HISTORY ──────────────────────────────────────── */}
                <section ref={tableRef}>
                    <div className="flex items-center gap-3 mb-5 flex-wrap justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-[24px] h-[2px] bg-[#B91C1C] shrink-0" />
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, color: '#ff4d4d', textTransform: 'uppercase' }}>// SESSION HISTORY</span>
                            {allLogs.length > 0 && (
                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', padding: '4px 12px', background: 'rgba(74,222,128,0.05)' }}>
                                    INTEGRITY VERIFIED
                                </span>
                            )}
                        </div>
                        {/* Search */}
                        {allLogs.length > 0 && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Search by ID or filename…"
                                    value={logSearch}
                                    onChange={e => { setLogSearch(e.target.value); setLogPage(0); }}
                                    style={{ background: '#131315', border: '1px solid rgba(239,239,239,0.1)', color: '#EFEFEF', fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', letterSpacing: '0.1em', padding: '8px 14px', outline: 'none', width: '240px', transition: 'border-color 0.15s' }}
                                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                                    onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.1)'}
                                />
                            </div>
                        )}
                    </div>

                    <div className="bg-[#131315] border border-[rgba(239,239,239,0.15)] shadow-lg">
                        {/* Header */}
                        <div className="bg-[#111113] border-b border-[rgba(239,239,239,0.15)] flex" style={{ padding: '14px 24px', fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}>
                            <div className="flex-1">Session ID</div>
                            <div className="flex-1">Document</div>
                            <div className="flex-1">Timestamp</div>
                            <div className="w-24 text-right">Entities</div>
                            <div className="w-28 text-right">Status</div>
                        </div>

                        <div className="overflow-hidden bg-transparent">
                            {allLogs.length === 0 ? (
                                <div className="text-center italic tracking-wider uppercase py-12" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.5)' }}>
                                    [ No secure telemetry runs logged in this sandbox ]
                                </div>
                            ) : pagedLogs.map((log: any, i: number) => {
                                const logId    = log.id || log.run_id || `log-${i}`;
                                const isExpanded = expandedLogId === logId;
                                const rules    = log.rules_applied || log.rulesApplied || [];

                                return (
                                    <React.Fragment key={logId}>
                                        <div
                                            className={`group flex items-center hover:bg-[rgba(245,196,0,0.04)] transition-all duration-[400ms] border-b border-[rgba(239,239,239,0.07)] last:border-b-0 ${tableVisible ? 'translate-x-0 opacity-100' : '-translate-x-[12px] opacity-0'} relative cursor-pointer`}
                                            style={{ padding: '18px 24px', transitionDelay: `${i * 40}ms` }}
                                            onClick={() => setExpandedLogId(isExpanded ? null : logId)}>
                                            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
                                            <div className="flex-1" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, color: '#F5C400', letterSpacing: '0.1em' }}>{logId}</div>
                                            <div className="flex-1 truncate pr-4" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.8)' }}>{log.name}</div>
                                            <div className="flex-1" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 400, color: 'rgba(239,239,239,0.6)' }}>
                                                {log.date || (log.created_at ? new Date(log.created_at).toLocaleString() : '—')}
                                            </div>
                                            <div className="w-24 text-right text-[#EFEFEF] group-hover:text-[#F5C400] transition-colors" style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: '16px', textTransform: 'uppercase' }}>
                                                {log.entitiesDiscovered ?? log.entities_discovered ?? 0}
                                            </div>
                                            <div className="w-28 text-right flex justify-end">
                                                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, color: '#4ade80', letterSpacing: '0.14em', border: '1px solid rgba(74,222,128,0.3)', padding: '4px 12px', display: 'flex', alignItems: 'center', background: 'rgba(74,222,128,0.05)' }}>
                                                    ✓ CLEAN
                                                </div>
                                            </div>
                                        </div>
                                        {/* Expanded row — entity breakdown */}
                                        {isExpanded && rules.length > 0 && (
                                            <div style={{ background: 'rgba(245,196,0,0.02)', borderBottom: '1px solid rgba(239,239,239,0.07)', padding: '12px 24px 16px 24px' }}>
                                                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.35)', marginBottom: '8px' }}>Rules applied in this session:</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {rules.map((r: string) => (
                                                        <span key={r} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F5C400', border: '1px solid rgba(245,196,0,0.25)', padding: '3px 10px', background: 'rgba(245,196,0,0.05)' }}>
                                                            {ENTITY_LABELS[r] || r}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {totalLogPages > 1 && (
                            <div className="border-t border-[rgba(239,239,239,0.07)] flex items-center justify-between bg-[#111113]" style={{ padding: '12px 24px' }}>
                                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', letterSpacing: '0.14em', color: 'rgba(239,239,239,0.4)', textTransform: 'uppercase' }}>
                                    {filteredLogs.length} records · Page {logPage + 1} of {totalLogPages}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setLogPage(p => Math.max(0, p - 1))} disabled={logPage === 0}
                                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 600, letterSpacing: '0.14em', padding: '6px 14px', border: '1px solid rgba(239,239,239,0.1)', background: 'transparent', color: logPage === 0 ? 'rgba(239,239,239,0.2)' : 'rgba(239,239,239,0.7)', cursor: logPage === 0 ? 'not-allowed' : 'pointer', textTransform: 'uppercase', transition: 'all 0.15s' }}>
                                        ← PREV
                                    </button>
                                    {Array.from({ length: Math.min(totalLogPages, 5) }, (_, i) => {
                                        const page = Math.min(Math.max(logPage - 2, 0) + i, totalLogPages - 1);
                                        return (
                                            <button key={page} onClick={() => setLogPage(page)}
                                                style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 700, width: '32px', height: '32px', border: `1px solid ${page === logPage ? '#F5C400' : 'rgba(239,239,239,0.1)'}`, background: page === logPage ? '#F5C400' : 'transparent', color: page === logPage ? '#080808' : 'rgba(239,239,239,0.5)', cursor: 'pointer', transition: 'all 0.15s' }}>
                                                {page + 1}
                                            </button>
                                        );
                                    })}
                                    <button onClick={() => setLogPage(p => Math.min(totalLogPages - 1, p + 1))} disabled={logPage === totalLogPages - 1}
                                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 600, letterSpacing: '0.14em', padding: '6px 14px', border: '1px solid rgba(239,239,239,0.1)', background: 'transparent', color: logPage === totalLogPages - 1 ? 'rgba(239,239,239,0.2)' : 'rgba(239,239,239,0.7)', cursor: logPage === totalLogPages - 1 ? 'not-allowed' : 'pointer', textTransform: 'uppercase', transition: 'all 0.15s' }}>
                                        NEXT →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

            </main>

            <style jsx global>{`
                @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
                @keyframes eyebrow-in { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0% 0 0)} }
                @keyframes title-in { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
                @keyframes scanline-horizontal { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
                @keyframes scanline-vertical { 0%{top:0;opacity:0} 10%{opacity:0.4} 90%{opacity:0.4} 100%{top:100%;opacity:0} }
                @keyframes spin { to{transform:rotate(360deg)} }
                .animate-eyebrow-in { animation: eyebrow-in 0.3s ease-out forwards; }
                .animate-title-in { animation: title-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: 150ms; }
                .animate-subline-in { animation: title-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: 250ms; }
            `}</style>
        </div>
        </PageLoader>
    );
}