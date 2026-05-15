"use client";

/**
 * Settings Page — Engine Config
 * Place at: v3/frontend/src/app/settings/page.tsx
 */

import React, { useState } from 'react';
import {
    Settings, Shield, Sliders, Key, Code2,
    ChevronDown, CheckCircle2, AlertCircle,
    Cpu, Zap, Database,
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

    return (
        <PageLoader page="settings">
        <div className="w-full p-6 md:p-10 font-sans min-h-screen selection:bg-[#FFA500] selection:text-black">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex items-center justify-between pb-4 border-b border-[#2A2A2A]">
                    <div>
                        <h1 className="text-xl font-semibold text-white flex items-center gap-2.5">
                            <Settings className="w-5 h-5 text-[#F472B6]" />
                            Engine Config
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Detection pipeline · API access · System information</p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono ${
                        backendStatus === 'ok'    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        backendStatus === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                        'bg-[#1E1E1E] border-[#2A2A2A] text-gray-500'
                    }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                            backendStatus === 'ok' ? 'bg-emerald-500 animate-pulse' :
                            backendStatus === 'error' ? 'bg-red-500' : 'bg-gray-600'
                        }`} />
                        {backendStatus === 'ok' ? 'Backend Online' : backendStatus === 'error' ? 'Backend Offline' : 'Checking…'}
                    </div>
                </header>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-[#141414] border border-[#2A2A2A] rounded-xl">
                    {TAB_CONFIG.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                                activeTab === tab.id
                                    ? 'bg-[#FFA500] text-black'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-[#1E1E1E]'
                            }`}>
                            {tab.icon}
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* ── Detection Engine Tab ────────────────────────────────── */}
                {activeTab === 'detection' && (
                    <div className="space-y-4">

                        {/* Default actions per rule type */}
                        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-[#2A2A2A]">
                                <h3 className="text-sm font-semibold text-white">Default Redaction Actions</h3>
                                <p className="text-xs text-gray-500 mt-1">Set the default action for each entity type — replace with pseudonym, blackout, or mask partially.</p>
                            </div>
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                    <div key={rule.id} className="flex items-center justify-between px-3 py-2.5 bg-[#1A1A1A] rounded-xl border border-[#2A2A2A]">
                                        <span className="text-sm text-gray-300">{rule.label}</span>
                                        <select
                                            value={rules[rule.id]?.action || 'replace'}
                                            onChange={e => setRuleAction(rule.id, e.target.value as any)}
                                            className="bg-[#252525] border border-[#2A2A2A] text-xs text-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#FFA500]/50 cursor-pointer"
                                        >
                                            <option value="replace">Replace (pseudonym)</option>
                                            <option value="blackout">Blackout</option>
                                            <option value="mask">Partial mask</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pipeline info */}
                        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
                            <h3 className="text-sm font-semibold text-white mb-3">Detection Pipeline</h3>
                            <div className="space-y-2">
                                {[
                                    { stage: 'Stage 1', name: 'Regex Engine',    desc: 'Pattern-based detection for structured PII (Aadhaar, PAN, phone)', weight: '1.4×', color: '#F97316' },
                                    { stage: 'Stage 2', name: 'Presidio NLP',    desc: '28 recognizers including Indian PII patterns',                    weight: '1.0×', color: '#60A5FA' },
                                    { stage: 'Stage 3', name: 'spaCy NER',       desc: 'en_core_web_lg transformer model for named entity recognition',    weight: '0.9×', color: '#34D399' },
                                    { stage: 'Stage 4', name: 'Voting Ensemble', desc: 'Weighted merge across all stages with type-lock at ≥0.80',         weight: '—',    color: '#FFA500' },
                                ].map(s => (
                                    <div key={s.stage} className="flex items-start gap-3 p-3 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A]">
                                        <div className="shrink-0 px-2 py-0.5 rounded text-[9px] font-mono font-bold border mt-0.5"
                                            style={{ backgroundColor: s.color + '15', color: s.color, borderColor: s.color + '30' }}>
                                            {s.stage}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium text-white">{s.name}</p>
                                                <span className="text-[10px] font-mono text-gray-600">{s.weight}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-0.5">{s.desc}</p>
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
                    <div className="space-y-4">
                        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5 space-y-4">
                            <h3 className="text-sm font-semibold text-white">Backend Status</h3>
                            {backendStatus === 'ok' && backendInfo ? (
                                <div className="space-y-2">
                                    {[
                                        { label: 'Version',   value: backendInfo.version || '3.3.0' },
                                        { label: 'Status',    value: backendInfo.status },
                                        { label: 'Endpoints', value: `${backendInfo.endpoints?.length || 8} active` },
                                    ].map(item => (
                                        <div key={item.label} className="flex justify-between items-center py-2 border-b border-[#2A2A2A] last:border-0">
                                            <span className="text-sm text-gray-500">{item.label}</span>
                                            <span className="text-sm font-mono text-white">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    Backend unreachable. Start with: <code className="font-mono text-[11px] bg-[#1E1E1E] px-2 py-0.5 rounded">uvicorn main:app --reload --port 8000</code>
                                </div>
                            )}
                        </div>

                        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
                            <h3 className="text-sm font-semibold text-white mb-3">Stack</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { name: 'Next.js 16',        role: 'Frontend framework',    color: '#FFFFFF' },
                                    { name: 'FastAPI',           role: 'Backend API',           color: '#009688' },
                                    { name: 'spaCy 3.8',         role: 'NER pipeline',          color: '#09A3D5' },
                                    { name: 'Presidio 2.2',      role: 'PII detection',         color: '#0078D4' },
                                    { name: 'Groq LLaMA',        role: 'Contextual scoring',    color: '#F55036' },
                                    { name: 'React Konva',       role: 'Canvas redaction',      color: '#E91E63' },
                                    { name: 'Tesseract WASM',    role: 'OCR pipeline',          color: '#4CAF50' },
                                    { name: 'Docker',            role: 'Containerization',      color: '#2496ED' },
                                ].map(s => (
                                    <div key={s.name} className="flex items-center gap-2.5 p-3 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A]">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                                        <div>
                                            <p className="text-xs font-semibold text-white">{s.name}</p>
                                            <p className="text-[10px] text-gray-600">{s.role}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
                            <h3 className="text-sm font-semibold text-white mb-1">Compliance</h3>
                            <p className="text-xs text-gray-500 mb-3">Ciphera V3 is designed to support compliance with:</p>
                            <div className="flex flex-wrap gap-2">
                                {['DPDP Act 2023','GDPR Article 25','ISO 27001','IT Act 2000'].map(c => (
                                    <span key={c} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
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