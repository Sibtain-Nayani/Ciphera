"use client";

/**
 * SiteLoader.tsx
 * ==============
 * Full-page loader that runs before the landing page appears.
 * CIPHERA letters are revealed one by one, then classified/redacted,
 * then declassified — ending with a smooth upward wipe that reveals
 * the landing page underneath seamlessly.
 *
 * Place at: v3/frontend/src/components/layout/SiteLoader.tsx
 */

import React, { useEffect, useRef, useState } from 'react';

const WORD    = 'CIPHERA';
const GLYPHS  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?';
const rg = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface SiteLoaderProps {
    onComplete: () => void;
}

export function SiteLoader({ onComplete }: SiteLoaderProps) {
    const [phase, setPhase]         = useState<'running' | 'wiping' | 'done'>('running');
    const [letterStates, setLetterStates] = useState<string[]>(Array(7).fill(''));
    const [letterColors, setLetterColors] = useState<string[]>(Array(7).fill('transparent'));
    const [statusText, setStatusText]     = useState('');
    const [showStatus, setShowStatus]     = useState(false);
    const [ruleWidth, setRuleWidth]       = useState(0);
    const [stageText, setStageText]       = useState('INITIALIZING');
    const [edgeGlow, setEdgeGlow]         = useState(false);
    const [wipeUp, setWipeUp]             = useState(false);
    const abortRef = useRef(false);

    useEffect(() => {
        abortRef.current = false;
        runSequence();
        return () => { abortRef.current = true; };
    }, []);

    const setLetterAt = (i: number, ch: string, color: string) => {
        setLetterStates(prev => { const n=[...prev]; n[i]=ch; return n; });
        setLetterColors(prev => { const n=[...prev]; n[i]=color; return n; });
    };

    const runSequence = async () => {
        await sleep(200);
        if (abortRef.current) return;

        // Phase 1: Letters type in one by one
        setStageText('INCOMING TRANSMISSION');
        for (let i = 0; i < 7; i++) {
            if (abortRef.current) return;
            // Brief scramble before settling
            for (let s = 0; s < 3; s++) {
                setLetterAt(i, rg(), 'rgba(255,255,255,0.4)');
                await sleep(50);
            }
            setLetterAt(i, WORD[i], 'rgba(255,255,255,0.92)');
            await sleep(90 + Math.random() * 40);
        }
        await sleep(400);

        // Phase 2: Threat detected — scramble all
        setStageText('THREAT DETECTED');
        setStatusText('[ CLASSIFICATION REQUIRED ]');
        setShowStatus(true);
        setEdgeGlow(true);

        const scrambleInterval = setInterval(() => {
            setLetterStates(prev => prev.map((_, i) =>
                Math.random() < 0.4 ? rg() : WORD[i]
            ));
            setLetterColors(prev => prev.map(() =>
                Math.random() < 0.35 ? '#b91c1c' : 'rgba(255,255,255,0.85)'
            ));
        }, 60);
        await sleep(1200);
        clearInterval(scrambleInterval);
        if (abortRef.current) return;

        // Settle back
        for (let i = 0; i < 7; i++) setLetterAt(i, WORD[i], 'rgba(255,255,255,0.92)');
        await sleep(150);

        // Phase 3: Full scramble chaos
        setStageText('FULL SCRAMBLE');
        const chaosInterval = setInterval(() => {
            setLetterStates(prev => prev.map(() => rg()));
            setLetterColors(prev => prev.map(() =>
                Math.random() < 0.4 ? '#b91c1c' : Math.random() < 0.3 ? '#FFA500' : 'rgba(255,255,255,0.7)'
            ));
        }, 40);
        await sleep(900);
        clearInterval(chaosInterval);
        if (abortRef.current) return;

        // Phase 4: REDACTION — letters go dark one by one
        setStageText('REDACTION PROTOCOL');
        setStatusText('[ REDACTION IN PROGRESS ]');
        for (let i = 0; i < 7; i++) {
            setLetterAt(i, '█', 'rgba(255,255,255,0.08)');
            await sleep(80);
        }
        await sleep(400);

        // Phase 5: Clearance — letters reveal right to left
        setStageText('CLEARANCE GRANTED');
        setStatusText('[ IDENTITY CONFIRMED ]');
        setEdgeGlow(false);
        for (let i = 6; i >= 0; i--) {
            setLetterAt(i, WORD[i], 'rgba(255,255,255,0.92)');
            await sleep(70);
        }
        await sleep(200);

        // Phase 6: Rule extends
        setStageText('CLASSIFIED · CONFIRMED');
        setStatusText('[ ACCESS GRANTED ]');
        setRuleWidth(280);
        await sleep(800);

        // Phase 7: Wipe up — transition to landing page
        setStageText('');
        setPhase('wiping');
        setWipeUp(true);
        await sleep(700);
        setPhase('done');
        onComplete();
    };

    if (phase === 'done') return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#080808] overflow-hidden"
            style={{
                transform: wipeUp ? 'translateY(-100%)' : 'translateY(0)',
                transition: wipeUp ? 'transform 0.65s cubic-bezier(0.76, 0, 0.24, 1)' : 'none',
            }}
        >
            {/* Subtle scan line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.04] pointer-events-none"
                style={{ animation: 'scanPass 2.5s ease-out forwards' }} />

            {/* Edge glow */}
            <div className="absolute inset-0 pointer-events-none transition-all duration-500"
                style={{ boxShadow: edgeGlow ? 'inset 0 0 60px rgba(185,28,28,0.12)' : 'none' }} />

            {/* Grid dots background */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
                style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

            {/* Status */}
            <div className="mb-8 h-4 flex items-center justify-center">
                <span
                    className="font-mono text-[10px] tracking-[0.22em] text-[#b91c1c] uppercase transition-opacity duration-300"
                    style={{ opacity: showStatus ? 1 : 0 }}
                >
                    {statusText}
                </span>
            </div>

            {/* CIPHERA wordmark */}
            <div className="flex items-center gap-1 select-none">
                {letterStates.map((ch, i) => (
                    <span
                        key={i}
                        className="font-black text-[72px] md:text-[88px] leading-none tracking-[0.06em] transition-colors duration-75"
                        style={{ color: letterColors[i], fontFamily: '"Arial Black", "Helvetica Neue", sans-serif' }}
                    >
                        {ch || '\u00A0'}
                    </span>
                ))}
            </div>

            {/* Rule line */}
            <div
                className="mt-6 h-px bg-white/20 transition-all duration-[1100ms] ease-out"
                style={{ width: `${ruleWidth}px` }}
            />

            {/* Stage label */}
            <div className="mt-5 font-mono text-[9px] tracking-[0.22em] text-white/20 uppercase h-4 flex items-center">
                {stageText}
            </div>

            {/* Bottom brand */}
            <div className="absolute bottom-6 font-mono text-[9px] tracking-[0.18em] text-white/10 uppercase">
                Ciphera V3 · PII Anonymization Engine
            </div>

            <style>{`
                @keyframes scanPass {
                    0%   { top: 0; opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </div>
    );
}