"use client";

import React, { useState, useEffect } from 'react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { ApiKeyManager } from '@/components/settings/ApiKeyManager';
import { WebhookManager } from '@/components/settings/WebhookManager';
import { PageLoader } from '@/components/layout/PageLoader';
import { useAuth } from '@/context/AuthContext';
import { publicFetch } from '@/lib/api';

type Tab = 'detection' | 'language' | 'api' | 'webhooks' | 'about';



// All rules — matches documentStore RuleType exactly
const ALL_RULES: { id: RuleType; label: string; group: string }[] = [
    // Identity
    { id: 'names',          label: 'Names (NLP)',      group: 'Identity & Contact' },
    { id: 'email',          label: 'Email',            group: 'Identity & Contact' },
    { id: 'phone',          label: 'Phone',            group: 'Identity & Contact' },
    { id: 'dob',            label: 'Date of Birth',    group: 'Identity & Contact' },
    { id: 'date',           label: 'General Dates',    group: 'Identity & Contact' },
    // Financial
    { id: 'creditCard',     label: 'Credit Card',      group: 'Financial' },
    { id: 'ssn',            label: 'SSN / TIN',        group: 'Financial' },
    // Indian PII original
    { id: 'aadhaar',        label: 'Aadhaar',          group: 'Indian PII' },
    { id: 'pan',            label: 'PAN',              group: 'Indian PII' },
    { id: 'gst',            label: 'GST / GSTIN',      group: 'Indian PII' },
    { id: 'ifsc',           label: 'IFSC Code',        group: 'Indian PII' },
    { id: 'voterId',        label: 'Voter ID',         group: 'Indian PII' },
    { id: 'passport',       label: 'Passport',         group: 'Indian PII' },
    { id: 'vehicleReg',     label: 'Vehicle Reg',      group: 'Indian PII' },
    // Indian PII v3.1
    { id: 'upi' as RuleType,            label: 'UPI ID',           group: 'Indian PII' },
    { id: 'bankAccount' as RuleType,    label: 'Bank Account',     group: 'Indian PII' },
    { id: 'drivingLicence' as RuleType, label: 'Driving Licence',  group: 'Indian PII' },
    { id: 'pinCode' as RuleType,        label: 'PIN Code',         group: 'Indian PII' },
    // Network
    { id: 'url',            label: 'URLs',             group: 'Network & System' },
    { id: 'ip',             label: 'IP Addresses',     group: 'Network & System' },
];

const GROUPS = ['Identity & Contact', 'Financial', 'Indian PII', 'Network & System'];

const GROUP_ACCENT: Record<string, string> = {
    'Identity & Contact': '#3B82F6',
    'Financial':          '#F59E0B',
    'Indian PII':         '#F97316',
    'Network & System':   '#06B6D4',
};

// Language preference keys stored in localStorage
const LANG_PREF_KEY  = 'ciphera_lang_mode';
const CONF_PREF_KEY  = 'ciphera_conf_threshold';
const ML_PREF_KEY    = 'ciphera_ml_scoring';

