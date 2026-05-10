"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    Shield, ArrowRight, Fingerprint, Zap, Lock,
    CheckCircle2, Code2, Database, Eye, Users,
    BarChart3, Layers, FileText,
} from 'lucide-react';

function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
    const [val, setVal] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            let start = 0;
            const step = target / 60;
            const timer = setInterval(() => {
                start += step;
                if (start >= target) { setVal(target); clearInterval(timer); }
                else setVal(Math.floor(start));
            }, 16);
        });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [target]);
    return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

const DEMO_LINES = [
    { text: 'Name: Rihaan Shaikh, Aadhaar: 1234 5678 9012, PAN: ABCDE1234F', type: 'original' },
    { text: 'Name: [PERSON_1], Aadhaar: [AADHAAR_1], PAN: [PAN_1]', type: 'redacted' },
    { text: 'Mobile: +91 98765 43210, Email: rihaan@corp.com', type: 'original' },
    { text: 'Mobile: [PHONE_1], Email: [EMAIL_1]', type: 'redacted' },
];

function TypingDemo() {
    const [lineIdx, setLineIdx] = useState(0);
    const [charIdx, setCharIdx] = useState(0);
    const [phase, setPhase]     = useState<'typing' | 'pause' | 'erasing'>('typing');
    const current = DEMO_LINES[lineIdx];

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (phase === 'typing') {
            if (charIdx < current.text.length) timer = setTimeout(() => setCharIdx(c => c + 1), 30);
            else timer = setTimeout(() => setPhase('pause'), 2000);
        } else if (phase === 'pause') {
            timer = setTimeout(() => setPhase('erasing'), 300);
        } else {
            if (charIdx > 0) timer = setTimeout(() => setCharIdx(c => c - 1), 15);
            else { setLineIdx(i => (i + 1) % DEMO_LINES.length); setPhase('typing'); }
        }
        return () => clearTimeout(timer);
    }, [phase, charIdx, current.text.length]);

    const isRedacted = current.type === 'redacted';
    return (
        <div className="font-mono text-sm leading-relaxed min-h-[24px]">
            <span className={isRedacted ? 'text-emerald-400' : 'text-gray-300'}>
                {current.text.slice(0, charIdx)}
            </span>
            <span className="inline-block w-0.5 h-4 bg-[#FFA500] ml-0.5 animate-pulse align-middle" />
        </div>
    );
}

