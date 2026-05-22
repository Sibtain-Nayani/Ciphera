"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { SiteLoader } from '@/components/layout/SiteLoader';
import dynamic from 'next/dynamic';


const HeroDocument = dynamic(() => import('@/components/HeroDocument'), { ssr: false });

// ─────────────────────────────────────────────────────────────────────────────
// WIPE REVEAL ANIMATION (Task 13)
// ─────────────────────────────────────────────────────────────────────────────
function WipeReveal({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setInView(true);
                observer.disconnect();
            }
        }, { threshold: 0.2 });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} style={{
            clipPath: inView ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
            transition: `clip-path 0.6s cubic-bezier(0.85, 0, 0.15, 1) ${delay}ms`
        }}>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CIPHER CHARS
// ─────────────────────────────────────────────────────────────────────────────
const CIPHER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?';
const rc = () => CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
type EncryptMode = 'encrypt' | 'redact' | 'anon';

// ─────────────────────────────────────────────────────────────────────────────
// ENCRYPT WORD — staggered letter effect, holds until mouse leaves
// ─────────────────────────────────────────────────────────────────────────────
function EncryptWord({ word, mode, style: extStyle = {} }: {
    word: string; mode: EncryptMode; style?: React.CSSProperties;
}) {
    const [chars, setChars]   = useState<string[]>(word.split(''));
    const [active, setActive] = useState(false);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const clear = () => { timers.current.forEach(t => clearTimeout(t)); timers.current = []; };

    const sub = (orig: string) => orig === ' ' ? ' ' : mode === 'redact' ? '▓' : mode === 'anon' ? '░' : rc();

    const onEnter = useCallback(() => {
        if (active) return; clear(); setActive(true);
        word.split('').forEach((ch, i) => {
            const t = setTimeout(() => setChars(prev => { const n=[...prev]; n[i]=sub(ch); return n; }), i*50);
            timers.current.push(t);
        });
    }, [word, mode, active]);

    const onLeave = useCallback(() => {
        clear(); setActive(false);
        word.split('').forEach((orig, i) => {
            const t = setTimeout(() => setChars(prev => { const n=[...prev]; n[i]=orig; return n; }), i*35);
            timers.current.push(t);
        });
    }, [word]);

    useEffect(() => () => clear(), []);

    const altColor  = mode==='redact' ? 'rgba(239,239,239,0.08)' : mode==='anon' ? 'rgba(239,239,239,0.25)' : '#F5C400';
    const altShadow = mode==='encrypt' ? '0 0 10px rgba(245,196,0,0.5)' : 'none';

    return (
        <span style={{ cursor:'default', userSelect:'none', display:'inline-block', ...extStyle }}
            onMouseEnter={onEnter} onMouseLeave={onLeave}>
            {chars.map((ch, i) => {
                const alt = ch !== word[i];
                return <span key={i} style={{ display:'inline-block', minWidth: ch===' '?'0.3em':'0.56em', textAlign:'center', color:alt?altColor:undefined, textShadow:alt?altShadow:'none', transition:'color 0.05s, text-shadow 0.05s' }}>{ch}</span>;
            })}
        </span>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// REDACTED REVEAL — solid bar by default, hover reveals (used for headlines)
// ─────────────────────────────────────────────────────────────────────────────
function RedactedReveal({ text, style: extStyle = {} }: { text: string; style?: React.CSSProperties }) {
    const [revealed, setRevealed] = useState(false);
    return (
        <span style={{ display:'inline-flex', flexDirection: 'column', alignItems: 'flex-start', whiteSpace: 'nowrap', width: 'max-content', ...extStyle }}>
            <span
                onMouseEnter={() => setRevealed(true)}
                onMouseLeave={() => setRevealed(false)}
                style={{
                    display:'inline-block', background: revealed?'#F5C400':'#EFEFEF',
                    color: revealed?'#080808':'transparent', cursor:'pointer',
                    transition:'background 0.4s ease, color 0.4s ease',
                    padding:'0 6px', userSelect:'none',
                    fontFamily:'inherit', fontWeight:'inherit',
                    fontSize:'inherit', lineHeight:'inherit',
                    letterSpacing:'inherit', textTransform:'inherit',
                    whiteSpace: 'nowrap',
                }}
            >{text}</span>
            <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '8px',
                letterSpacing: '0.16em',
                color: 'rgba(239,239,239,0.18)',
                textTransform: 'uppercase',
                marginTop: '4px',
                fontWeight: 400,
                lineHeight: 1,
            }}>HOVER TO REVEAL</span>
        </span>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// DECLASSIFYING SUBTEXT — words appear one by one from redacted bars
// ─────────────────────────────────────────────────────────────────────────────
const SUBTEXT = "Aadhaar. PAN. GSTIN. Biometrics. — found, flagged, and removed. Before anything leaves your machine.";

function DeclassifySubtext() {
    const words = SUBTEXT.split(' ');
    const [revealed, setRevealed] = useState<boolean[]>(Array(words.length).fill(false));

    useEffect(() => {
        const timers: ReturnType<typeof setTimeout>[] = [];
        const BASE_DELAY = 600; // ms before first word appears
        words.forEach((_, i) => {
            const t = setTimeout(() => {
                setRevealed(prev => { const n=[...prev]; n[i]=true; return n; });
            }, BASE_DELAY + i * 110);
            timers.push(t);
        });
        return () => timers.forEach(t => clearTimeout(t));
    }, []);

    return (
        <p style={{
            fontFamily: 'Barlow, sans-serif', fontSize: '13px',
            lineHeight: 1.8, maxWidth: '520px', margin: '0 auto 16px',
            letterSpacing: '0.01em',
        }}>
            {words.map((word, i) => (
                <span key={i} style={{ display:'inline-block', marginRight:'0.3em' }}>
                    <span style={{
                        display:'inline-block',
                        background:  revealed[i] ? 'transparent' : '#EFEFEF',
                        color:       revealed[i] ? 'rgba(239,239,239,0.5)' : 'transparent',
                        transition:  'background 0.3s ease, color 0.3s ease',
                        padding:     revealed[i] ? '0' : '0 1px',
                        borderRadius: 0,
                        userSelect:  'none',
                    }}>{word}</span>
                </span>
            ))}
        </p>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMINAL INIT — types "> initializing ciphera v3..." once on page load
// ─────────────────────────────────────────────────────────────────────────────
const INIT_TEXT = '> initializing ciphera v3...';

function TerminalInit({ onFinished }: { onFinished: () => void }) {
    const [text, setText] = useState('');
    const [opacity, setOpacity] = useState(1);

    useEffect(() => {
        let idx = 0;
        const type = setInterval(() => {
            idx++;
            setText(INIT_TEXT.slice(0, idx));
            if (idx >= INIT_TEXT.length) {
                clearInterval(type);
                setTimeout(() => {
                    setOpacity(0);
                    setTimeout(() => {
                        onFinished();
                    }, 400);
                }, 1200);
            }
        }, 38);
        return () => clearInterval(type);
    }, [onFinished]);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            zIndex: 9990, background: '#080808',
            borderBottom: '1px solid rgba(239,239,239,0.07)',
            padding: '6px 36px',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px',
            letterSpacing: '0.18em', color: '#F5C400',
            pointerEvents: 'none',
            opacity: opacity,
            transition: 'opacity 400ms ease',
        }}>
            {text}<span style={{ animation: 'blink 1s step-end infinite' }}>█</span>
            <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAFFIC SIGNAL TERMINAL (hero right column)
// ─────────────────────────────────────────────────────────────────────────────
const SIGNAL_STATES = [
    { color:'#ef4444', label:'CONNECTING',  status:'Establishing secure channel…'  },
    { color:'#eab308', label:'PROCESSING',  status:'Running detection pipeline…'   },
    { color:'#22c55e', label:'SECURED',     status:'PII redacted. Channel secured.' },
] as const;

const DEMO_LINES = [
    { text:'Name: John Doe, Aadhaar: 4532 8812 9901, PAN: ABCDE1234F', type:'original' },
    { text:'Name: [PERSON_1], Aadhaar: [AADHAAR_1], PAN: [PAN_1]',     type:'redacted' },
    { text:'Mobile: +91 98765 43210, Email: john.doe@acmecorp.com',      type:'original' },
    { text:'Mobile: [PHONE_1], Email: [EMAIL_1]',                        type:'redacted' },
    { text:'IFSC: SBIN0001234, DOB: 15/08/1990, Voter: ABC1234567',      type:'original' },
    { text:'IFSC: [IFSC_1], DOB: [DATE_1], Voter: [VOTER_ID_1]',        type:'redacted' },
];

function TrafficTerminal() {
    const [sigIdx,  setSigIdx]  = useState(0);
    const [lineIdx, setLineIdx] = useState(0);
    const [charIdx, setCharIdx] = useState(0);
    const [phase,   setPhase]   = useState<'typing'|'pause'|'erasing'>('typing');
    const sig  = SIGNAL_STATES[sigIdx];
    const line = DEMO_LINES[lineIdx];

    useEffect(() => { if (lineIdx>0 && lineIdx%2===0) setSigIdx(i=>(i+1)%3); }, [lineIdx]);
    useEffect(() => {
        let t: ReturnType<typeof setTimeout>;
        if (phase==='typing') {
            if (charIdx<line.text.length) t=setTimeout(()=>setCharIdx(c=>c+1),26);
            else t=setTimeout(()=>setPhase('pause'),1600);
        } else if (phase==='pause') {
            t=setTimeout(()=>setPhase('erasing'),300);
        } else {
            if (charIdx>0) t=setTimeout(()=>setCharIdx(c=>c-1),10);
            else { setLineIdx(i=>(i+1)%DEMO_LINES.length); setPhase('typing'); }
        }
        return ()=>clearTimeout(t);
    }, [phase,charIdx,line.text.length]);

    return (
        <div style={{ border:'1px solid rgba(239,239,239,0.07)', background:'#080808', height:'100%', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'14px 20px', borderBottom:'1px solid rgba(239,239,239,0.07)' }}>
                <div style={{ display:'flex', gap:'6px' }}>
                    {SIGNAL_STATES.map((s,i)=>(
                        <div key={i} style={{ width:12, height:12, borderRadius:'50%', background:sigIdx===i?s.color:s.color+'28', boxShadow:sigIdx===i?`0 0 8px ${s.color}80`:'none', transition:'all 0.5s', transform:sigIdx===i?'scale(1.15)':'scale(1)' }} />
                    ))}
                </div>
                <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(239,239,239,0.42)', marginLeft:'8px' }}>ciphera v3 — live detection engine</span>
                <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px' }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:sig.color, boxShadow:`0 0 6px ${sig.color}`, animation:'pulse 1.5s infinite' }} />
                    <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:sig.color, transition:'color 0.5s' }}>{sig.label}</span>
                </div>
            </div>
            <div style={{ padding:'8px 20px 4px', fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:sig.color+'80', transition:'color 0.5s' }}>{sig.status}</div>
            <div style={{ padding:'8px 20px 20px', minHeight:'52px', display:'flex', flexGrow:1, alignItems:'flex-start' }}>
                <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', lineHeight:1.6 }}>
                    <span style={{ color:line.type==='redacted'?'#22c55e':'rgba(239,239,239,0.6)' }}>{line.text.slice(0,charIdx)}</span>
                    <span style={{ display:'inline-block', width:'2px', height:'14px', background:'#F5C400', marginLeft:'2px', animation:'blink 1s step-end infinite', verticalAlign:'middle' }} />
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS — redact-then-count, no pills, ticker above
// ─────────────────────────────────────────────────────────────────────────────
function StatCell({ target, suffix='', label, index }: { target:number|string; suffix?:string; label:string; index:string }) {
    const isNum = typeof target === 'number';
    const [phase,  setPhase]  = useState<'hidden'|'redacted'|'counting'|'done'>('hidden');
    const [val,    setVal]    = useState(0);
    const ref                 = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) {
                setPhase('redacted');
                setTimeout(() => {
                    setPhase('counting');
                    if (!isNum) { setTimeout(()=>setPhase('done'),400); return; }
                    let s = 0;
                    const step = (target as number)/50;
                    const t = setInterval(()=>{
                        s+=step;
                        if (s>=(target as number)) { setVal(target as number); clearInterval(t); setPhase('done'); }
                        else setVal(Math.floor(s));
                    }, 20);
                }, 600);
            } else {
                setPhase('hidden'); setVal(0);
            }
        }, { threshold:0.5 });
        if (ref.current) obs.observe(ref.current);
        return ()=>obs.disconnect();
    }, [target, isNum]);

    const isRedacted = phase==='redacted';
    const display    = phase==='hidden'||phase==='redacted' ? (isNum?'██':target) : (isNum ? val.toLocaleString() : target);

    return (
        <div ref={ref} style={{ padding:'16px 24px', borderRight:'1px solid rgba(239,239,239,0.07)', position:'relative', height:'80px', boxSizing:'border-box', display:'flex', flexDirection:'column', justifyContent:'center' }}>
            <div style={{ position:'absolute', top:12, right:12, fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', color:'rgba(239,239,239,0.42)' }}>{index}</div>
            <div style={{
                fontFamily:'Barlow Condensed, sans-serif', fontWeight:900,
                fontSize:'48px', lineHeight:1, letterSpacing:'-0.02em',
                color: isRedacted ? 'transparent' : '#EFEFEF',
                background: isRedacted ? '#EFEFEF' : 'transparent',
                transition:'background 0.4s ease, color 0.4s ease',
                display:'inline-block',
            }}>
                {String(display)}<span style={{ color:isRedacted?'transparent':'#F5C400', fontSize:'28px', background:'transparent' }}>{!isRedacted && suffix}</span>
            </div>
            <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:400, fontSize:'12px', letterSpacing:'0.14em', textTransform:'uppercase', color:'rgba(239,239,239,0.45)', marginTop:'8px' }}>{label}</div>
        </div>
    );
}

