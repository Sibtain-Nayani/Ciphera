"use client";

import React, { useState } from 'react';
import {
    Settings, Sliders, Key, Cpu, AlertCircle,
} from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { ApiKeyManager } from '@/components/settings/ApiKeyManager';
import { PageLoader } from '@/components/layout/PageLoader';

type Tab = 'detection' | 'api' | 'about';

const TAB_CONFIG: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'detection', label: 'Detection Engine',  icon: <Sliders className="w-4 h-4" /> },
    { id: 'api',       label: 'API Keys',           icon: <Key className="w-4 h-4" /> },
    { id: 'about',     label: 'System Info',        icon: <Cpu className="w-4 h-4" /> },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab]     = useState<Tab>('detection');
    const [backendStatus, setBackendStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
    const [backendInfo,   setBackendInfo]   = useState<any>(null);
    const { rules, setRuleAction } = useDocumentStore();

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

    React.useEffect(() => { checkBackend(); }, []);

    const textSharpness: React.CSSProperties = {
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
    };

    return (
        <PageLoader page="settings">
        <div className="w-full p-6 md:p-10 min-h-screen selection:bg-[#F5C400] selection:text-black" style={{ background: 'transparent' }}>
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-[18px] h-[2px] bg-red-700 shrink-0" />
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase', ...textSharpness }}>
                                // PIPELINE CONTROL GATEWAY
                            </span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase', ...textSharpness }}>
                            <Settings className="w-5 h-5 text-[#F472B6]" />
                            Engine Config Console
                        </h1>
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'rgba(239,239,239,0.38)', letterSpacing: '0.08em', marginTop: '4px', ...textSharpness }}>
                            CALIBRATE PIPELINE STAGES · MANAGE SECURE ACCESS CREDS · MONITOR STACK TELEMETRY
                        </p>
                    </div>
                    <div style={{
                        border: backendStatus === 'ok' ? '1px solid rgba(52,211,153,0.25)' : backendStatus === 'error' ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.06)',
                        background: backendStatus === 'ok' ? 'rgba(52,211,153,0.05)' : backendStatus === 'error' ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '11px',
                        letterSpacing: '0.05em',
                        ...textSharpness
                    }} className="flex items-center gap-2 px-3 py-1.5 rounded-none shrink-0 font-bold">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                            backendStatus === 'ok' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#34d399]' :
                            backendStatus === 'error' ? 'bg-red-500 shadow-[0_0_8px_#f87171]' : 'bg-gray-600'
                        }`} />
                        {backendStatus === 'ok' ? 'CORE BACKEND: ONLINE' : backendStatus === 'error' ? 'CORE BACKEND: OFFLINE' : 'CHECKING STATUS…'}
                    </div>
                </header>

                {/* Tabs Selector Console */}
                <div className="flex p-1 bg-[#080808] border border-white/5 rounded-none">
                    {TAB_CONFIG.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', letterSpacing: '0.05em', fontWeight: 700 }}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-none transition-all cursor-pointer ${
                                activeTab === tab.id
                                    ? 'bg-[#F5C400] text-black shadow-[0_0_10px_rgba(245,196,0,0.15)]'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            }`}>
                            {tab.icon}
                            <span className="hidden sm:inline uppercase">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* ── Detection Engine Tab ────────────────────────────────── */}
                {activeTab === 'detection' && (
                    <div className="space-y-6">

                        {/* Default actions per rule type */}
                        <div className="bg-[#080808] border border-white/5 rounded-none overflow-hidden">
                            <div className="px-5 py-4 border-b border-white/10 bg-[#080808]">
                                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '18px', ...textSharpness }} className="font-bold text-white uppercase tracking-wide">
                                    Default De-identification Actions
                                </h3>
                                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'rgba(239,239,239,0.38)', ...textSharpness }} className="mt-1">
                                    Define global mask parameters for matching PII signatures inside the secure sandbox.
                                </p>
                            </div>
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#030303]">
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
                                ] as { id: RuleType; label: string }[]).map(rule => (
                                    <div key={rule.id} className="flex items-center justify-between px-3 py-2 bg-[#080808] rounded-none border border-white/5">
                                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.7)', ...textSharpness }}>{rule.label}</span>
                                        <select
                                            value={rules[rule.id]?.action || 'replace'}
                                            onChange={e => setRuleAction(rule.id, e.target.value as any)}
                                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px' }}
                                            className="bg-black border border-white/5 text-gray-300 rounded-none px-2 py-1 focus:outline-none focus:border-[#F5C400]/40 cursor-pointer"
                                        >
                                            <option value="replace">REPLACE (PSEUDONYM)</option>
                                            <option value="blackout">BLACKOUT (SOLID BLOCK)</option>
                                            <option value="mask">PARTIAL MASK (CHAR HASH)</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pipeline info */}
                        <div className="bg-[#080808] border border-white/5 rounded-none p-5">
                            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '18px', ...textSharpness }} className="font-bold text-white mb-4 uppercase tracking-wide">
                                Neural Verification Stages
                            </h3>
                            <div className="space-y-3">
                                {[
                                    { stage: 'Stage 1', name: 'Pattern-Based Regex Engine', desc: 'Syntax-level detection for highly structured signatures (Aadhaar, PAN, phone).', weight: '1.4× WEIGHT', color: '#F97316' },
                                    { stage: 'Stage 2', name: 'Microsoft Presidio NLP Core',  desc: 'Contextual natural language analysis using 28 distinct local entity recognizers.',   weight: '1.0× WEIGHT', color: '#60A5FA' },
                                    { stage: 'Stage 3', name: 'spaCy Neural Transformer',     desc: 'Named Entity Recognition (NER) powered by a localized transformer pipeline.',         weight: '0.9× WEIGHT', color: '#34D399' },
                                    { stage: 'Stage 4', name: 'Voting Ensemble Array',        desc: 'Aggregates votes across all engines with active type-lock verification at ≥0.80.', weight: 'VERDICT',    color: '#F5C400' },
                                ].map(s => (
                                    <div key={s.stage} className="flex items-start gap-4 p-3.5 rounded-none bg-[#030303] border border-white/5">
                                        <div className="shrink-0 px-2.5 py-0.5 rounded-none text-[9px] font-mono font-bold border mt-0.5"
                                            style={{ backgroundColor: s.color + '15', color: s.color, borderColor: s.color + '30', fontFamily: "'IBM Plex Mono', monospace" }}>
                                            {s.stage}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', fontWeight: 600, color: '#fff', ...textSharpness }}>{s.name}</p>
                                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'rgba(239,239,239,0.3)' }}>{s.weight}</span>
                                            </div>
                                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'rgba(239,239,239,0.38)', ...textSharpness }} className="mt-1">{s.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── API Keys Tab ─────────────────────────────────────────── */}
                {activeTab === 'api' && <ApiKeyManager />}

                {/* ── System Info Tab ──────────────────────────────────────── */}
                {activeTab === 'about' && (
                    <div className="space-y-6">
                        <div className="bg-[#080808] border border-white/5 rounded-none p-5 space-y-4">
                            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '18px', ...textSharpness }} className="font-bold text-white uppercase tracking-wide">
                                Sandbox Telemetry Status
                            </h3>
                            {backendStatus === 'ok' && backendInfo ? (
                                <div className="space-y-1" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', ...textSharpness }}>
                                    {[
                                        { label: 'ENGINE VERSION',   value: backendInfo.version || '3.3.0' },
                                        { label: 'PIPELINE STATUS',  value: backendInfo.status || 'ACTIVE' },
                                        { label: 'ACTIVE PORTALS', value: `${backendInfo.endpoints?.length || 8} ENDPOINTS READY` },
                                    ].map(item => (
                                        <div key={item.label} className="flex justify-between items-center py-2.5 border-b border-white/5 last:border-0">
                                            <span className="text-gray-500">{item.label}</span>
                                            <span className="text-white font-bold">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2.5 text-red-400 text-xs font-mono p-3 bg-red-500/5 border border-red-500/10" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>LOCAL INFERENCE BACKEND UNREACHABLE. MOUNT AND START WITH ENGINE CONSOLE GUIDES.</span>
                                </div>
                            )}
                        </div>

                        <div className="bg-[#080808] border border-white/5 rounded-none p-5">
                            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '18px', ...textSharpness }} className="font-bold text-white mb-4 uppercase tracking-wide">
                                System Sandbox Stack
                            </h3>
                            <div className="grid grid-cols-2 gap-3 bg-[#030303] p-3 border border-white/5">
                                {[
                                    { name: 'Next.js 16',        role: 'FRONTEND MODULE', color: '#FFFFFF' },
                                    { name: 'FastAPI Core',      role: 'LOCAL GATEWAY',   color: '#009688' },
                                    { name: 'spaCy 3.8',         role: 'NER CORE',        color: '#09A3D5' },
                                    { name: 'Presidio 2.2',      role: 'NLP PARSER',      color: '#0078D4' },
                                    { name: 'Groq LLaMA Node',   role: 'CONTEXT AGENT',   color: '#F55036' },
                                    { name: 'React Konva',       role: 'SANDBOX CANVAS',  color: '#E91E63' },
                                    { name: 'Tesseract WASM',    role: 'OCR ENGINE',      color: '#4CAF50' },
                                    { name: 'Docker Shield',     role: 'CONTAINER GATE',  color: '#2496ED' },
                                ].map(s => (
                                    <div key={s.name} className="flex items-center gap-3 p-3 rounded-none bg-[#080808] border border-white/5">
                                        <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                                        <div>
                                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', fontWeight: 700, color: '#fff', ...textSharpness }}>{s.name}</p>
                                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: 'rgba(239,239,239,0.25)' }}>{s.role}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-[#080808] border border-white/5 rounded-none p-5">
                            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '18px', ...textSharpness }} className="font-bold text-white mb-2 uppercase tracking-wide">
                                Regulatory Compliance Calibrations
                            </h3>
                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'rgba(239,239,239,0.38)', ...textSharpness }} className="mb-4">
                                Ciphera local inference models are statically configured to satisfy requirements under:
                            </p>
                            <div className="flex flex-wrap gap-2.5">
                                {['DPDP ACT 2023 // SEC 4(A)','GDPR ARTICLE 25','ISO 27001 ENCRYPT','IT ACT 2000 // SEC 43'].map(c => (
                                    <span key={c} style={{
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        color: '#34D399',
                                        background: 'rgba(52,211,153,0.05)',
                                        border: '1px solid rgba(52,211,153,0.2)',
                                        ...textSharpness
                                    }} className="px-3 py-1.5 rounded-none">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
        </PageLoader>
    );
}