export default function LandingPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-[#FFA500] selection:text-black overflow-x-hidden">

            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-white/5">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#FFA500]"><Shield className="w-4 h-4 text-black" /></div>
                    <span className="font-bold text-lg tracking-tight">Ciphera</span>
                    <span className="text-[10px] font-mono text-[#FFA500]/60 border border-[#FFA500]/20 px-1.5 py-0.5 rounded">V3</span>
                </div>
                <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
                    <a href="#features"   className="hover:text-white transition-colors cursor-pointer">Features</a>
                    <a href="#pipeline"   className="hover:text-white transition-colors cursor-pointer">Pipeline</a>
                    <a href="#api"        className="hover:text-white transition-colors cursor-pointer">API</a>
                    <a href="#compliance" className="hover:text-white transition-colors cursor-pointer">Compliance</a>
                </div>
                <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 bg-[#FFA500] hover:bg-[#ffb733] text-black text-sm font-semibold rounded-xl transition-all">
                    Open App <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            </nav>

            {/* Hero */}
            <section className="relative pt-32 pb-24 px-6 md:px-12 flex flex-col items-center text-center overflow-hidden">
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-[#FFA500]/6 rounded-full blur-[140px] pointer-events-none" />
                <div className="absolute top-48 left-1/4 w-[300px] h-[300px] bg-blue-500/4 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute top-48 right-1/4 w-[300px] h-[300px] bg-purple-500/4 rounded-full blur-[100px] pointer-events-none" />

                <div className="relative z-10 max-w-4xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFA500]/10 border border-[#FFA500]/20 text-[#FFA500] text-xs font-medium mb-8">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#FFA500] animate-pulse" />
                        DPDP Act 2023 · GDPR · Built for Indian enterprises
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
                        Intelligent PII<br />
                        <span className="text-[#FFA500]">Anonymization</span><br />
                        at Scale
                    </h1>
                    <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                        Enterprise-grade document redaction powered by a four-stage detection pipeline.
                        Aadhaar, PAN, GSTIN, biometric data — identified and sanitized before it leaves your system.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/dashboard" className="flex items-center gap-2 px-6 py-3.5 bg-[#FFA500] hover:bg-[#ffb733] text-black font-semibold rounded-xl transition-all text-sm shadow-[0_0_30px_rgba(255,165,0,0.25)] hover:shadow-[0_0_50px_rgba(255,165,0,0.4)]">
                            Start Redacting <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link href="/batch" className="flex items-center gap-2 px-6 py-3.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-medium rounded-xl transition-all text-sm">
                            <Layers className="w-4 h-4" /> Batch Processing
                        </Link>
                    </div>
                </div>

                {/* Terminal demo */}
                <div className="relative z-10 mt-16 w-full max-w-2xl mx-auto">
                    <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]">
                        <div className="flex items-center gap-2 px-4 py-3 bg-[#1A1A1A] border-b border-[#2A2A2A]">
                            <div className="w-3 h-3 rounded-full bg-red-500/60" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                            <div className="w-3 h-3 rounded-full bg-green-500/60" />
                            <span className="ml-3 text-[11px] font-mono text-gray-600">ciphera v3 — live detection engine</span>
                        </div>
                        <div className="p-6 min-h-[90px]">
                            <div className="text-[11px] font-mono text-gray-600 mb-2">$ ciphera redact --pipeline v3 --file document.pdf</div>
                            {mounted && <TypingDemo />}
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats */}
            <section className="px-6 md:px-12 py-16 border-y border-white/5">
                <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                    {[
                        { label: 'Entity Types Detected', target: 17, suffix: '+' },
                        { label: 'Detection Stages',      target: 4,  suffix: '' },
                        { label: 'Indian PII Formats',    target: 7,  suffix: '' },
                        { label: 'Active Recognizers',    target: 28, suffix: '' },
                    ].map((s, i) => (
                        <div key={i}>
                            <div className="text-4xl font-bold text-[#FFA500] font-mono mb-1">
                                {mounted ? <Counter target={s.target} suffix={s.suffix} /> : '—'}
                            </div>
                            <div className="text-sm text-gray-500">{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Features */}
            <section id="features" className="px-6 md:px-12 py-24">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to protect sensitive data</h2>
                        <p className="text-gray-400 max-w-xl mx-auto">Built for compliance teams, legal departments, and data engineers working with Indian and global documents.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {[
                            { icon: <Fingerprint className="w-5 h-5" />, color: '#F97316', title: 'Indian PII Detection', desc: 'Aadhaar (Verhoeff checksum), PAN, GSTIN, IFSC, Voter ID, Passport, Vehicle Registration — detected with format validation, not just pattern matching.' },
                            { icon: <Zap className="w-5 h-5" />, color: '#FFA500', title: 'Four-Stage Pipeline', desc: 'Regex → Presidio → spaCy NER → Voting ensemble. Weighted scoring with type-lock at ≥0.80 confidence prevents NLP from overriding precise format matches.' },
                            { icon: <Eye className="w-5 h-5" />, color: '#60A5FA', title: 'Visual Canvas Redaction', desc: 'PDF and image redaction with pixel-level precision. Draw redaction boxes manually, detect faces automatically, export as flattened PDF.' },
                            { icon: <Database className="w-5 h-5" />, color: '#34D399', title: 'Synthetic Substitution', desc: 'Replace PII with realistic synthetic Indian data. Documents remain readable while all sensitive information is replaced with valid-format fake data.' },
                            { icon: <Code2 className="w-5 h-5" />, color: '#A78BFA', title: 'REST API Access', desc: 'Integrate Ciphera into any pipeline via authenticated REST API. POST text, receive redacted output. Per-key rate limiting and request tracking included.' },
                            { icon: <Layers className="w-5 h-5" />, color: '#818CF8', title: 'Batch Processing', desc: 'Upload multiple documents and process as a queue. Download individually or as a ZIP archive in TXT, PDF, DOCX, CSV, or Markdown format.' },
                            { icon: <BarChart3 className="w-5 h-5" />, color: '#F472B6', title: 'Compliance Reports', desc: 'Generate audit-ready PDF and CSV reports for every redaction session. DPDP Act 2023 and GDPR Article 25 aligned with session-level telemetry.' },
                            { icon: <Users className="w-5 h-5" />, color: '#2DD4BF', title: 'Human-in-the-Loop', desc: 'Review every detected entity before export. Approve or reject individual findings with confidence scores. Full control over what gets redacted.' },
                            { icon: <Lock className="w-5 h-5" />, color: '#EAB308', title: 'Local Inference Only', desc: 'All processing runs on your machine. No data transmitted to external servers. Fully air-gapped deployment available via Docker Compose.' },
                        ].map((f, i) => (
                            <div key={i} className="p-5 rounded-2xl bg-[#111] border border-[#1E1E1E] hover:border-[#2A2A2A] hover:bg-[#141414] transition-all">
                                <div className="p-2.5 rounded-xl w-fit mb-4" style={{ backgroundColor: f.color + '15' }}>
                                    <div style={{ color: f.color }}>{f.icon}</div>
                                </div>
                                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pipeline */}
            <section id="pipeline" className="px-6 md:px-12 py-24 bg-[#0D0D0D]">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">How the detection pipeline works</h2>
                        <p className="text-gray-400">Four stages vote on each entity. The ensemble produces higher accuracy than any single method.</p>
                    </div>
                    <div className="space-y-4">
                        {[
                            { step: '01', name: 'Regex Engine',    weight: '1.4×', color: '#F97316', desc: 'Pattern matching for structured Indian PII — Aadhaar format with Verhoeff checksum, PAN alphanumeric structure, GSTIN state codes. Highest weight due to format precision.' },
                            { step: '02', name: 'Presidio NLP',    weight: '1.0×', color: '#60A5FA', desc: '28 recognizers covering global PII. Phone numbers, credit cards, emails, SSN, medical license numbers, URLs, IP addresses.' },
                            { step: '03', name: 'spaCy NER',       weight: '0.9×', color: '#34D399', desc: 'en_core_web_lg transformer model for named entity recognition. Context-aware detection of names, locations, organizations across document structure.' },
                            { step: '04', name: 'Voting Ensemble', weight: '—',    color: '#FFA500', desc: 'Weighted scores merged across all stages. Type-locked at ≥0.80 regex confidence — prevents NLP from reclassifying PAN numbers as locations.' },
                        ].map((s, i) => (
                            <div key={i} className="flex gap-5 p-5 rounded-2xl bg-[#111] border border-[#1E1E1E]">
                                <div className="shrink-0 text-2xl font-bold font-mono opacity-30" style={{ color: s.color }}>{s.step}</div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="font-semibold text-white">{s.name}</h3>
                                        {s.weight !== '—' && (
                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ color: s.color, borderColor: s.color + '30', backgroundColor: s.color + '10' }}>
                                                weight {s.weight}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* API */}
            <section id="api" className="px-6 md:px-12 py-24">
                <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#A78BFA]/10 border border-[#A78BFA]/20 text-[#A78BFA] text-xs font-medium mb-6">
                            <Code2 className="w-3 h-3" /> REST API
                        </div>
                        <h2 className="text-3xl font-bold mb-4">Integrate into any pipeline</h2>
                        <p className="text-gray-400 mb-6 leading-relaxed">Authenticated REST endpoints let you redact documents programmatically from any language or framework.</p>
                        <ul className="space-y-3">
                            {[
                                'POST /api/v3/public/redact — redact and return sanitized text',
                                'POST /api/v3/public/analyze — detect entities without redacting',
                                'POST /api/v3/synthesize — replace PII with synthetic data',
                                'API key management via Settings → Engine Config',
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-2.5">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <span className="text-sm font-mono text-gray-400 text-[12px]">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="bg-[#0D0D0D] border border-[#1E1E1E] rounded-2xl p-5 font-mono text-[12px] leading-relaxed overflow-x-auto">
                        <div className="text-gray-600 mb-2"># Redact via REST API</div>
                        <div className="text-[#60A5FA]">curl <span className="text-white">-X POST</span> \</div>
                        <div className="text-white pl-4">http://your-server/api/v3/public/redact \</div>
                        <div className="pl-4"><span className="text-[#34D399]">-H</span> <span className="text-[#FFA500]">"X-API-Key: ck_live_..."</span> \</div>
                        <div className="pl-4"><span className="text-[#34D399]">-d</span> <span className="text-[#FFA500]">'{`{"text": "Aadhaar: 1234 5678 9012"}`}'</span></div>
                        <div className="mt-4 pt-4 border-t border-[#1E1E1E] text-gray-600"># Response</div>
                        <div className="text-emerald-400">{`{`}</div>
                        <div className="pl-4 text-gray-300">"redacted_text": <span className="text-[#FFA500]">"Aadhaar: [AADHAAR_1]"</span>,</div>
                        <div className="pl-4 text-gray-300">"entities_found": <span className="text-[#60A5FA]">1</span>,</div>
                        <div className="pl-4 text-gray-300">"processing_ms": <span className="text-[#60A5FA]">38</span></div>
                        <div className="text-emerald-400">{`}`}</div>
                    </div>
                </div>
            </section>

            {/* Compliance */}
            <section id="compliance" className="px-6 md:px-12 py-24 bg-[#0D0D0D]">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl font-bold mb-4">Built for regulatory compliance</h2>
                    <p className="text-gray-400 mb-12 max-w-xl mx-auto">Designed to support data protection requirements across Indian and international regulatory frameworks.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { name: 'DPDP Act 2023', desc: 'Digital Personal Data Protection Act', color: '#F97316' },
                            { name: 'GDPR Art. 25',  desc: 'Data protection by design and default', color: '#60A5FA' },
                            { name: 'ISO 27001',     desc: 'Information security management',       color: '#34D399' },
                            { name: 'IT Act 2000',   desc: 'Section 43A sensitive data protection', color: '#A78BFA' },
                        ].map((c, i) => (
                            <div key={i} className="p-4 rounded-2xl border" style={{ borderColor: c.color + '25', backgroundColor: c.color + '08' }}>
                                <div className="font-bold mb-1 text-sm" style={{ color: c.color }}>{c.name}</div>
                                <div className="text-[11px] text-gray-600 leading-relaxed">{c.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="px-6 md:px-12 py-24 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FFA500]/3 to-transparent pointer-events-none" />
                <div className="max-w-2xl mx-auto text-center relative z-10">
                    <h2 className="text-4xl font-bold mb-4 leading-tight">
                        Your documents.<br />Your infrastructure.<br />Your control.
                    </h2>
                    <p className="text-gray-400 mb-8 leading-relaxed">
                        No data leaves your system. Runs entirely on-premise via Docker.
                        Full compliance audit trail included in every session.
                    </p>
                    <Link href="/dashboard" className="inline-flex items-center gap-2 px-8 py-4 bg-[#FFA500] hover:bg-[#ffb733] text-black font-bold rounded-2xl transition-all text-base shadow-[0_0_40px_rgba(255,165,0,0.25)]">
                        Open Mission Control <ArrowRight className="w-5 h-5" />
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="px-6 md:px-12 py-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-[#FFA500]"><Shield className="w-3 h-3 text-black" /></div>
                    <span className="font-semibold text-sm">Ciphera V3</span>
                    <span className="text-xs text-gray-700 font-mono">· DJSCE IPD Project</span>
                </div>
                <div className="text-xs text-gray-700 font-mono">Local inference · Zero telemetry · DPDP Act 2023 aligned</div>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                    <Link href="/dashboard" className="hover:text-gray-400 transition-colors">Dashboard</Link>
                    <Link href="/redact"    className="hover:text-gray-400 transition-colors">Redact</Link>
                    <Link href="/batch"     className="hover:text-gray-400 transition-colors">Batch</Link>
                    <Link href="/settings"  className="hover:text-gray-400 transition-colors">Settings</Link>
                </div>
            </footer>
        </div>
    );
}