function PipelineFlowStat() {
    const [step, setStep]   = useState(0);
    const [phase, setPhase] = useState<'hidden'|'redacted'|'done'>('hidden');
    const ref               = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) {
                setPhase('redacted'); setStep(0);
                setTimeout(()=>{
                    setPhase('done');
                    [0,1,2,3,4].forEach(i=>setTimeout(()=>setStep(i+1), i*260));
                }, 600);
            } else { setPhase('hidden'); setStep(0); }
        }, { threshold:0.5 });
        if (ref.current) obs.observe(ref.current);
        return ()=>obs.disconnect();
    }, []);

    const stages = ['Regex','Presidio','spaCy','Vote'];
    const colors  = ['#B91C1C','#F5C400','rgba(239,239,239,0.5)','#EFEFEF'];
    const isRedacted = phase==='redacted';

    return (
        <div ref={ref} style={{ padding:'28px 24px', borderRight:'1px solid rgba(239,239,239,0.07)', position:'relative' }}>
            <div style={{ position:'absolute', top:12, right:12, fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', color:'rgba(239,239,239,0.42)' }}>02</div>
            <div style={{ display:'flex', alignItems:'center', gap:'4px', marginBottom:'10px', height:'18px', opacity: isRedacted?0:1, transition:'opacity 0.4s' }}>
                {stages.map((s,i)=>(
                    <React.Fragment key={i}>
                        <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:step>i?colors[i]:'transparent', border:`1px solid ${step>i?colors[i]+'50':'transparent'}`, padding:'1px 4px', transition:'all 0.3s', opacity:step>i?1:0 }}>{s}</span>
                        {i<3 && <span style={{ width:4, height:1, background:step>i+1?'#F5C400':'transparent', transition:'all 0.2s' }} />}
                    </React.Fragment>
                ))}
            </div>
            <div style={{
                fontFamily:'Barlow Condensed, sans-serif', fontWeight:900, fontSize:'52px', lineHeight:1, letterSpacing:'-0.02em',
                color: isRedacted ? 'transparent' : step>=5 ? '#EFEFEF' : 'transparent',
                background: isRedacted ? '#EFEFEF' : 'transparent',
                transition: isRedacted ? 'background 0.4s ease, color 0.4s ease' : 'color 0.5s ease',
                transform: (!isRedacted && step>=5) ? 'scale(1)' : 'scale(0.85)',
                display:'inline-block',
            }}>4</div>
            <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:400, fontSize:'12px', letterSpacing:'0.14em', textTransform:'uppercase', color:'rgba(239,239,239,0.45)', marginTop:'8px' }}>Detection Stages</div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE CELL with scroll-triggered title highlighter
// ─────────────────────────────────────────────────────────────────────────────
function LocalInferenceCounter() {
    const [tick, setTick] = useState(false);
    useEffect(() => {
        const interval = setInterval(() => {
            setTick(t => !t);
        }, 1000);
        return () => clearInterval(interval);
    }, []);
    return (
        <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.08em', lineHeight:1.8 }}>
            <div style={{ color:'#F5C400', fontWeight:'bold' }}>{'>'} 0 BYTES TRANSMITTED</div>
            <div style={{ color:'rgba(239,239,239,0.5)', marginTop:'8px' }}>
                PACKETS TRANSMITTED: <span style={{ color:'#22c55e' }}>000</span>
                <span style={{ display:'inline-block', width:'6px', height:'10px', background:'#22c55e', marginLeft:'4px', opacity: tick ? 1 : 0.2, transition:'opacity 0.1s' }} />
            </div>
            <div style={{ color:'rgba(239,239,239,0.42)', fontSize:'12px', letterSpacing:'0.18em', marginTop:'4px' }}>
                STATUS: SECURE_LOCAL_LOOPBACK
            </div>
        </div>
    );
}