export default function SettingsPage() {
    const { isGuest } = useAuth();
    const TAB_CONFIG: { id: Tab; label: string }[] = [
        { id: 'detection', label: 'DETECTION' },
        { id: 'language',  label: 'LANGUAGE'  },
        ...(!isGuest ? [{ id: 'api' as Tab, label: 'API KEYS' }] : []),
        ...(!isGuest ? [{ id: 'webhooks' as Tab, label: 'WEBHOOKS' }] : []),
        { id: 'about',     label: 'SYSTEM'    },
    ];
    const [activeTab,     setActiveTab]     = useState<Tab>('detection');
    const [backendStatus, setBackendStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
    const [backendInfo,   setBackendInfo]   = useState<any>(null);
    const [isMounted,     setIsMounted]     = useState(false);

    // Language preferences (persisted to localStorage)
    const [langMode,   setLangMode]   = useState<'auto' | 'english' | 'hindi' | 'mixed'>('auto');
    const [confThresh, setConfThresh] = useState<number>(0.50);
    const [mlScoring,  setMlScoring]  = useState<boolean>(true);
    const [prefSaved,  setPrefSaved]  = useState(false);

    const { rules, setRuleAction } = useDocumentStore();

    useEffect(() => {
        setIsMounted(true);
        // Load saved preferences
        if (typeof window !== 'undefined') {
            const savedLang  = localStorage.getItem(LANG_PREF_KEY)  as any;
            const savedConf  = localStorage.getItem(CONF_PREF_KEY);
            const savedMl    = localStorage.getItem(ML_PREF_KEY);
            if (savedLang)  setLangMode(savedLang);
            if (savedConf)  setConfThresh(parseFloat(savedConf));
            if (savedMl !== null) setMlScoring(savedMl === 'true');
        }
    }, []);

    const checkBackend = async () => {
        try {
            const r    = await publicFetch('/api/v3/health');
            const data = await r.json();
            setBackendStatus('ok');
            setBackendInfo(data);
        } catch {
            setBackendStatus('error');
        }
    };

    useEffect(() => { checkBackend(); }, []);

    const savePreferences = () => {
        localStorage.setItem(LANG_PREF_KEY,  langMode);
        localStorage.setItem(CONF_PREF_KEY,  confThresh.toString());
        localStorage.setItem(ML_PREF_KEY,    mlScoring.toString());
        setPrefSaved(true);
        setTimeout(() => setPrefSaved(false), 2000);
    };

    // Group rules by category
    const groupedRules = GROUPS.map(group => ({
        group,
        rules: ALL_RULES.filter(r => r.group === group),
    }));

    return (
        <PageLoader page="settings">
        <div className="w-full p-6 md:p-10 min-h-screen selection:bg-[#F5C400] selection:text-black bg-[#0d0d0d]">
            <main className="max-w-4xl mx-auto space-y-10 pb-16 relative">

                {/* ── Header (unchanged) ──────────────────────────────────── */}
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
                            Configure detection · Language pipeline · API keys · System
                        </p>
                    </div>
                    <div style={{ border: `1px solid ${backendStatus === 'ok' ? 'rgba(74,222,128,0.4)' : 'rgba(239,239,239,0.1)'}`, padding: '8px 20px', backgroundColor: backendStatus === 'ok' ? 'rgba(74,222,128,0.05)' : 'transparent' }}
                        className="flex items-center gap-3 shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                        <div className="w-1.5 h-1.5" style={{ borderRadius: '50%', background: backendStatus === 'ok' ? '#4ade80' : backendStatus === 'error' ? '#ef4444' : '#6B7280', boxShadow: backendStatus === 'ok' ? '0 0 8px rgba(74,222,128,0.8)' : 'none', animation: backendStatus === 'ok' ? 'pulse-dot 1.4s ease-in-out infinite' : 'none' }} />
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', color: backendStatus === 'ok' ? '#4ade80' : backendStatus === 'error' ? '#ef4444' : '#6B7280', textTransform: 'uppercase' }}>
                            BACKEND: {backendStatus === 'ok' ? 'ONLINE' : backendStatus === 'error' ? 'OFFLINE' : 'CHECKING…'}
                        </span>
                    </div>
                </header>

                {/* ── Tab Bar (unchanged styles, new Language tab) ─────────── */}
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

                {/* ── DETECTION TAB ────────────────────────────────────────── */}
                {activeTab === 'detection' && (
                    <div className="space-y-10 animate-tab-in">
                        <div>
                            <div className="mb-5">
                                <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', margin: 0, letterSpacing: '0.03em' }}>
                                    REDACTION RULES
                                </h3>
                                <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.6)', lineHeight: 1.7, marginTop: '6px' }}>
                                    Set the default redaction action per entity type. Changes apply to new documents immediately.
                                </p>
                            </div>

                            {/* Grouped rule grid */}
                            <div className="space-y-4">
                                {groupedRules.map(({ group, rules: groupRules }) => (
                                    <div key={group}>
                                        {/* Group header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <div style={{ width: '10px', height: '2px', background: GROUP_ACCENT[group] }} />
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.22em', textTransform: 'uppercase', color: GROUP_ACCENT[group], fontWeight: 600 }}>{group}</span>
                                        </div>
                                        <div className="bg-[#131315] border border-[rgba(239,239,239,0.15)]"
                                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                                            {groupRules.map((rule) => (
                                                <div key={rule.id}
                                                    className="group grid items-center hover:bg-[rgba(245,196,0,0.03)] transition-colors relative"
                                                    style={{ gridTemplateColumns: '1fr auto', borderRight: '1px solid rgba(239,239,239,0.07)', borderBottom: '1px solid rgba(239,239,239,0.07)', padding: '14px 18px' }}>
                                                    <div className="absolute left-0 top-0 bottom-0 w-[2px] scale-y-0 group-hover:scale-y-100 transition-transform duration-300"
                                                        style={{ background: GROUP_ACCENT[group] }} />
                                                    <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '14px', fontWeight: 500, color: '#EFEFEF', letterSpacing: '0.02em' }}
                                                        className="group-hover:text-[#F5C400] transition-colors">
                                                        {rule.label}
                                                    </span>
                                                    <select
                                                        value={rules[rule.id]?.action || 'replace'}
                                                        onChange={e => setRuleAction(rule.id, e.target.value as any)}
                                                        style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontSize: '13px', fontWeight: 500, letterSpacing: '0.02em', color: '#EFEFEF', padding: '5px 12px' }}
                                                        className="bg-[#0d0d0d] border border-[rgba(239,239,239,0.15)] focus:outline-none focus:border-[#F5C400] hover:border-[rgba(239,239,239,0.4)] transition-colors cursor-pointer appearance-none outline-none">
                                                        <option value="replace"  className="bg-[#131315]">Replace</option>
                                                        <option value="blackout" className="bg-[#131315]">Blackout</option>
                                                        <option value="mask"     className="bg-[#131315]">Mask</option>
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pipeline stages (unchanged) */}
                        <div className="relative overflow-hidden group">
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-[rgba(245,196,0,0.15)] z-10 pointer-events-none" style={{ animation: 'scanner 5s linear infinite' }} />
                            <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', marginTop: '8px', marginBottom: '6px', letterSpacing: '0.03em' }}>
                                DETECTION PIPELINE
                            </h3>
                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.6)', lineHeight: 1.7, marginBottom: '20px' }}>
                                Overview of the entity detection stages applied during document processing.
                            </p>
                            <div className="space-y-[2px]">
                                {[
                                    { stage: 'STAGE 01', name: 'Pattern-Based Regex Engine',    desc: 'Syntax-level detection for highly structured signatures (Aadhaar, PAN, UPI, phone). Verhoeff checksum for Aadhaar.', weight: '1.4× WEIGHT' },
                                    { stage: 'STAGE 02', name: 'Microsoft Presidio NLP Core',   desc: 'Contextual natural language analysis using 28 distinct local entity recognizers.',                                    weight: '1.0× WEIGHT' },
                                    { stage: 'STAGE 03', name: 'spaCy Neural Transformer',      desc: 'Named Entity Recognition powered by a localized transformer pipeline. Hindi NER runs on Devanagari segments only.',  weight: '0.9× WEIGHT' },
                                    { stage: 'STAGE 04', name: 'Voting Ensemble Array',         desc: 'Aggregates votes across all engines with active type-lock verification at ≥0.80 confidence.',                       weight: 'FINAL' },
                                ].map((s, i) => (
                                    <div key={s.stage}
                                        className="group/stage grid items-center bg-[#131315] border border-[rgba(239,239,239,0.15)] hover:border-[rgba(245,196,0,0.3)] hover:shadow-[0_0_15px_rgba(245,196,0,0.05)] transition-all animate-stage-in opacity-0 relative overflow-hidden"
                                        style={{ gridTemplateColumns: '90px 1fr auto', padding: '22px 24px', gap: '20px', animationDelay: `${i * 80}ms` }}>
                                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover/stage:scale-y-100 transition-transform duration-300" />
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.14em', color: 'rgba(239,239,239,0.6)', border: '1px solid rgba(239,239,239,0.2)', padding: '5px 12px', textAlign: 'center', background: '#0d0d0d' }}
                                            className="group-hover/stage:border-[#F5C400] group-hover/stage:text-[#F5C400] transition-colors">
                                            {s.stage}
                                        </div>
                                        <div className="min-w-0">
                                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '15px', fontWeight: 700, color: '#EFEFEF', margin: 0 }} className="group-hover/stage:text-[#F5C400] transition-colors">{s.name}</p>
                                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.55)', lineHeight: 1.6, marginTop: '6px' }}>{s.desc}</p>
                                        </div>
                                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#F5C400' }}>{s.weight}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── LANGUAGE TAB (new) ────────────────────────────────────── */}
                {activeTab === 'language' && (
                    <div className="space-y-8 animate-tab-in">
                        <div>
                            <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', margin: '0 0 6px', letterSpacing: '0.03em' }}>LANGUAGE & PIPELINE DEFAULTS</h3>
                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.6)', lineHeight: 1.7 }}>
                                These are saved to your browser. The redact page uses them as defaults on every document load.
                            </p>
                        </div>

                        <div className="bg-[#131315] border border-[rgba(239,239,239,0.15)]">

                            {/* Language mode */}
                            <div style={{ padding: '24px' }}>
                                <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                                    Default Language Mode
                                </label>
                                <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', color: 'rgba(239,239,239,0.5)', marginBottom: '16px', lineHeight: 1.6 }}>
                                    Auto-detect is recommended. Override if you always process a specific language.
                                </p>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {([
                                        { value: 'auto',    label: 'Auto Detect',    sub: 'Recommended' },
                                        { value: 'english', label: 'English Only',   sub: 'Latin script' },
                                        { value: 'hindi',   label: 'Hindi Only',     sub: 'Devanagari' },
                                        { value: 'mixed',   label: 'Bilingual',      sub: 'Hindi + English' },
                                    ].map(opt => (
                                        <button key={opt.value} onClick={() => setLangMode(opt.value as any)}
                                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: langMode === opt.value ? 600 : 500, letterSpacing: '0.1em', padding: '10px 14px', border: langMode === opt.value ? '1px solid #F5C400' : '1px solid rgba(239,239,239,0.15)', background: langMode === opt.value ? 'rgba(245,196,0,0.05)' : 'transparent', color: langMode === opt.value ? '#F5C400' : 'rgba(239,239,239,0.6)', cursor: 'pointer', textAlign: 'left', flex: '1 1 200px' }}
                                            className="hover:border-[rgba(245,196,0,0.4)] hover:text-[#EFEFEF] transition-all">
                                            <div style={{ marginBottom: '2px' }}>{opt.label}</div>
                                            <div style={{ fontSize: '9px', color: 'rgba(239,239,239,0.4)', fontWeight: 400 }}>{opt.sub}</div>
                                        </button>
                                    )))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── API KEYS TAB ──────────────────────────────────────────── */}
                {activeTab === 'api' && (
                    <div className="animate-tab-in">
                        <ApiKeyManager />
                    </div>
                )}

                {/* ── WEBHOOKS TAB ──────────────────────────────────────────── */}
                {activeTab === 'webhooks' && (
                    <div className="animate-tab-in">
                        <WebhookManager />
                    </div>
                )}

                {/* ── ABOUT / SYSTEM TAB ────────────────────────────────────── */}
                {activeTab === 'about' && (
                    <div className="space-y-6 animate-tab-in">
                        <div>
                            <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', margin: '0 0 6px', letterSpacing: '0.03em' }}>SYSTEM INFORMATION</h3>
                            <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.55)', lineHeight: 1.7 }}>
                                Version details and backend health status.
                            </p>
                        </div>
                        <div style={{ background: '#131315', border: '1px solid rgba(239,239,239,0.15)', padding: '20px 24px' }}>
                            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: 'rgba(239,239,239,0.7)', lineHeight: 2 }}>
                                <div><strong>Frontend:</strong> Ciphera Workspace v3.1</div>
                                <div><strong>Backend:</strong>  {backendStatus === 'ok' ? 'Connected (FastAPI / Python 3.10)' : 'Offline or Unreachable'}</div>
                                {backendInfo && (
                                    <>
                                        <div><strong>Engine:</strong> {backendInfo.engine_version || 'v3.1.2'}</div>
                                        <div><strong>Device:</strong> {backendInfo.device || 'cpu'}</div>
                                        <div><strong>Uptime:</strong> {backendInfo.uptime || 'unknown'}</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
        </PageLoader>
    );
}