"use client";

import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { ApiKeyManager } from '@/components/settings/ApiKeyManager';
import { PageLoader } from '@/components/layout/PageLoader';

type Tab = 'detection' | 'api' | 'about';

const TAB_CONFIG: { id: Tab; label: string }[] = [
    { id: 'detection', label: 'DETECTION' },
    { id: 'api',       label: 'API KEYS' },
    { id: 'about',     label: 'SYSTEM' },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab]     = useState<Tab>('detection');
    const [backendStatus, setBackendStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
    const [backendInfo,   setBackendInfo]   = useState<any>(null);
    const { rules, setRuleAction } = useDocumentStore();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const checkBackend = async () => {
        try {
            const r    = await fetch('http://127.0.0.1:8000/api/v3/health');
            const data = await r.json();
            setBackendStatus('ok');
            setBackendInfo(data);
        } catch {
            setBackendStatus('error');
        }
    };

    useEffect(() => { checkBackend(); }, []);

    return (
        <PageLoader page="settings">
        <div className="w-full p-6 md:p-10 min-h-screen selection:bg-[#F5C400] selection:text-black bg-[#0d0d0d]">
            <main className="max-w-4xl mx-auto space-y-10 pb-16 relative">
                
                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 animate-header-in border-b border-[rgba(239,239,239,0.07)]">
                    <div>
                        <div className="flex items-center gap-3 mb-3 w-fit animate-eyebrow-in" style={{ clipPath: 'inset(0 100% 0 0)' }}>
                            <div className="w-[24px] h-[2px] bg-[#B91C1C] shrink-0" />
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, letterSpacing: '0.24em', color: '#ff4d4d', textTransform: 'uppercase' }}>
                                // SETTINGS
                            </span>
                        </div>
                        <h1 className="text-[#EFEFEF] uppercase animate-title-in opacity-0 drop-shadow-md"
                            style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: 1, letterSpacing: '0.02em' }}>
                            PIPELINE SETTINGS
                        </h1>
                        <p className="animate-subline-in opacity-0" style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.04em', marginTop: '12px' }}>
                            Configure detection stages · Manage API keys · System information
                        </p>
                    </div>
                    <div style={{ border: '1px solid rgba(74,222,128,0.4)', padding: '8px 20px', borderRadius: 0, backgroundColor: 'rgba(74,222,128,0.05)' }} 
                        className="flex items-center gap-3 shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                        <div className="w-1.5 h-1.5 bg-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.8)]" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', color: '#4ade80' }}>
                            BACKEND: {backendStatus === 'ok' ? 'ONLINE' : backendStatus === 'error' ? 'OFFLINE' : 'CHECKING…'}
                        </span>
                    </div>
                </header>

                {/* Tab Bar */}
                <div className="flex bg-transparent relative" style={{ borderBottom: '1px solid rgba(239,239,239,0.1)' }}>
                    {TAB_CONFIG.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: activeTab === tab.id ? 600 : 500, letterSpacing: '0.18em', padding: '16px 32px', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                                color: activeTab === tab.id ? '#F5C400' : 'rgba(239,239,239,0.6)',
                                borderBottom: activeTab === tab.id ? '2px solid #F5C400' : '2px solid transparent',
                                background: activeTab === tab.id ? 'rgba(245,196,0,0.04)' : 'transparent',
                            }}
                            className={`transition-all duration-200 ease-in-out ${activeTab !== tab.id ? 'hover:text-[#EFEFEF] hover:bg-[rgba(239,239,239,0.02)]' : ''}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Detection Engine Tab ────────────────────────────────── */}
                {activeTab === 'detection' && (
                    <div className="space-y-10 animate-tab-in">

                        {/* Redaction Rules */}
                        <div>
                            <div className="mb-5">
                                <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', margin: 0, letterSpacing: '0.03em' }}>
                                    REDACTION RULES
                                </h3>
                                <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.6)', lineHeight: 1.7, marginTop: '6px' }}>
                                    Set the default action for each entity type when a document is processed.
                                </p>
                            </div>
                            <div className="bg-[#131315] border border-[rgba(239,239,239,0.15)]" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                                {([
                                    { id: 'names',      label: 'Names' },
                                    { id: 'email',      label: 'Email' },
                                    { id: 'phone',      label: 'Phone' },
                                    { id: 'dob',        label: 'Date of Birth' },
                                    { id: 'aadhaar',    label: 'Aadhaar' },
                                    { id: 'pan',        label: 'PAN' },
                                    { id: 'creditCard', label: 'Credit Card' },
                                    { id: 'ssn',        label: 'SSN / TIN' },
                                    { id: 'gst',        label: 'GST / GSTIN' },
                                    { id: 'ifsc',       label: 'IFSC Code' },
                                    { id: 'voterId',    label: 'Voter ID' },
                                    { id: 'passport',   label: 'Passport' },
                                ] as { id: RuleType; label: string }[]).map((rule, idx) => (
                                    <div key={rule.id} className="group grid items-center hover:bg-[rgba(245,196,0,0.03)] transition-colors relative" 
                                        style={{ gridTemplateColumns: '1fr auto', borderRight: '1px solid rgba(239,239,239,0.07)', borderBottom: '1px solid rgba(239,239,239,0.07)', padding: '16px 20px' }}>
                                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
                                        <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '15px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }} className="group-hover:text-[#F5C400] transition-colors">{rule.label}</span>
                                        <select
                                            value={rules[rule.id]?.action || 'replace'}
                                            onChange={e => setRuleAction(rule.id, e.target.value as any)}
                                            style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, letterSpacing: '0.02em', color: '#EFEFEF', padding: '6px 14px' }}
                                            className="bg-[#0d0d0d] border border-[rgba(239,239,239,0.15)] focus:outline-none focus:border-[#F5C400] hover:border-[rgba(239,239,239,0.4)] transition-colors cursor-pointer appearance-none outline-none"
                                        >
                                            <option value="replace" className="bg-[#131315]">Replace</option>
                                            <option value="blackout" className="bg-[#131315]">Blackout</option>
                                            <option value="mask" className="bg-[#131315]">Mask</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pipeline info */}
                        <div className="relative overflow-hidden group">
                            {/* Scanner Line Animation */}
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-[rgba(245,196,0,0.15)] z-10 pointer-events-none" style={{ animation: 'scanner 5s linear infinite' }} />
                            
                            <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', marginTop: '8px', marginBottom: '20px', letterSpacing: '0.03em' }}>
                                DETECTION PIPELINE
                            </h3>
                            <div className="space-y-[2px]">
                                {[
                                    { stage: 'STAGE 01', name: 'Pattern-Based Regex Engine', desc: 'Syntax-level detection for highly structured signatures (Aadhaar, PAN, phone).', weight: '1.4× WEIGHT' },
                                    { stage: 'STAGE 02', name: 'Microsoft Presidio NLP Core',  desc: 'Contextual natural language analysis using 28 distinct local entity recognizers.',   weight: '1.0× WEIGHT' },
                                    { stage: 'STAGE 03', name: 'spaCy Neural Transformer',     desc: 'Named Entity Recognition (NER) powered by a localized transformer pipeline.',         weight: '0.9× WEIGHT' },
                                    { stage: 'STAGE 04', name: 'Voting Ensemble Array',        desc: 'Aggregates votes across all engines with active type-lock verification at ≥0.80.', weight: 'FINAL' },
                                ].map((s, i) => (
                                    <div key={s.stage} className="group/stage grid items-center bg-[#131315] border border-[rgba(239,239,239,0.15)] hover:border-[rgba(245,196,0,0.3)] hover:shadow-[0_0_15px_rgba(245,196,0,0.05)] transition-all animate-stage-in opacity-0 relative overflow-hidden"
                                        style={{ gridTemplateColumns: '90px 1fr auto', padding: '22px 24px', gap: '20px', animationDelay: `${i * 80}ms` }}>
                                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover/stage:scale-y-100 transition-transform duration-300" />
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.14em', color: 'rgba(239,239,239,0.6)', border: '1px solid rgba(239,239,239,0.2)', padding: '5px 12px', textAlign: 'center', background: '#0d0d0d' }} className="group-hover/stage:border-[#F5C400] group-hover/stage:text-[#F5C400] transition-colors">
                                            {s.stage}
                                        </div>
                                        <div className="min-w-0">
                                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '15px', fontWeight: 700, color: '#EFEFEF', margin: 0 }} className="group-hover/stage:text-[#F5C400] transition-colors">{s.name}</p>
                                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.55)', lineHeight: 1.6, marginTop: '6px' }}>{s.desc}</p>
                                        </div>
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#F5C400' }}>
                                            {s.weight}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── API Keys Tab ─────────────────────────────────────────── */}
                {activeTab === 'api' && (
                    <div className="animate-tab-in">
                        <ApiKeyManager />
                    </div>
                )}

                {/* ── System Info Tab ──────────────────────────────────────── */}
                {activeTab === 'about' && (
                    <div className="animate-tab-in space-y-10">
                        {/* Status */}
                        <div>
                            <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', marginBottom: '20px', letterSpacing: '0.03em' }}>
                                SYSTEM STATUS
                            </h3>
                            <div className="bg-[#131315] border border-[rgba(239,239,239,0.15)] shadow-lg">
                                {[
                                    { label: 'ENGINE VERSION',   value: backendInfo?.version || '3.3.0', hl: false },
                                    { label: 'PIPELINE STATUS',  value: backendInfo?.status || 'ACTIVE', hl: true, isOk: backendStatus === 'ok' },
                                    { label: 'ACTIVE PORTALS', value: `${backendInfo?.endpoints?.length || 8} ENDPOINTS READY`, hl: false },
                                ].map((item, idx) => (
                                    <div key={item.label} className="group flex justify-between items-center border-b border-[rgba(239,239,239,0.07)] last:border-b-0 hover:bg-[rgba(245,196,0,0.02)] transition-colors relative" style={{ padding: '18px 24px' }}>
                                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
                                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, letterSpacing: '0.14em', color: 'rgba(239,239,239,0.6)' }}>{item.label}</span>
                                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, color: item.hl ? (item.isOk ? '#4ade80' : '#F5C400') : '#EFEFEF' }}>{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Stack */}
                        <div>
                            <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', marginBottom: '20px', letterSpacing: '0.03em' }}>
                                SYSTEM STACK
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[2px]">
                                {[
                                    { name: 'Next.js 16',        role: 'FRONTEND MODULE', active: true },
                                    { name: 'FastAPI Core',      role: 'LOCAL GATEWAY',   active: true },
                                    { name: 'spaCy 3.8',         role: 'NER CORE',        active: true },
                                    { name: 'Presidio 2.2',      role: 'NLP PARSER',      active: true },
                                    { name: 'Groq LLaMA Node',   role: 'CONTEXT AGENT',   active: false },
                                    { name: 'React Konva',       role: 'SANDBOX CANVAS',  active: true },
                                    { name: 'Tesseract WASM',    role: 'OCR ENGINE',      active: true },
                                    { name: 'Docker Shield',     role: 'CONTAINER GATE',  active: true },
                                ].map((s, i) => (
                                    <div key={s.name} className="group flex items-center gap-4 bg-[#131315] border border-[rgba(239,239,239,0.15)] hover:border-[rgba(245,196,0,0.3)] hover:shadow-[0_0_12px_rgba(245,196,0,0.05)] transition-all relative overflow-hidden" style={{ padding: '18px 22px' }}>
                                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
                                        <div className="w-[7px] h-[7px] rounded-full shrink-0 shadow-lg" style={{ backgroundColor: s.active ? '#4ade80' : 'rgba(239,239,239,0.25)', boxShadow: s.active ? '0 0 8px rgba(74,222,128,0.5)' : 'none' }} />
                                        <div>
                                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '14px', fontWeight: 700, color: '#EFEFEF', margin: 0 }} className="group-hover:text-[#F5C400] transition-colors">{s.name}</p>
                                            <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, color: 'rgba(239,239,239,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '4px' }}>{s.role}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Compliance */}
                        <div>
                            <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', marginBottom: '8px', letterSpacing: '0.03em' }}>
                                REGULATORY COMPLIANCE
                            </h3>
                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.55)', marginBottom: '20px' }}>
                                Ciphera local inference models are statically configured to satisfy requirements under:
                            </p>
                            <div className="flex flex-wrap gap-[10px]">
                                {['DPDP ACT 2023 // SEC 4(A)','GDPR ARTICLE 25','ISO 27001 ENCRYPT','IT ACT 2000 // SEC 43'].map(c => (
                                    <span key={c} style={{
                                        fontFamily: '"IBM Plex Mono", monospace',
                                        fontSize: '10px',
                                        fontWeight: 500,
                                        letterSpacing: '0.14em',
                                        color: 'rgba(239,239,239,0.6)',
                                        border: '1px solid rgba(239,239,239,0.2)',
                                        padding: '6px 14px',
                                        background: '#131315',
                                    }} className="hover:border-[#F5C400] hover:text-[#F5C400] hover:shadow-[0_0_10px_rgba(245,196,0,0.1)] transition-all cursor-default">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
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
                @keyframes tab-in {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes stage-in {
                    from { transform: translateX(-10px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes scanner {
                    0% { transform: translateY(0); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateY(350px); opacity: 0; }
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
                .animate-tab-in {
                    animation: tab-in 0.3s ease-out forwards;
                }
                .animate-stage-in {
                    animation: stage-in 0.45s ease forwards;
                }
            `}</style>
        </div>
        </PageLoader>
    );
}