function FeatureCell({ index, title, desc, noBorderRight, noBorderBottom, special }:{
    index:string; title:string; desc:string;
    noBorderRight?:boolean; noBorderBottom?:boolean; special?:boolean;
}) {
    const [hovered,      setHovered]      = useState(false);
    const [highlighted,  setHighlighted]  = useState(false);
    const [highlightPct, setHighlightPct] = useState(0);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting && !highlighted) {
                setHighlighted(true);
                // Sweep highlight across title
                let pct = 0;
                const sweep = setInterval(()=>{
                    pct += 4;
                    setHighlightPct(pct);
                    if (pct >= 100) {
                        clearInterval(sweep);
                        setTimeout(()=>setHighlightPct(0), 300);
                    }
                }, 16);
            }
        }, { threshold:0.5 });
        if (ref.current) obs.observe(ref.current);
        return ()=>obs.disconnect();
    }, [highlighted]);

    return (
        <div ref={ref}
            onMouseEnter={()=>setHovered(true)}
            onMouseLeave={()=>setHovered(false)}
            style={{
                padding:'20px 24px',
                borderRight:  noBorderRight  ? 'none' : '1px solid rgba(239,239,239,0.07)',
                borderBottom: noBorderBottom ? 'none' : '1px solid rgba(239,239,239,0.07)',
                transition:'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.3s',
                backgroundColor: hovered ? 'rgba(245, 196, 0, 0.02)' : 'transparent',
                transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
                cursor:'default',
                position:'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'flex-start'
            }}>
            {/* Sweep border expansion on bottom */}
            <div style={{
                position: 'absolute',
                bottom: -1,
                left: 0,
                height: '1px',
                width: hovered ? '100%' : '0%',
                background: '#F5C400',
                transition: 'width 0.4s ease',
                zIndex: 2,
            }} />
            <div style={{ 
                fontFamily:"'IBM Plex Mono', monospace", 
                fontSize:'12px', 
                letterSpacing:'0.18em', 
                textTransform:'uppercase', 
                color: hovered ? '#F5C400' : 'rgba(239,239,239,0.4)', 
                marginBottom:'20px', 
                transition:'color 0.2s, transform 0.2s',
                transform: hovered ? 'scale(1.05)' : 'scale(1)',
                transformOrigin: 'left center',
                display: 'inline-block'
            }}>
                {index} ——
            </div>
            {special ? (
                <LocalInferenceCounter />
            ) : (
                <>
                    {/* Title with sweep highlight */}
                    <div style={{
                        fontFamily:'Barlow, sans-serif', fontWeight:700, fontSize:'14px',
                        marginBottom:'8px', position:'relative', display:'inline-block',
                    }}>
                        <span style={{
                            position:'absolute', top:0, left:0, height:'100%',
                            background:'#F5C400',
                            width: highlightPct>0 ? `${highlightPct}%` : '0%',
                            transition: highlightPct>0 ? 'width 0.016s linear' : 'none',
                            opacity: highlightPct>0 && highlightPct<100 ? 0.35 : 0,
                            pointerEvents:'none',
                        }} />
                        <span style={{ color:'#EFEFEF', position:'relative', zIndex:1 }}>{title}</span>
                    </div>
                    <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:400, fontSize:'13px', lineHeight:1.7, color:'rgba(239,239,239,0.5)' }}>{desc}</div>
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE TABLE ROW with scanner beam
// ─────────────────────────────────────────────────────────────────────────────
function PipelineTable() {
    const [scanY, setScanY]       = useState(0);
    const [hovRow, setHovRow]     = useState<number|null>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let y = 0;
        const interval = setInterval(()=>{
            y = (y + 0.3) % 100;
            setScanY(y);
        }, 40);
        return ()=>clearInterval(interval);
    }, []);

    const rows = [
        { stage:'01', name:'Regex Engine',    weight:'1.4×', desc:'Format-aware pattern matching for structured Indian PII. Aadhaar validated with Verhoeff checksum, PAN alphanumeric structure verified, GSTIN state codes checked. Highest weight due to format precision.' },
        { stage:'02', name:'Presidio NLP',    weight:'1.0×', desc:'28 specialized recognizers for global PII patterns. Phone numbers, credit cards, email addresses, SSN, medical license numbers, URLs, IP addresses, and more.' },
        { stage:'03', name:'spaCy NER',       weight:'0.9×', desc:'en_core_web_lg transformer model provides context-aware named entity recognition. Detects names, locations, organizations by understanding surrounding text.' },
        { stage:'04', name:'Voting Ensemble', weight:'FINAL', desc:'Weighted scores merged across all stages. Type-locked at ≥0.80 regex confidence — prevents spaCy from reclassifying a PAN number as a location based on context alone.' },
    ];

    return (
        <div ref={tableRef} style={{ position:'relative', overflow:'hidden' }}>
            {/* Scanner beam */}
            <div style={{
                position:'absolute', left:0, right:0, height:'2px',
                background:'linear-gradient(to right, transparent, #F5C400, transparent)',
                top:`${scanY}%`, opacity:0.12, pointerEvents:'none', zIndex:2, transition:'none',
            }} />

            {/* Header */}
            <div style={{ display:'grid', gridTemplateColumns:'100px 1fr 80px', gap:'24px', padding:'10px 36px', borderBottom:'1px solid rgba(239,239,239,0.07)', borderTop:'1px solid rgba(239,239,239,0.07)' }}>
                {['STAGE','ENGINE · DESCRIPTION'].map(h=>(
                    <div key={h} style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(239,239,239,0.42)' }}>{h}</div>
                ))}
                <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(239,239,239,0.42)', textAlign:'right' }}>WEIGHT</div>
            </div>

            {rows.map((row,i)=>(
                <div key={i}
                    onMouseEnter={()=>setHovRow(i)}
                    onMouseLeave={()=>setHovRow(null)}
                    style={{
                        display:'grid', gridTemplateColumns:'100px 1fr 80px',
                        gap:'24px', padding:'16px 36px',
                        borderBottom: i<rows.length-1 ? '1px solid rgba(239,239,239,0.07)':'none',
                        background: hovRow===i ? 'rgba(245,196,0,0.04)' : 'transparent',
                        transition:'background 0.2s', cursor:'default', position:'relative',
                    }}>
                    <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(239,239,239,0.42)', paddingTop:'3px' }}>Stage {row.stage}</div>
                    <div>
                        <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:700, fontSize:'14px', color:'#EFEFEF', marginBottom:'6px' }}>{row.name}</div>
                        <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:400, fontSize:'13px', lineHeight:1.7, color:'rgba(239,239,239,0.5)' }}>{row.desc}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                        <span style={{
                            fontFamily:"'IBM Plex Mono', monospace", fontSize: row.weight==='FINAL'?'13px':'11px',
                            letterSpacing:'0.14em', textTransform:'uppercase',
                            color: row.weight==='FINAL' ? '#EFEFEF' : '#F5C400',
                            border: row.weight==='FINAL' ? 'none' : '1px solid rgba(245,196,0,0.3)',
                            padding: row.weight==='FINAL' ? '0' : '3px 8px',
                            display:'inline-block', fontWeight: row.weight==='FINAL' ? 700 : 400,
                            animation: hovRow===i && row.weight!=='FINAL' ? 'pulse 0.4s ease' : 'none',
                        }}>{row.weight}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// API ENDPOINT ROW
