"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
    Shield, ArrowRight, Fingerprint, Zap, Lock,
    CheckCircle2, Code2, Database, Eye, Users,
    BarChart3, Layers,
} from 'lucide-react';
import { SiteLoader } from '@/components/layout/SiteLoader';

// ── Hover-encrypt headline ────────────────────────────────────────────────────
// Each word independently encrypts on hover — character substitution only,
// no background shapes or rectangles.
const CIPHER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?▒░';
const EFFECTS = ['cipher', 'redact', 'encrypt'] as const;
type Effect = typeof EFFECTS[number];

function pickEffect(): Effect {
    return EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
}

function HoverWord({
    word,
    className = '',
    effect,
}: {
    word: string;
    className?: string;
    effect?: Effect;
}) {
    const [chars, setChars] = useState<string[]>(word.split(''));
    const [active, setActive] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const currentEffect = useRef<Effect>(effect || pickEffect());

    const clearAll = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        revealTimers.current.forEach(t => clearTimeout(t));
        revealTimers.current = [];
    };

    const onEnter = useCallback(() => {
        clearAll();
        setActive(true);
        currentEffect.current = effect || pickEffect();
        const letters = word.split('');

        if (currentEffect.current === 'redact') {
            // Chars go to ░ one by one
            setChars(letters.map(() => '░'));
            letters.forEach((orig, i) => {
                const t = setTimeout(() => {
                    setChars(prev => { const n=[...prev]; n[i]='█'; return n; });
                }, i * 35);
                revealTimers.current.push(t);
            });
        } else if (currentEffect.current === 'encrypt') {
            // Each char cycles rapidly through cipher chars
            intervalRef.current = setInterval(() => {
                setChars(prev => prev.map((_, i) =>
                    Math.random() > 0.3
                        ? CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)]
                        : letters[i]
                ));
            }, 45);
        } else {
            // cipher — each char substituted with random, independently
            intervalRef.current = setInterval(() => {
                setChars(prev => prev.map((orig, i) => {
                    if (Math.random() > 0.5) return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
                    return orig;
                }));
            }, 60);
        }
    }, [word, effect]);

    const onLeave = useCallback(() => {
        clearAll();
        setActive(false);
        const letters = word.split('');
        // Smoothly restore char by char
        letters.forEach((orig, i) => {
            const t = setTimeout(() => {
                setChars(prev => { const n=[...prev]; n[i]=orig; return n; });
            }, i * 25 + Math.random() * 20);
            revealTimers.current.push(t);
        });
    }, [word]);

    useEffect(() => () => clearAll(), []);

    return (
        <span
            className={`cursor-default select-none ${className}`}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
        >
            {chars.map((ch, i) => (
                <span
                    key={i}
                    className="inline-block transition-colors duration-75"
                    style={{
                        color: active && (ch === '█' || ch === '░')
                            ? 'rgba(255,255,255,0.15)'
                            : active && ch !== word[i]
                            ? currentEffect.current === 'encrypt' ? '#FFA500' : '#b91c1c'
                            : undefined,
                        textShadow: active && ch !== word[i] && currentEffect.current === 'encrypt'
                            ? '0 0 8px rgba(255,165,0,0.4)'
                            : 'none',
                    }}
                >
                    {ch}
                </span>
            ))}
        </span>
    );
}

// ── Traffic signal terminal ───────────────────────────────────────────────────
const TERMINAL_STATES = [
    { light: 'red',    label: 'CONNECTING',  text: 'Establishing secure channel…',   color: '#ef4444' },
    { light: 'yellow', label: 'PROCESSING',  text: 'Running detection pipeline…',    color: '#eab308' },
    { light: 'green',  label: 'SECURED',     text: 'PII redacted. Channel secured.', color: '#22c55e' },
] as const;

const DEMO_LINES = [
    { text: 'Name: John Doe, Aadhaar: 4532 8812 9901, PAN: ABCDE1234F', type: 'original' },
    { text: 'Name: [PERSON_1], Aadhaar: [AADHAAR_1], PAN: [PAN_1]',     type: 'redacted' },
    { text: 'Mobile: +91 98765 43210, Email: john.doe@acmecorp.com',      type: 'original' },
    { text: 'Mobile: [PHONE_1], Email: [EMAIL_1]',                        type: 'redacted' },
    { text: 'IFSC: SBIN0001234, DOB: 15/08/1990, Voter: ABC1234567',      type: 'original' },
    { text: 'IFSC: [IFSC_1], DOB: [DATE_1], Voter: [VOTER_ID_1]',        type: 'redacted' },
];