// ─────────────────────────────────────────────────────────────────────────────
function ApiEndpointRow({ path, desc }: { path:string; desc:string }) {
    const [hov, setHov] = useState(false);
    return (
        <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
            style={{ display:'flex', gap:'8px', padding:'5px 0', cursor:'default', transition:'opacity 0.15s', opacity:hov?1:0.65 }}>
            <span style={{ color:'rgba(239,239,239,0.42)', fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', flexShrink:0 }}>{'>'}</span>
            <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', color:hov?'#EFEFEF':'rgba(239,239,239,0.6)' }}>
                <span style={{ color:'#F5C400' }}>{path}</span>
                <span style={{ color:'rgba(239,239,239,0.42)' }}> — {desc}</span>
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE ROW — dossier file tab style
// ─────────────────────────────────────────────────────────────────────────────
function ComplianceRow({ code, name, fullName, fullDesc, keyPoints, penalty }: {
    code:string; name:string; fullName:string; fullDesc:string; keyPoints:string[]; penalty?:string;
}) {
    const [expanded, setExpanded] = useState(false);
    const [redlineH, setRedlineH] = useState(0);

    const onEnter = () => {
        setExpanded(true);
        // Animate red line from top to bottom over 0.3s
        let h = 0;
        const step = setInterval(()=>{
            h = Math.min(h + 8, 100);
            setRedlineH(h);
            if (h >= 100) clearInterval(step);
        }, 12);
    };
    const onLeave = () => { setExpanded(false); setRedlineH(0); };

    return (
        <div onMouseEnter={onEnter} onMouseLeave={onLeave}
            style={{ borderBottom:'1px solid rgba(239,239,239,0.07)', position:'relative', cursor:'default', transition:'background 0.2s', background: expanded ? 'rgba(245,196,0,0.15)' : 'transparent' }}>
            {/* Red annotation line on left edge */}
            <div style={{
                position:'absolute', left:0, top:0, width:'2px',
                background:'rgba(185,28,28,0.8)', height:`${redlineH}%`,
                transition:'none',
            }} />

            {/* Main row */}
            <div style={{ display:'grid', gridTemplateColumns:'160px 1fr auto', gap:'16px', padding:'0 24px', height:'56px', alignItems:'center' }}>
                <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'clamp(10px, 1.1vw, 13px)', letterSpacing:'0.18em', textTransform:'uppercase', color:'#F5C400', fontWeight:700, minWidth: '160px', width: '160px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    [{code}]
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:600, fontSize:'13px', color:'#EFEFEF', marginBottom:'2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fullName}</div>
                    <div style={{ fontFamily:'Barlow, sans-serif', fontSize:'12px', color:'rgba(239,239,239,0.42)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                </div>
                <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'#4ade80', whiteSpace:'nowrap' }}>
                    [COMPLIANT ✓]
                </div>
            </div>

            {/* Expanded detail */}
            <div style={{ maxHeight: expanded?'240px':'0', overflow:'hidden', transition:'max-height 0.35s ease', opacity:expanded?1:0 }}>
                <div style={{ padding:'0 24px 16px', borderTop:'1px solid rgba(239,239,239,0.07)' }}>
                    <p style={{ fontFamily:'Barlow, sans-serif', fontWeight:400, fontSize:'13px', lineHeight:1.7, color:'rgba(239,239,239,0.5)', margin:'12px 0 8px' }}>{fullDesc}</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                        {keyPoints.map((pt,i)=>(
                            <div key={i} style={{ display:'flex', gap:'8px' }}>
                                <span style={{ color:'rgba(185,28,28,0.8)', fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', flexShrink:0, marginTop:'2px' }}>—</span>
                                <span style={{ fontFamily:'Barlow', fontSize:'12px', lineHeight:1.5, color:'rgba(239,239,239,0.42)' }}>{pt}</span>
                            </div>
                        ))}
                    </div>
                    {penalty && (
                        <div style={{ marginTop:'10px', padding:'4px 8px', border:'1px solid rgba(245,196,0,0.25)', fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'#F5C400' }}>
                            {penalty}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D ROTATING DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// REBUILT 3D A4 DOCUMENT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const getDocumentStyle = (progress: number) => {
  let rotY: number, rotX: number, rotZ: number, opacity: number, scale: number;

  if (progress < 0.15) {
    const p = progress / 0.15;
    rotY = 45; rotX = 12; rotZ = -4;
    opacity = p; scale = 1;
  } else if (progress < 0.45) {
    const p = (progress - 0.15) / 0.30;
    rotY = 45 - (25 * p);
    rotX = 12 - (7 * p);
    rotZ = -4 + (3 * p);
    opacity = 1; scale = 1;
  } else if (progress < 0.70) {
    const p = (progress - 0.45) / 0.25;
    rotY = 20 - (20 * p);
    rotX = 5 - (5 * p);
    rotZ = -1 + p;
    opacity = 1; scale = 1;
  } else if (progress < 0.85) {
    rotY = 0; rotX = 0; rotZ = 0;
    opacity = 1; scale = 1;
  } else {
    const p = (progress - 0.85) / 0.15;
    rotY = 0; rotX = 0; rotZ = 0;
    opacity = 1 - p; scale = 1 + (0.08 * p);
  }

  return {
    transform: `perspective(1400px) rotateY(${rotY}deg) rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale(${scale})`,
    opacity,
    transition: 'none',
    '--light-angle': `${135 - (rotY * 2)}deg`
  } as React.CSSProperties;
};

const getBarStyle = (barIndex: number, progress: number) => {
  const revealStart = 0.45 + (barIndex * 0.025);
  const revealEnd = revealStart + 0.06;
  const barProgress = Math.max(0, Math.min(1,
    (progress - revealStart) / (revealEnd - revealStart)
  ));
  return {
    width: `${100 - (barProgress * 100)}%`,
    transition: 'none'
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SCROLL-TRIGGERED ANIMATION WRAPPER (Task 7)
// ─────────────────────────────────────────────────────────────────────────────
function AnimateOnScroll({ children, delay = 0, direction = 'up', style: extStyle = {} }: {
    children: React.ReactNode; delay?: number; direction?: 'up' | 'left' | 'right'; style?: React.CSSProperties;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
        }, { threshold: 0.15 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const initialTransform = direction === 'up' ? 'translateY(24px)' : direction === 'left' ? 'translateX(-16px)' : 'translateX(16px)';

    return (
        <div ref={ref} style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translate(0)' : initialTransform,
            transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
            ...extStyle,
        }}>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIPE-FROM-LEFT REVEAL COMPONENT (Effect 5)
// ─────────────────────────────────────────────────────────────────────────────
function ClipReveal({ children, delay = 0, duration = 0.8 }: { children: React.ReactNode; delay?: number; duration?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
        }, { threshold: 0.1 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    return (
        <div ref={ref} style={{
            clipPath: visible ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
            transition: `clip-path ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        }}>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// RED EYEBROW LINE (Task 7 — animated red line + label fade)
// ─────────────────────────────────────────────────────────────────────────────
function RedEyebrow({ text }: { text: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
        }, { threshold: 0.1 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    return (
        <div ref={ref} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            clipPath: visible ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
            transition: 'clip-path 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
            <div style={{ width: '18px', height: '2px', background: 'rgba(185,28,28,0.8)', flexShrink: 0 }} />
            <span style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(185,28,28,0.8)',
            }}>{text}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// AMBIENT PARTICLES (Effect 1)
// ─────────────────────────────────────────────────────────────────────────────
function AmbientParticles({ scrollProgress }: { scrollProgress: number }) {
    const isRedactingPhase = scrollProgress >= 0.45 && scrollProgress <= 0.70;
    const opacity = isRedactingPhase ? 0.35 : 0.15;

    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
            {Array.from({ length: 12 }).map((_, i) => {
                const left = `${5 + ((i * 37) % 90)}%`;
                const animationDuration = `${12 + ((i * 7) % 15)}s`;
                const animationDelay = `-${(i * 3) % 15}s`;
                const height = i % 4 === 0 ? '12px' : '8px';
                
                return (
                    <div key={i} style={{
                        position: 'absolute',
                        left,
                        bottom: '-20px',
                        width: '2px',
                        height,
                        background: 'rgba(245,196,0,1)',
                        opacity,
                        transition: 'opacity 0.6s ease',
                        animation: `floatUp ${animationDuration} linear infinite`,
                        animationDelay,
                    }} />
                );
            })}
            <style>{`
                @keyframes floatUp {
                    0% { transform: translateY(20px); }
                    100% { transform: translateY(-120vh); }
                }
            `}</style>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE COUNTER (Effect 6)
// ─────────────────────────────────────────────────────────────────────────────
function LiveCounter() {
    const [count, setCount] = useState(2847);
    
    useEffect(() => {
        setCount(Math.floor(Math.random() * (3200 - 2847 + 1)) + 2847);
        
        let timeoutId: NodeJS.Timeout;
        const scheduleNext = () => {
            const delay = Math.floor(Math.random() * (15000 - 8000 + 1)) + 8000;
            timeoutId = setTimeout(() => {
                setCount(c => c + 1);
                scheduleNext();
            }, delay);
        };
        scheduleNext();
        return () => clearTimeout(timeoutId);
    }, []);

    return (
        <div style={{
            marginTop: '32px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            color: 'rgba(239,239,239,0.25)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        }}>
            <div style={{ width: '6px', height: '6px', background: '#4ade80', borderRadius: '50%', boxShadow: '0 0 8px rgba(74,222,128,0.4)', animation: 'pulse 2s infinite' }} />
            {count.toLocaleString()} Documents secured today
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BAR (Effect 8)
// ─────────────────────────────────────────────────────────────────────────────
function StatusBar({ scrollProgress }: { scrollProgress: number }) {
    const [displayedText, setDisplayedText] = useState('');
    const phaseRef = useRef(0);
    const [phase, setPhase] = useState(0);
    const typingIndexRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Phase transitions with hysteresis to prevent oscillation at scroll boundaries
    useEffect(() => {
        const current = phaseRef.current;
        let next = current;

        // Forward thresholds
        if (current < 1 && scrollProgress >= 0.15) next = 1;
        if (current < 2 && scrollProgress >= 0.45) next = 2;
        if (current < 3 && scrollProgress >= 0.70) next = 3;
        if (current < 4 && scrollProgress >= 0.85) next = 4;

        // Backward thresholds (3% hysteresis band prevents flip-flopping)
        if (current >= 4 && scrollProgress < 0.82) next = 3;
        if (current >= 3 && scrollProgress < 0.67) next = 2;
        if (current >= 2 && scrollProgress < 0.42) next = 1;
        if (current >= 1 && scrollProgress < 0.12) next = 0;

        if (next !== current) {
            phaseRef.current = next;
            setPhase(next);
        }
    }, [scrollProgress]);

    // Typewriter effect — only re-runs when phase actually changes
    useEffect(() => {
        const TEXTS = [
            'AWAITING INITIATION',
            'REDACTION PROTOCOL ACTIVE',
            'SECURING SENSITIVE DATA...',
            'DECLASSIFICATION COMPLETE',
            'SECURE CONNECTION ESTABLISHED',
        ];
        const target = TEXTS[phase];

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        typingIndexRef.current = 0;
        setDisplayedText('');

        intervalRef.current = setInterval(() => {
            if (typingIndexRef.current < target.length) {
                typingIndexRef.current++;
                setDisplayedText(target.substring(0, typingIndexRef.current));
            } else {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            }
        }, 30);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [phase]);

    return (
        <div style={{
            position: 'absolute',
            bottom: '40px',
            left: 'clamp(36px, 5vw, 80px)',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '11px',
            color: 'rgba(239,239,239,0.42)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
            <style>{`
                @keyframes blinkCursor {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
            <span style={{ color: '#F5C400' }}>{'>'}</span>
            <span>[{displayedText}]</span>
            <span style={{ width: '6px', height: '12px', background: 'rgba(239,239,239,0.8)', animation: 'blinkCursor 1s step-end infinite' }} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAGNETIC BUTTON (Effect 4)
// ─────────────────────────────────────────────────────────────────────────────
function MagneticButton({ children, href, style, className }: { children: React.ReactNode, href: string, style?: React.CSSProperties, className?: string }) {
    const buttonRef = useRef<HTMLAnchorElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
        const { clientX, clientY } = e;
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            const x = clientX - (rect.left + rect.width / 2);
            const y = clientY - (rect.top + rect.height / 2);
            setPosition({ x: x * 0.2, y: y * 0.2 });
        }
    };

    const handleMouseLeave = () => {
        setPosition({ x: 0, y: 0 });
    };

    return (
        <Link 
            href={href} 
            className={className}
            ref={buttonRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                ...style,
                transform: `translate(${position.x}px, ${position.y}px)`,
                transition: position.x === 0 && position.y === 0 
                    ? 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), letter-spacing 0.2s, border-color 0.2s, color 0.2s' 
                    : 'transform 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94), letter-spacing 0.2s, border-color 0.2s, color 0.2s',
                display: 'inline-block'
            }}
        >
            {children}
        </Link>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCROLL-DIRECTION PII TICKER STRIP
// ─────────────────────────────────────────────────────────────────────────────
function PiiTickerStrip() {
    const tickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mainEl = document.querySelector('main');
        const getScroll = () => mainEl ? mainEl.scrollTop : window.scrollY;
        
        let lastScrollY = getScroll();
        let tickerOffset = 0;
        let currentVelocity = -1; // start moving left
        let initialized = false;
        let animationId: number;
        const BASE_SPEED = 0.8; // Slower base speed

        const updateTicker = () => {
            const currentScrollY = getScroll();
            const delta = currentScrollY - lastScrollY;
            lastScrollY = currentScrollY;

            // Target velocity based on scroll
            let targetVelocity = currentVelocity;
            if (delta > 0) targetVelocity = -BASE_SPEED - (delta * 0.15); // scroll down -> left
            else if (delta < 0) targetVelocity = BASE_SPEED - (delta * 0.15); // scroll up -> right
            else {
                // Return to base speed in the current direction
                targetVelocity = currentVelocity > 0 ? BASE_SPEED : -BASE_SPEED;
            }

            // Smooth interpolation for velocity
            currentVelocity += (targetVelocity - currentVelocity) * 0.05;

            tickerOffset += currentVelocity;

            const ticker = document.getElementById('pii-ticker');
            if (ticker && tickerRef.current) {
                // We use 5 copies, so one chunk is scrollWidth / 5
                const chunkWidth = tickerRef.current.scrollWidth / 5;
                if (chunkWidth > 0) {
                    if (!initialized) {
                        tickerOffset = -chunkWidth * 2;
                        initialized = true;
                    }
                    // Seamless wrap
                    if (tickerOffset <= -chunkWidth * 3) {
                        tickerOffset += chunkWidth;
                    } else if (tickerOffset >= -chunkWidth) {
                        tickerOffset -= chunkWidth;
                    }
                }
                ticker.style.transform = `translateX(${tickerOffset}px)`;
            }

            animationId = requestAnimationFrame(updateTicker);
        };

        animationId = requestAnimationFrame(updateTicker);
        return () => cancelAnimationFrame(animationId);
    }, []);

    const tickerItems = ['Aadhaar', 'PAN', 'GSTIN', 'Voter ID', 'Passport', 'IFSC', 'Vehicle Reg', 'Biometric', 'Email', 'Phone', 'Bank Account', 'Medical ID', 'Employee ID', 'Address', 'Credit Card'];
    const tickerChunk = tickerItems.map((item, idx) => (
        <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0' }}>
            <span style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.35)',
                textTransform: 'uppercase',
            }}>{item}</span>
            <span style={{
                display: 'inline-block',
                width: '3px', height: '3px',
                borderRadius: '50%',
                background: 'rgba(245,196,0,0.3)',
                margin: '0 18px',
                flexShrink: 0,
            }} />
        </span>
    ));

    return (
        <div style={{
            height: '56px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.015) 0%, rgba(255,255,255,0.005) 100%)',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            width: '100%',
            position: 'relative',
            boxSizing: 'border-box'
        }}>
            {/* Subtle shimmer line */}
            <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, height: '1px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(245,196,0,0.1) 50%, transparent 100%)',
                pointerEvents: 'none',
            }} />
            <div 
                id="pii-ticker" 
                ref={tickerRef}
                style={{ whiteSpace: 'nowrap', display: 'inline-block', willChange: 'transform' }}
            >
                {Array(5).fill(null).map((_, i) => (
                    <span key={i} style={{ display: 'inline' }}>
                        {tickerChunk}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// REBUILT 3D HERO SECTION CONTAINER (Task 2 + Task 3)
// ─────────────────────────────────────────────────────────────────────────────
function HeroSectionRebuild({ active }: { active: boolean }) {
    const [scrollProgress, setScrollProgress] = useState(0);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const heroRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({
                x: (e.clientX / window.innerWidth) - 0.5,
                y: (e.clientY / window.innerHeight) - 0.5
            });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useEffect(() => {
        const container = document.getElementById('hero-scroll-container');
        const mainEl = document.querySelector('main') || window;

        let ticking = false;
        const handleScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    if (!container) {
                        ticking = false;
                        return;
                    }
                    let scrollTop = window.scrollY;
                    let containerTop = container.offsetTop;

                    if (mainEl instanceof HTMLElement) {
                        const containerRect = container.getBoundingClientRect();
                        const mainRect = mainEl.getBoundingClientRect();
                        scrollTop = mainRect.top - containerRect.top;
                        containerTop = 0;
                    }

                    const containerHeight = container.offsetHeight - window.innerHeight;
                    const progress = Math.max(0, Math.min(1,
                        (scrollTop - containerTop) / containerHeight
                    ));
                    setScrollProgress(progress);
                    ticking = false;
                });
                ticking = true;
            }
        };

        const onScroll = () => handleScroll();

        mainEl.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });
        handleScroll();
        return () => {
            mainEl.removeEventListener('scroll', onScroll);
            window.removeEventListener('scroll', onScroll);
        };
    }, []);

    const heroTextOpacity = 1;

    return (
        <div id="hero-scroll-container" style={{ height: '900vh', position: 'relative' }}>
            <div id="hero-sticky" style={{
                position: 'sticky',
                top: 0,
                height: '100vh',
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '0.9fr 1.1fr',
                alignItems: 'center',
                padding: '0 clamp(36px, 5vw, 80px)',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}>
                {/* Left column: Hero text block */}
                <div style={{
                    transform: `translate(${mousePos.x * -2}vw, ${mousePos.y * -2}vh)`,
                    transition: 'transform 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                }}>
                    <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    opacity: active ? heroTextOpacity : 0,
                    transform: active ? 'translateY(0)' : 'translateY(12px)',
                    transition: 'opacity 600ms ease, transform 600ms ease',
                }}>
                    {/* Eyebrow */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '18px', height: '2px', background: 'rgba(185,28,28,0.8)', flexShrink: 0 }} />
                        <span style={{ fontFamily: '"SF Pro Display", -apple-system, sans-serif', fontWeight: 500, fontSize: '13px', letterSpacing: '0.04em', color: 'rgba(239,239,239,0.6)' }}>
                            DPDP Act 2023 · GDPR · Built for Indian enterprises
                        </span>
                    </div>

                    {/* Headline */}
                    <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: 'clamp(64px,9vw,120px)', lineHeight: 0.85, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0' }}>
                        <span style={{ display: 'block', color: '#EFEFEF' }}>YOUR DATA</span>
                        <span style={{ display: 'block' }}>
                            <RedactedReveal text="STAYS YOURS" />
                        </span>
                        <span style={{ display: 'block', color: '#F5C400' }}>ALWAYS.</span>
                    </h1>

                    {/* Subtext */}
                    <div style={{ marginTop: '28px', maxWidth: '420px' }}>
                        <DeclassifySubtext />
                    </div>

                    {/* CTAs */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '32px' }}>
                        <MagneticButton href="/dashboard" className="cta-primary" style={{ background: '#F5C400', color: '#080808', fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', fontSize: '13px', letterSpacing: '0.02em', textTransform: 'none', padding: '11px 24px', textDecoration: 'none', fontWeight: 600, borderRadius: 0 }}>
                            Start Redacting →
                        </MagneticButton>
                        <MagneticButton href="/batch" className="cta-ghost" style={{ background: 'transparent', border: '1px solid rgba(239,239,239,0.07)', color: 'rgba(239,239,239,0.8)', fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', fontSize: '13px', letterSpacing: '0.02em', textTransform: 'none', padding: '11px 24px', textDecoration: 'none', fontWeight: 500, borderRadius: 0 }}>
                            Batch Processing
                        </MagneticButton>
                    </div>

                    {/* Trust strip */}
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '20px' }}>
                        {['Zero data retention', 'Client-side only', 'Air-gap compatible', 'DPDP compliant'].map(item => (
                            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ color: 'rgba(239,239,239,0.42)', fontSize: '12px' }}>✓</span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.42)' }}>{item}</span>
                            </div>
                        ))}
                    </div>

                    {/* Live Counter */}
                    <LiveCounter />
                    </div>
                </div>

                {/* Right column: 3D document centered both axes */}
                <div style={{
                  position: 'relative',
                  height: '100vh',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'visible'
                }}>
                  <HeroDocument scrollProgress={scrollProgress} />
                </div>
        </div>
            
            <StatusBar scrollProgress={scrollProgress} />
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// ZERO EASTER EGG (Task 10)
// ─────────────────────────────────────────────────────────────────────────────
function ZeroEasterEgg() {
    const [val, setVal] = useState("0");
    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        const scheduleNext = () => {
            const delay = Math.floor(Math.random() * (18000 - 12000 + 1)) + 12000;
            timeoutId = setTimeout(() => {
                setVal("847,293");
                setTimeout(() => setVal("0"), 80);
                scheduleNext();
            }, delay);
        };
        scheduleNext();
        return () => clearTimeout(timeoutId);
    }, []);
    return (
        <div style={{
            position: 'absolute',
            left: 'clamp(40px, 5vw, 80px)',
            top: '50%',
            transform: 'translateY(-50%)',
            fontFamily:'Barlow Condensed, sans-serif', fontWeight:900, fontSize:'clamp(180px, 20vw, 360px)',
            color:'rgba(239,239,239,0.018)',
            pointerEvents:'none', userSelect:'none', zIndex:0,
            lineHeight: 1
        }}>{val}</div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
    const [loaderDone,  setLoaderDone]  = useState(false);
    const [pageVisible, setPageVisible] = useState(false);
    const [navScrolled, setNavScrolled] = useState(false);
    const [showTerminal, setShowTerminal] = useState(true);
    const [heroActive, setHeroActive] = useState(false);

    const handleLoaderComplete = () => { setLoaderDone(true); };
    const handleRevealPage = () => { setPageVisible(true); };

    const handleTerminalFinished = () => {
        setShowTerminal(false);
        setTimeout(() => {
            setHeroActive(true);
        }, 200);
    };

    // Task 8: Nav blur on scroll past 60px
    useEffect(() => {
        const mainEl = document.querySelector('main');
        if (!mainEl) return;
        const handleScroll = () => setNavScrolled(mainEl.scrollTop > 60);
        mainEl.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => mainEl.removeEventListener('scroll', handleScroll);
    }, [loaderDone]);

    return (
        <>
            {!loaderDone && (
                <SiteLoader 
                    onComplete={handleLoaderComplete} 
                    onRevealPage={handleRevealPage} 
                />
            )}

            <div style={{ minHeight:'100vh', background:'transparent', color:'#EFEFEF', fontFamily:'Barlow, sans-serif', opacity:pageVisible?1:0, transition:'opacity 0.3s ease', cursor:'none' }}>
                {/* SVG Noise Texture Overlay (Effect 2) */}
                <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, opacity: 0.025 }}>
                    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                        <filter id="noiseFilter">
                            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
                        </filter>
                        <rect width="100%" height="100%" filter="url(#noiseFilter)" />
                    </svg>
                </div>
                {/* Terminal init — types on load */}
                {pageVisible && showTerminal && <TerminalInit onFinished={handleTerminalFinished} />}

                {/* ── Top ref bar ─────────────────────────────────────────── */}
                <div style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
                    letterSpacing: '0.18em', color: 'rgba(239,239,239,0.15)',
                    padding: '6px clamp(36px,5vw,80px)',
                    borderBottom: '1px solid rgba(239,239,239,0.07)',
                    textTransform: 'uppercase',
                    background: '#080808',
                    position: 'fixed',
                    top: 0, left: 0, right: 0,
                    zIndex: 101,
                    opacity: navScrolled ? 0 : 1,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: navScrolled ? 'none' : 'auto'
                }}>
                    DOC-REF: CPH-2025-001 · CLIENT-SIDE · ZERO RETENTION · DPDP ACT 2023
                </div>

                {/* ── Nav (Task 8: blur on scroll) ────────────────────────── */}
                <nav style={{
                    position:'fixed', top: navScrolled ? 0 : '26px', left:0, right:0, zIndex:100,
                    background: navScrolled ? 'rgba(8,8,8,0.95)' : 'transparent',
                    backdropFilter: navScrolled ? 'blur(12px)' : 'none',
                    borderBottom: navScrolled ? '1px solid rgba(239,239,239,0.07)' : '1px solid transparent',
                    transition:'top 0.3s, background 0.3s, border-color 0.3s, backdrop-filter 0.3s',
                }}>
                    <div className="content-wrap" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px clamp(36px,5vw,80px)' }}>
                        <Link href="/" style={{ textDecoration:'none', display:'flex', alignItems:'baseline', gap:'8px' }}>
                            <span style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:900, fontSize:'20px', letterSpacing:'0.12em', textTransform:'uppercase', color:'#EFEFEF' }}>Ciphera</span>
                        </Link>
                        <div style={{ display:'flex', alignItems:'center', gap:'32px' }}>
                            {['Features','Pipeline','API','Compliance'].map(l=>(
                                <a key={l} href={`#${l.toLowerCase()}`}
                                    style={{ fontFamily:'"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', fontSize:'14px', letterSpacing:'0.02em', textTransform:'none', color:'rgba(239,239,239,0.8)', textDecoration:'none', cursor:'pointer', position: 'relative', fontWeight: 500 }}
                                    onMouseEnter={e=>{e.currentTarget.style.color='#EFEFEF'; const underline = e.currentTarget.querySelector('.nav-underline') as HTMLElement; if (underline) underline.style.width='100%';}}
                                    onMouseLeave={e=>{e.currentTarget.style.color='rgba(239,239,239,0.8)'; const underline = e.currentTarget.querySelector('.nav-underline') as HTMLElement; if (underline) underline.style.width='0%';}}
                                >
                                    {l}
                                    <span className="nav-underline" style={{ position:'absolute', bottom:'-4px', left:0, width:'0%', height:'1px', background:'#F5C400', transition:'width 0.2s ease-out' }} />
                                </a>
                            ))}
                        </div>
                        <Link id="nav-cta-button" href="/dashboard" style={{ background:'#F5C400', color:'#080808', fontFamily:'"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', fontSize:'14px', letterSpacing:'0.02em', textTransform:'none', padding:'10px 24px', textDecoration:'none', fontWeight:600, borderRadius: '8px', transition:'all 0.2s' }}
                            onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.02)')}
                            onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}
                        >
                            Start Redacting →
                        </Link>
                    </div>
                </nav>

                {/* ── 3D Sticky Hero Section Rebuild ────────────────────────── */}
                <HeroSectionRebuild active={heroActive} />

                <div id="rest-of-page">

                {/* ── PII Ticker + Stats ──────────────────────────────────── */}
                <section style={{
                    paddingTop: 'clamp(80px, 10vh, 120px)',
                    paddingBottom: 'clamp(80px, 10vh, 120px)',
                    borderTop: '1px solid rgba(239,239,239,0.07)',
                    marginTop: 0,
                    width: '100%',
                    position: 'relative',
                    boxSizing: 'border-box',
                }}>

                    {/* Stats grid */}
                    <div className="content-wrap">
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)' }}>
                            <StatCell target={17}   suffix="+" label="Entity Types Detected" index="01" />
                            <StatCell target={4}    suffix=""  label="Detection Stages"      index="02" />
                            <StatCell target={7}    suffix=""  label="Indian PII Formats"    index="03" />
                            <StatCell target="0kb"  suffix=""  label="Sent to Server"        index="04" />
                        </div>
                    </div>
                </section>

                {/* ── Features ─────────────────────────────────────────────── */}
                <section id="features" style={{
                    paddingTop: 'clamp(80px, 10vh, 120px)',
                    paddingBottom: 'clamp(80px, 10vh, 120px)',
                    borderTop: '1px solid rgba(239,239,239,0.07)',
                    width: '100%',
                    position: 'relative',
                    boxSizing: 'border-box',
                }}>
                    {/* Meta strip */}
                    <div className="content-wrap">
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0', borderBottom:'1px solid rgba(239,239,239,0.07)', marginBottom:'40px' }}>
                            <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(239,239,239,0.42)' }}>// Capabilities</span>
                            <span style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(239,239,239,0.42)' }}>[09 Modules]</span>
                        </div>
                    </div>

                    {/* Headline Block */}
                    <div className="content-wrap">
                      <div style={{marginBottom:'48px'}}>
                        <p style={{fontFamily:'IBM Plex Mono',fontSize:'10px',letterSpacing:'0.24em',color:'#B91C1C',marginBottom:'20px',display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{width:'18px',height:'1px',background:'#B91C1C',display:'inline-block'}}></span>
                          NOTHING ESCAPES DETECTION
                        </p>
                        <div style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:'clamp(48px,6vw,80px)',lineHeight:0.88,textTransform:'uppercase'}}>
                          <div style={{color:'#EFEFEF'}}>NOTHING LEAVES.</div>
                          <div>
                            <span style={{background:'#EFEFEF',color:'transparent',padding:'0 6px',display:'inline-block',cursor:'pointer',transition:'background 0.4s ease, color 0.4s ease',whiteSpace:'nowrap'}}
                              onMouseEnter={e=>{(e.target as any).style.background='#F5C400';(e.target as any).style.color='#080808'}}
                              onMouseLeave={e=>{(e.target as any).style.background='#EFEFEF';(e.target as any).style.color='transparent'}}>
                              NOTHING ESCAPES.
                            </span>
                          </div>
                          <div style={{fontFamily:'IBM Plex Mono',fontSize:'8px',letterSpacing:'0.16em',color:'rgba(239,239,239,0.18)',marginTop:'6px'}}>HOVER TO REVEAL</div>
                        </div>
                        <p style={{fontFamily:'IBM Plex Mono',fontSize:'11px',color:'rgba(239,239,239,0.38)',letterSpacing:'0.14em',marginTop:'16px'}}>09 MODULES. ALL RUNNING LOCALLY. ALL RUNNING NOW.</p>
                      </div>
                    </div>

                    {/* Grid */}
                    <div className="content-wrap">
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', alignItems: 'start' }}>
                            {[
                                { index:'01', title:'Indian PII Detection',    desc:'Aadhaar (Verhoeff checksum), PAN, GSTIN, IFSC, Voter ID, Passport, Vehicle Registration — format-validated, not just pattern-matched.' },
                                { index:'02', title:'Four-Stage Pipeline',     desc:'Regex → Presidio → spaCy NER → Voting ensemble. Weighted scoring with type-lock at ≥0.80 confidence prevents misclassification.' },
                                { index:'03', title:'Visual Canvas Redaction', desc:'Pixel-level redaction for PDFs and images. Draw boxes manually, detect faces automatically, export as flattened PDF.' },
                                { index:'04', title:'Synthetic Substitution',  desc:'Replace PII with realistic synthetic Indian data. Documents stay readable while all sensitive information is replaced.' },
                                { index:'05', title:'REST API Access',         desc:'Authenticated REST endpoints for pipeline integration. Per-key rate limiting and request tracking included.' },
                                { index:'06', title:'Batch Processing',        desc:'Queue multiple documents, download as ZIP in any format. Powered by the same four-stage detection pipeline.' },
                                { index:'07', title:'Compliance Reports',      desc:'DPDP Act 2023 and GDPR Article 25 aligned audit reports. PDF and CSV export per session.' },
                                { index:'08', title:'Human-in-the-Loop',       desc:'Review and approve each detected entity before export. Full control over what gets redacted, with confidence scores.' },
                                { index:'09', title:'Local Inference Only',    desc:'',  special:true },
                            ].map((f,i)=>(
                                <AnimateOnScroll key={i} delay={i * 80}>
                                    <FeatureCell index={f.index} title={f.title} desc={f.desc}
                                        noBorderRight={(i+1)%3===0} noBorderBottom={i>=6}
                                        special={f.special} />
                                </AnimateOnScroll>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Pipeline (Task 8: scanbeam) ─────────────────────────── */}
                <section id="pipeline" style={{
                    paddingTop: 'clamp(80px, 10vh, 120px)',
                    paddingBottom: 'clamp(80px, 10vh, 120px)',
                    borderTop: '1px solid rgba(239,239,239,0.07)',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%',
                    boxSizing: 'border-box',
                }}>
                    {/* Scan beam */}
                    <div style={{ position:'absolute', left:0, right:0, height:'1px', background:'#F5C400', opacity:0.15, animation:'scanbeam 4s ease-in-out infinite', pointerEvents:'none', zIndex:1 }} />

                    {/* Headline Block */}
                    <div className="content-wrap">
                      <div style={{marginBottom:'48px'}}>
                        <p style={{fontFamily:'IBM Plex Mono',fontSize:'10px',letterSpacing:'0.24em',color:'#B91C1C',marginBottom:'20px',display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{width:'18px',height:'1px',background:'#B91C1C',display:'inline-block'}}></span>
                          DETECTION ENGINE · ACTIVE
                        </p>
                        <div style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:'clamp(48px,6vw,80px)',lineHeight:0.88,textTransform:'uppercase'}}>
                          <div style={{color:'#EFEFEF'}}>FOUR STAGES.</div>
                          <div style={{color:'#F5C400'}}>ONE VERDICT.</div>
                        </div>
                        <p style={{fontFamily:'IBM Plex Mono',fontSize:'11px',color:'rgba(239,239,239,0.38)',letterSpacing:'0.14em',marginTop:'16px'}}>EACH ENTITY IS VOTED ON. CONFIDENCE THRESHOLD: ≥0.80. BELOW THAT — FLAGGED FOR HUMAN REVIEW.</p>
                      </div>
                    </div>
                    <div className="content-wrap">
                        <PipelineTable />
                    </div>
                </section>

                {/* ── API ──────────────────────────────────────────────────── */}
                <section id="api" style={{
                    paddingTop: 'clamp(80px, 10vh, 120px)',
                    paddingBottom: 'clamp(80px, 10vh, 120px)',
                    borderTop: '1px solid rgba(239,239,239,0.07)',
                    width: '100%',
                    position: 'relative',
                    boxSizing: 'border-box',
                }}>
                    {/* Headline Block */}
                    <div className="content-wrap">
                      <div style={{marginBottom:'48px'}}>
                        <p style={{fontFamily:'IBM Plex Mono',fontSize:'10px',letterSpacing:'0.24em',color:'#B91C1C',marginBottom:'20px',display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{width:'18px',height:'1px',background:'#B91C1C',display:'inline-block'}}></span>
                          API ACCESS · AUTHENTICATED
                        </p>
                        <div style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:'clamp(48px,6vw,80px)',lineHeight:0.88,textTransform:'uppercase'}}>
                          <div style={{color:'#EFEFEF'}}>REDACT FROM</div>
                          <div>
                            <span style={{background:'#EFEFEF',color:'transparent',padding:'0 6px',display:'inline-block',cursor:'pointer',transition:'background 0.4s ease, color 0.4s ease',whiteSpace:'nowrap'}}
                              onMouseEnter={e=>{(e.target as any).style.background='#F5C400';(e.target as any).style.color='#080808'}}
                              onMouseLeave={e=>{(e.target as any).style.background='#EFEFEF';(e.target as any).style.color='transparent'}}>
                              ANYWHERE.
                            </span>
                          </div>
                          <div style={{fontFamily:'IBM Plex Mono',fontSize:'8px',letterSpacing:'0.16em',color:'rgba(239,239,239,0.18)',marginTop:'6px'}}>HOVER TO REVEAL</div>
                        </div>
                      </div>
                    </div>

                    <div className="content-wrap" style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
                        <div style={{ paddingRight:'clamp(24px, 4vw, 64px)', borderRight:'1px solid rgba(239,239,239,0.07)' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                            <ApiEndpointRow path="POST /api/v3/public/redact"   desc="sanitize and return" />
                            <ApiEndpointRow path="POST /api/v3/public/analyze"  desc="detect, don't redact" />
                            <ApiEndpointRow path="POST /api/v3/synthesize"      desc="replace with synthetic data" />
                            <ApiEndpointRow path="POST /api/v3/classify"        desc="identify document type" />
                        </div>
                    </div>
                        <div style={{ paddingLeft:'clamp(24px, 4vw, 64px)' }}>
                            <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(239,239,239,0.42)', marginBottom:'8px' }}>// REQUEST</div>
                            <div style={{ border:'1px solid rgba(239,239,239,0.07)', padding:'20px', fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', lineHeight:1.8, background:'transparent', overflow:'auto', marginBottom:'20px' }}>
                                <div style={{ color:'rgba(239,239,239,0.42)', marginBottom:'6px' }}># Redact via REST API</div>
                                <div><span style={{ color:'#60A5FA' }}>curl</span> <span style={{ color:'#EFEFEF' }}>-X POST</span> \</div>
                                <div style={{ paddingLeft:'16px', color:'#EFEFEF' }}>http://your-server/api/v3/public/redact \</div>
                                <div style={{ paddingLeft:'16px' }}><span style={{ color:'#34D399' }}>-H</span> <span style={{ color:'#F5C400' }}>&quot;X-API-Key: ck_live_...&quot;</span> \</div>
                                <div style={{ paddingLeft:'16px' }}><span style={{ color:'#34D399' }}>-d</span> <span style={{ color:'#F5C400' }}>{'\'{"text": "Aadhaar: 4532 8812 9901"}\''}</span></div>
                            </div>
                            <div style={{ fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(239,239,239,0.42)', marginBottom:'8px' }}>// RESPONSE</div>
                            <div style={{ border:'1px solid rgba(239,239,239,0.07)', padding:'20px', fontFamily:"'IBM Plex Mono', monospace", fontSize:'12px', lineHeight:1.8, background:'transparent', overflow:'auto' }}>
                                <div style={{ color:'#22c55e' }}>{'{'}</div>
                                <div style={{ paddingLeft:'16px', color:'rgba(239,239,239,0.6)' }}>&quot;redacted_text&quot;: <span style={{ color:'#F5C400' }}>&quot;Aadhaar: [AADHAAR_1]&quot;</span>,</div>
                                <div style={{ paddingLeft:'16px', color:'rgba(239,239,239,0.6)' }}>&quot;entities_found&quot;: <span style={{ color:'#60A5FA' }}>1</span>,</div>
                                <div style={{ paddingLeft:'16px', color:'rgba(239,239,239,0.6)' }}>&quot;processing_ms&quot;: <span style={{ color:'#60A5FA' }}>38</span></div>
                                <div style={{ color:'#22c55e' }}>{'}'}</div>
                            </div>
                        </div>
                    </div>
                </section>

                <PiiTickerStrip />

                {/* ── Compliance (Task 5: nowrap labels) ──────────────────── */}
                <section id="compliance" style={{
                    paddingTop: 'clamp(80px, 10vh, 120px)',
                    paddingBottom: 'clamp(80px, 10vh, 120px)',
                    borderTop: '1px solid rgba(239,239,239,0.07)',
                    width: '100%',
                    position: 'relative',
                    boxSizing: 'border-box',
                }}>
                    <div className="content-wrap" style={{ display:'grid', gridTemplateColumns:'4fr 6fr' }}>
                        <div style={{ paddingRight:'clamp(24px, 4vw, 64px)', borderRight:'1px solid rgba(239,239,239,0.07)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                          <div style={{marginBottom:'48px'}}>
                            <p style={{fontFamily:'IBM Plex Mono',fontSize:'10px',letterSpacing:'0.24em',color:'#B91C1C',marginBottom:'20px',display:'flex',alignItems:'center',gap:'8px'}}>
                              <span style={{width:'18px',height:'1px',background:'#B91C1C',display:'inline-block'}}></span>
                              REGULATORY CLEARANCE
                            </p>
                            <div style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:'clamp(48px,6vw,80px)',lineHeight:0.88,textTransform:'uppercase'}}>
                              <div style={{color:'#EFEFEF'}}>EVERY REGULATION.</div>
                              <div>
                                <span style={{background:'#EFEFEF',color:'transparent',padding:'0 6px',display:'inline-block',cursor:'pointer',transition:'background 0.4s ease, color 0.4s ease',whiteSpace:'nowrap'}}
                                  onMouseEnter={e=>{(e.target as any).style.background='#F5C400';(e.target as any).style.color='#080808'}}
                                  onMouseLeave={e=>{(e.target as any).style.background='#EFEFEF';(e.target as any).style.color='transparent'}}>
                                  FULLY COVERED.
                                </span>
                              </div>
                              <div style={{fontFamily:'IBM Plex Mono',fontSize:'8px',letterSpacing:'0.16em',color:'rgba(239,239,239,0.18)',marginTop:'6px'}}>HOVER TO REVEAL</div>
                            </div>
                            <p style={{fontFamily:'IBM Plex Mono',fontSize:'11px',color:'rgba(239,239,239,0.38)',letterSpacing:'0.14em',marginTop:'16px'}}>HOVER EACH CLAUSE TO SEE EXACTLY HOW CIPHERA ADDRESSES IT.</p>
                          </div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}>
                            {[
                                { code:'DPDP ACT 2023', name:'Digital Personal Data Protection Act', fullName:'DPDP Act 2023', fullDesc:"India's landmark data protection legislation requiring explicit consent before processing personal data of Indian citizens.", keyPoints:['Explicit consent required before data processing','Data minimization — collect only what is needed','Right to erasure and correction for data principals','Mandatory breach notification within 72 hours'], penalty:'Up to ₹250 crore per violation' },
                                { code:'GDPR ART. 25', name:'Data protection by design and default', fullName:'GDPR Article 25', fullDesc:'EU regulation requiring privacy to be built into products from the ground up, not added as an afterthought.', keyPoints:['Privacy must be considered at design stage','Default settings must be most privacy-friendly','Pseudonymization and encryption required where appropriate',"Applies to any org processing EU residents' data"], penalty:'Up to €20M or 4% of global annual turnover' },
                                { code:'ISO 27001', name:'Information security management', fullName:'ISO 27001', fullDesc:'International standard for establishing, implementing, and maintaining an information security management system.', keyPoints:['Risk-based approach to information security','Mandatory security controls across 14 domains','Requires documented policies and procedures','Annual surveillance audits and 3-year recertification'] },
                                { code:'IT ACT 2000', name:'Section 43A sensitive data protection', fullName:'IT Act 2000', fullDesc:"India's IT Act Section 43A mandates compensation for failure to implement reasonable security practices for sensitive personal data.", keyPoints:['Applies to body corporates handling sensitive data','Sensitive data includes biometrics, financial info, health records','Must maintain a documented security policy','Negligence in data protection is a civil liability'], penalty:'Compensation to affected persons — no upper limit' },
                            ].map((row, idx) => (
                                <AnimateOnScroll key={row.code} delay={idx * 80} direction="right">
                                    <ComplianceRow code={row.code} name={row.name} fullName={row.fullName} fullDesc={row.fullDesc} keyPoints={row.keyPoints} penalty={row.penalty} />
                                </AnimateOnScroll>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── CTA (Task 6: watermark fix) ─────────────────────────── */}
                <section style={{
                    paddingTop: 'clamp(80px, 10vh, 120px)',
                    paddingBottom: 'clamp(80px, 10vh, 120px)',
                    borderTop: '1px solid rgba(239,239,239,0.07)',
                    minHeight: '520px',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                }}>
                    {/* CLASSIFIED watermark — Task 6 */}
                    <div style={{
                        position:'absolute', right:'-80px', top:'50%', transform:'translateY(-50%) rotate(-90deg)',
                        fontFamily:'Barlow Condensed, sans-serif', fontWeight:900, fontSize:'clamp(60px, 8vw, 100px)',
                        textTransform:'uppercase', color:'rgba(239,239,239,0.025)',
                        pointerEvents:'none', userSelect:'none', whiteSpace:'nowrap', zIndex:0,
                    }}>CLASSIFIED</div>

                    {/* Giant "0" Watermark - Effect 12 */}
                    <ZeroEasterEgg />

                    <div className="content-wrap" style={{ position:'relative', zIndex:1, width:'100%' }}>
                        {/* Headline Block */}
                        <div style={{marginBottom:'32px'}}>
                          <div style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:'clamp(56px,7vw,96px)',lineHeight:0.88,textTransform:'uppercase'}}>
                            <div style={{color:'#EFEFEF'}}>YOUR DOCUMENTS.</div>
                            <div style={{color:'#EFEFEF'}}>YOUR INFRASTRUCTURE.</div>
                            <div style={{color:'#F5C400'}}>YOUR CONTROL.</div>
                          </div>
                        </div>
                        <p style={{ fontFamily:'Barlow, sans-serif', fontWeight:400, fontSize:'13px', lineHeight:1.7, color:'rgba(239,239,239,0.5)', maxWidth:'400px', margin:'0 0 20px 0' }}>
                            No data transmitted externally. Runs entirely on-premise via Docker. Full compliance audit trail in every session.
                        </p>
                        <Link href="/dashboard" style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'#F5C400', color:'#080808', fontFamily:'"SF Pro Display", -apple-system, sans-serif', fontSize:'14px', letterSpacing:'0.02em', textTransform:'none', padding:'12px 28px', textDecoration:'none', fontWeight:600, borderRadius:'8px', transition:'all 0.2s' }}
                            onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.02)')}
                            onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}
                        >
                            Open Mission Control →
                        </Link>
                    </div>
                </section>

                {/* ── Footer (Task 8: terminal cursor) ────────────────────── */}
                <footer style={{ borderTop: '1px solid rgba(239,239,239,0.07)' }}>
                  <div className="content-wrap" style={{ padding: '40px clamp(36px,5vw,80px) 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(239,239,239,0.07)', paddingBottom: '40px', marginBottom: '20px', flexWrap: 'wrap', gap: '40px' }}>
                      
                      {/* Col 1 */}
                      <div>
                        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 900, fontSize: '24px', color: '#EFEFEF' }}>CIPHERA V3</div>
                        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'rgba(239,239,239,0.32)' }}>INTELLIGENT REDACTION</div>
                      </div>

                      {/* Col 2 */}
                      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: '#EFEFEF' }}>PLATFORM</div>
                          {[['Dashboard','/dashboard'],['API Keys','/settings'],['Settings','/settings']].map(([l,href]) => (
                            <Link key={l} href={href} style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'rgba(239,239,239,0.32)', textDecoration: 'none' }}>{l}</Link>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: '#EFEFEF' }}>LEGAL</div>
                          {['Privacy Policy','Terms of Service','DPDP Compliance'].map(l => (
                            <a key={l} href="#" style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'rgba(239,239,239,0.32)', textDecoration: 'none' }}>{l}</a>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Bottom row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'rgba(239,239,239,0.18)' }}>
                        © 2026 CIPHERA SYSTEMS.
                      </div>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'rgba(239,239,239,0.42)' }}>
                        {'>'} SESSION TERMINATED · 0 BYTES RETAINED <span style={{ color: '#F5C400', animation: 'blink 1s step-end infinite' }}>|</span>
                      </div>
                    </div>
                  </div>
                </footer>
                </div>
            </div>
        </>
    );
}