function TrafficSignalTerminal() {
    const [stateIdx, setStateIdx] = useState(0);
    const [lineIdx,  setLineIdx]  = useState(0);
    const [charIdx,  setCharIdx]  = useState(0);
    const [phase,    setPhase]    = useState<'typing' | 'pause' | 'erasing'>('typing');
    const currentState = TERMINAL_STATES[stateIdx];
    const currentLine  = DEMO_LINES[lineIdx];

    // Cycle signal state every time a line pair completes
    useEffect(() => {
        if (lineIdx > 0 && lineIdx % 2 === 0) {
            setStateIdx(i => (i + 1) % TERMINAL_STATES.length);
        }
    }, [lineIdx]);

    // Typing animation
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (phase === 'typing') {
            if (charIdx < currentLine.text.length) timer = setTimeout(() => setCharIdx(c => c + 1), 26);
            else timer = setTimeout(() => setPhase('pause'), 1600);
        } else if (phase === 'pause') {
            timer = setTimeout(() => setPhase('erasing'), 300);
        } else {
            if (charIdx > 0) timer = setTimeout(() => setCharIdx(c => c - 1), 10);
            else { setLineIdx(i => (i + 1) % DEMO_LINES.length); setPhase('typing'); }
        }
        return () => clearTimeout(timer);
    }, [phase, charIdx, currentLine.text.length]);

    return (
        <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.6)]">
            {/* Terminal header with traffic signal */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#141414] border-b border-[#2A2A2A]">
                {/* Traffic signal lights */}
                <div className="flex items-center gap-1.5">
                    {TERMINAL_STATES.map((s, i) => (
                        <div
                            key={i}
                            className="w-3 h-3 rounded-full transition-all duration-500"
                            style={{
                                backgroundColor: stateIdx === i ? s.color : s.color + '30',
                                boxShadow: stateIdx === i ? `0 0 8px ${s.color}80` : 'none',
                                transform: stateIdx === i ? 'scale(1.15)' : 'scale(1)',
                            }}
                        />
                    ))}
                </div>
                <span className="ml-2 text-[11px] font-mono text-gray-600">ciphera v3 — live detection engine</span>
                <div className="ml-auto flex items-center gap-1.5">
                    <div
                        className="w-1.5 h-1.5 rounded-full transition-all duration-500"
                        style={{
                            backgroundColor: currentState.color,
                            boxShadow: `0 0 6px ${currentState.color}`,
                            animation: stateIdx === 2 ? 'none' : 'pulse 1s infinite',
                        }}
                    />
                    <span
                        className="text-[9px] font-mono tracking-wider transition-colors duration-500"
                        style={{ color: currentState.color }}
                    >
                        {currentState.label}
                    </span>
                </div>
            </div>
            {/* Status line */}
            <div
                className="px-6 pt-3 pb-1 text-[10px] font-mono transition-colors duration-500"
                style={{ color: currentState.color + '80' }}
            >
                {currentState.text}
            </div>
            {/* Typing content */}
            <div className="px-6 pb-5 min-h-[52px] flex items-center">
                <div className="font-mono text-sm leading-relaxed">
                    <span className={currentLine.type === 'redacted' ? 'text-emerald-400' : 'text-gray-300'}>
                        {currentLine.text.slice(0, charIdx)}
                    </span>
                    <span className="inline-block w-0.5 h-4 bg-[#FFA500] ml-0.5 animate-pulse align-middle" />
                </div>
            </div>
        </div>
    );
}

// ── Stats with scroll-triggered animations ────────────────────────────────────
function AnimatedStat({ target, suffix = '', label }: { target: number; suffix?: string; label: string }) {
    const [val, setVal]         = useState(0);
    const [triggered, setTriggered] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting || triggered) return;
            setTriggered(true);
            observer.disconnect();
            let start = 0;
            const step = target / 50;
            const timer = setInterval(() => {
                start += step;
                if (start >= target) { setVal(target); clearInterval(timer); }
                else setVal(Math.floor(start));
            }, 20);
        }, { threshold: 0.5 });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [target, triggered]);

    return (
        <div ref={ref} className="text-center">
            <div className="text-4xl font-bold text-[#FFA500] font-mono mb-1">
                {val.toLocaleString()}{suffix}
            </div>
            <div className="text-sm text-gray-500">{label}</div>
        </div>
    );
}

// The "4" stat — pipeline flowchart that assembles into 4
function PipelineFlowStat() {
    const [step, setStep]         = useState(0);
    const [triggered, setTriggered] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting || triggered) return;
            setTriggered(true);
            observer.disconnect();
            // Animate steps in sequence
            [0,1,2,3,4].forEach(i => {
                setTimeout(() => setStep(i + 1), i * 280);
            });
        }, { threshold: 0.5 });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [triggered]);

    const stages = ['Regex', 'Presidio', 'spaCy', 'Ensemble'];
    const colors  = ['#F97316', '#60A5FA', '#34D399', '#FFA500'];

    return (
        <div ref={ref} className="flex flex-col items-center">
            {/* Mini pipeline that resolves to "4" */}
            <div className="flex items-center gap-1 mb-3 h-8">
                {stages.map((s, i) => (
                    <React.Fragment key={i}>
                        <div
                            className="transition-all duration-300 rounded px-1.5 py-0.5 text-[8px] font-mono font-bold"
                            style={{
                                backgroundColor: step > i ? colors[i] + '20' : 'transparent',
                                color: step > i ? colors[i] : 'transparent',
                                border: `1px solid ${step > i ? colors[i] + '40' : 'transparent'}`,
                                transform: step > i ? 'translateY(0)' : 'translateY(4px)',
                                opacity: step > i ? 1 : 0,
                            }}
                        >
                            {s}
                        </div>
                        {i < 3 && (
                            <div
                                className="w-3 h-px transition-all duration-200"
                                style={{
                                    backgroundColor: step > i + 1 ? '#FFA500' : 'transparent',
                                    opacity: step > i + 1 ? 0.4 : 0,
                                }}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>
            <div
                className="text-4xl font-bold font-mono transition-all duration-500"
                style={{
                    color: step >= 5 ? '#FFA500' : 'transparent',
                    transform: step >= 5 ? 'scale(1)' : 'scale(0.6)',
                }}
            >
                4
            </div>
            <div className="text-sm text-gray-500 mt-1">Detection Stages</div>
        </div>
    );
}

// ── Compliance hover card ─────────────────────────────────────────────────────
interface ComplianceCardProps {
    name: string; shortDesc: string; color: string;
    fullDesc: string; keyPoints: string[]; penalty?: string;
}
function ComplianceCard({ name, shortDesc, color, fullDesc, keyPoints, penalty }: ComplianceCardProps) {
    const [hovered, setHovered] = useState(false);
    return (
        <div className="relative rounded-2xl border overflow-hidden cursor-default transition-all duration-500 text-left"
            style={{
                borderColor: hovered ? color + '50' : color + '20',
                backgroundColor: hovered ? color + '10' : color + '06',
                transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: hovered ? `0 12px 40px ${color}18` : 'none',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="p-4">
                <div className="font-bold text-sm mb-0.5" style={{ color }}>{name}</div>
                <div className="text-[11px] text-gray-500">{shortDesc}</div>
                {!hovered && <div className="text-[10px] text-gray-700 mt-1.5 font-mono">Hover to expand ↓</div>}
            </div>
            <div className="overflow-hidden transition-all duration-500 ease-out"
                style={{ maxHeight: hovered ? '280px' : '0px', opacity: hovered ? 1 : 0 }}>
                <div className="px-4 pb-4 space-y-2.5">
                    <div className="h-px w-full" style={{ backgroundColor: color + '20' }} />
                    <p className="text-[11px] text-gray-400 leading-relaxed">{fullDesc}</p>
                    <div className="space-y-1.5">
                        {keyPoints.map((pt, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
                                <span className="text-[10px] text-gray-500">{pt}</span>
                            </div>
                        ))}
                    </div>
                    {penalty && (
                        <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-mono"
                            style={{ backgroundColor: color + '10', color }}>
                            Penalty: {penalty}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
    const [loaderDone, setLoaderDone] = useState(false);
    const [pageVisible, setPageVisible] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const handleLoaderComplete = () => {
        setLoaderDone(true);
        // Slight delay so wipe transition matches loader
        setTimeout(() => setPageVisible(true), 50);
    };

    const complianceCards: ComplianceCardProps[] = [
        { name: 'DPDP Act 2023', shortDesc: 'Digital Personal Data Protection Act', color: '#F97316',
          fullDesc: "India's landmark data protection legislation requiring explicit consent before processing personal data of Indian citizens.",
          keyPoints: ['Explicit consent required before data processing','Data minimization — collect only what is needed','Right to erasure and correction for data principals','Mandatory breach notification within 72 hours'],
          penalty: 'Up to ₹250 crore per violation' },
        { name: 'GDPR Art. 25', shortDesc: 'Data protection by design and default', color: '#60A5FA',
          fullDesc: 'EU regulation requiring privacy to be built into products from the ground up, not added as an afterthought.',
          keyPoints: ['Privacy must be considered at design stage','Default settings must be most privacy-friendly','Pseudonymization and encryption required where appropriate',"Applies to any org processing EU residents' data"],
          penalty: 'Up to €20M or 4% of global annual turnover' },
        { name: 'ISO 27001', shortDesc: 'Information security management', color: '#34D399',
          fullDesc: 'International standard for establishing, implementing, and maintaining an information security management system.',
          keyPoints: ['Risk-based approach to information security','Mandatory security controls across 14 domains','Requires documented policies and procedures','Annual surveillance audits and 3-year recertification'] },
        { name: 'IT Act 2000', shortDesc: 'Section 43A sensitive data protection', color: '#A78BFA',
          fullDesc: "India's IT Act Section 43A mandates compensation for failure to implement reasonable security practices for sensitive personal data.",
          keyPoints: ['Applies to body corporates handling sensitive data','Sensitive data includes biometrics, financial info, health records','Must maintain a documented security policy','Negligence in data protection is a civil liability'],
          penalty: 'Compensation to affected persons — no upper limit' },
    ];

    return (
        <>
            {/* Loader — runs before page appears */}
            {!loaderDone && <SiteLoader onComplete={handleLoaderComplete} />}

            {/* Landing page — revealed after loader wipes up */}
            <div
                className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-[#FFA500] selection:text-black overflow-x-hidden transition-opacity duration-300"
                style={{ opacity: pageVisible ? 1 : 0 }}
            >
                {/* Nav */}
                <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 transition-all duration-300 ${scrolled ? 'bg-[#0A0A0A]/90 backdrop-blur-md border-b border-white/5' : 'bg-transparent'}`}>
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <div className="p-1.5 rounded-lg bg-[#FFA500] group-hover:bg-[#ffb733] transition-colors">
                            <Shield className="w-4 h-4 text-black" />
                        </div>
                        <span className="font-bold text-lg tracking-tight">Ciphera</span>
                        <span className="text-[10px] font-mono text-[#FFA500]/60 border border-[#FFA500]/20 px-1.5 py-0.5 rounded">V3</span>
                    </Link>
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
                <section className="relative pt-36 pb-24 px-6 md:px-12 flex flex-col items-center text-center overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-[#FFA500]/5 rounded-full blur-[140px] pointer-events-none" />
                    <div className="absolute top-48 left-1/4  w-[300px] h-[300px] bg-blue-600/4   rounded-full blur-[100px] pointer-events-none" />
                    <div className="absolute top-48 right-1/4 w-[300px] h-[300px] bg-purple-600/4 rounded-full blur-[100px] pointer-events-none" />
                    <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
                        style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

                    <div className="relative z-10 max-w-4xl mx-auto">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFA500]/10 border border-[#FFA500]/20 text-[#FFA500] text-xs font-medium mb-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#FFA500] animate-pulse" />
                            DPDP Act 2023 · GDPR · Built for Indian enterprises
                        </div>

                        {/* Headline — hover-per-word cipher effect, no background shapes */}
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
                            <span className="block">
                                <HoverWord word="INTELLIGENT" className="text-white" effect="cipher" />
                                {' '}
                                <HoverWord word="PII" className="text-white" effect="redact" />
                            </span>
                            <span className="block text-[#FFA500]">
                                <HoverWord word="Anonymization" className="text-[#FFA500]" effect="encrypt" />
                            </span>
                            <span className="block text-white">
                                <HoverWord word="at" className="text-white" effect="cipher" />
                                {' '}
                                <HoverWord word="Scale" className="text-white" effect="redact" />
                            </span>
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

                    {/* Traffic signal terminal */}
                    <div className="relative z-10 mt-16 w-full max-w-2xl mx-auto">
                        <TrafficSignalTerminal />
                    </div>
                </section>

                {/* Stats */}
                <section className="px-6 md:px-12 py-16 border-y border-white/[0.04]">
                    <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center items-end">
                        <AnimatedStat target={17} suffix="+" label="Entity Types Detected" />
                        <PipelineFlowStat />
                        <AnimatedStat target={7}  suffix=""  label="Indian PII Formats" />
                        <AnimatedStat target={28} suffix=""  label="Active Recognizers" />
                    </div>
                </section>

                {/* Features */}
                <section id="features" className="px-6 md:px-12 py-24">
                    <div className="max-w-6xl mx-auto">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything needed to protect sensitive data</h2>
                            <p className="text-gray-400 max-w-xl mx-auto">Built for compliance teams, legal departments, and data engineers working with Indian and global documents.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                                { icon: <Fingerprint className="w-5 h-5" />, color: '#F97316', title: 'Indian PII Detection',    desc: 'Aadhaar (Verhoeff checksum), PAN, GSTIN, IFSC, Voter ID, Passport, Vehicle Registration — format-validated, not just pattern-matched.' },
                                { icon: <Zap className="w-5 h-5" />,         color: '#FFA500', title: 'Four-Stage Pipeline',     desc: 'Regex → Presidio → spaCy NER → Voting ensemble. Weighted scoring with type-lock at ≥0.80 confidence prevents misclassification.' },
                                { icon: <Eye className="w-5 h-5" />,         color: '#60A5FA', title: 'Visual Canvas Redaction', desc: 'Pixel-level redaction for PDFs and images. Draw boxes manually, detect faces automatically, export as flattened PDF.' },
                                { icon: <Database className="w-5 h-5" />,    color: '#34D399', title: 'Synthetic Substitution',  desc: 'Replace PII with realistic synthetic Indian data. Documents stay readable while all sensitive information is replaced.' },
                                { icon: <Code2 className="w-5 h-5" />,       color: '#A78BFA', title: 'REST API Access',         desc: 'Authenticated REST endpoints for pipeline integration. Per-key rate limiting and request tracking included.' },
                                { icon: <Layers className="w-5 h-5" />,      color: '#818CF8', title: 'Batch Processing',        desc: 'Queue multiple documents, download as ZIP in any format. Powered by the same four-stage detection pipeline.' },
                                { icon: <BarChart3 className="w-5 h-5" />,   color: '#F472B6', title: 'Compliance Reports',      desc: 'DPDP Act 2023 and GDPR Article 25 aligned audit reports. PDF and CSV export per session.' },
                                { icon: <Users className="w-5 h-5" />,       color: '#2DD4BF', title: 'Human-in-the-Loop',       desc: 'Review and approve each detected entity before export. Full control over what gets redacted, with confidence scores.' },
                                { icon: <Lock className="w-5 h-5" />,        color: '#EAB308', title: 'Local Inference Only',    desc: 'No data transmitted externally. Fully air-gapped deployment via Docker Compose. Audit logs persist in SQLite.' },
                            ].map((f, i) => (
                                <div key={i} className="group p-5 rounded-2xl bg-[#0E0E0E] border border-[#1A1A1A] hover:border-[#2A2A2A] hover:bg-[#111] transition-all duration-300">
                                    <div className="p-2.5 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform duration-300" style={{ backgroundColor: f.color + '15' }}>
                                        <div style={{ color: f.color }}>{f.icon}</div>
                                    </div>
                                    <h3 className="font-semibold text-white mb-2 text-sm">{f.title}</h3>
                                    <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
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
                                { step: '01', name: 'Regex Engine',    weight: '1.4×', color: '#F97316', desc: 'Format-aware pattern matching for structured Indian PII. Aadhaar validated with Verhoeff checksum, PAN alphanumeric structure verified, GSTIN state codes checked. Highest weight due to format precision.' },
                                { step: '02', name: 'Presidio NLP',    weight: '1.0×', color: '#60A5FA', desc: '28 specialized recognizers for global PII patterns. Phone numbers, credit cards, email addresses, SSN, medical license numbers, URLs, IP addresses, and more.' },
                                { step: '03', name: 'spaCy NER',       weight: '0.9×', color: '#34D399', desc: 'en_core_web_lg transformer model provides context-aware named entity recognition. Detects names, locations, organizations by understanding surrounding text.' },
                                { step: '04', name: 'Voting Ensemble', weight: '—',    color: '#FFA500', desc: 'Weighted scores merged across all stages. Type-locked at ≥0.80 regex confidence — prevents spaCy from reclassifying a PAN number as a location based on context alone.' },
                            ].map((s, i) => (
                                <div key={i} className="flex gap-4 p-5 rounded-2xl bg-[#111] border border-[#1A1A1A] hover:border-[#2A2A2A] transition-all">
                                    <div className="shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-bold mt-0.5"
                                        style={{ borderColor: s.color + '50', backgroundColor: s.color + '10', color: s.color }}>
                                        {s.step}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                                            <h3 className="font-semibold text-white">{s.name}</h3>
                                            {s.weight !== '—' && (
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded border shrink-0"
                                                    style={{ color: s.color, borderColor: s.color + '30', backgroundColor: s.color + '10' }}>
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
                                    'POST /api/v3/classify — auto-detect document type',
                                ].map((item, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                        <span className="text-xs font-mono text-gray-400">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 font-mono text-[12px] leading-relaxed overflow-x-auto">
                            <div className="text-gray-600 mb-2"># Redact via REST API</div>
                            <div className="text-[#60A5FA]">curl <span className="text-white">-X POST</span> \</div>
                            <div className="text-white pl-4">http://your-server/api/v3/public/redact \</div>
                            <div className="pl-4"><span className="text-[#34D399]">-H</span> <span className="text-[#FFA500]">"X-API-Key: ck_live_..."</span> \</div>
                            <div className="pl-4"><span className="text-[#34D399]">-d</span> <span className="text-[#FFA500]">'{`{"text": "Aadhaar: 4532 8812 9901"}`}'</span></div>
                            <div className="mt-4 pt-4 border-t border-[#1A1A1A] text-gray-600"># Response</div>
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
                        <p className="text-gray-400 mb-12 max-w-xl mx-auto">Hover each regulation to understand its requirements and how Ciphera addresses them.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {complianceCards.map((card, i) => <ComplianceCard key={i} {...card} />)}
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="px-6 md:px-12 py-24 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FFA500]/3 to-transparent pointer-events-none" />
                    <div className="max-w-2xl mx-auto text-center relative z-10">
                        <h2 className="text-4xl font-bold mb-4 leading-tight">Your documents.<br />Your infrastructure.<br />Your control.</h2>
                        <p className="text-gray-400 mb-8 leading-relaxed">No data transmitted externally. Runs entirely on-premise via Docker. Full compliance audit trail in every session.</p>
                        <Link href="/dashboard" className="inline-flex items-center gap-2 px-8 py-4 bg-[#FFA500] hover:bg-[#ffb733] text-black font-bold rounded-2xl transition-all text-base shadow-[0_0_40px_rgba(255,165,0,0.2)]">
                            Open Mission Control <ArrowRight className="w-5 h-5" />
                        </Link>
                    </div>
                </section>

                {/* Footer */}
                <footer className="px-6 md:px-12 py-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="p-1 rounded-md bg-[#FFA500] group-hover:bg-[#ffb733] transition-colors">
                            <Shield className="w-3 h-3 text-black" />
                        </div>
                        <span className="font-semibold text-sm">Ciphera V3</span>
                        <span className="text-xs text-gray-700 font-mono">· DJSCE IPD Project</span>
                    </Link>
                    <div className="text-xs text-gray-700 font-mono">Local inference · Zero telemetry · DPDP Act 2023 aligned</div>
                    <div className="flex items-center gap-4 text-xs text-gray-600">
                        <Link href="/dashboard" className="hover:text-gray-400 transition-colors">Dashboard</Link>
                        <Link href="/redact"    className="hover:text-gray-400 transition-colors">Redact</Link>
                        <Link href="/batch"     className="hover:text-gray-400 transition-colors">Batch</Link>
                        <Link href="/settings"  className="hover:text-gray-400 transition-colors">Settings</Link>
                    </div>
                </footer>
            </div>
        </>
    );
}