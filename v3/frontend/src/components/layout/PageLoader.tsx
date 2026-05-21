"use client";

/**
 * PageLoader.tsx
 * ==============
 * Blocks the page with a full-screen animated loader.
 * The page content is hidden underneath until the animation completes.
 * Each page gets a unique thematic animation.
 *
 * Mid-way through each loader, the loading text morphs into a styled
 * "Start <Page>" button — a visual nod to the main Ciphera intro screen.
 *
 * Usage: wrap page content with <PageLoader page="dashboard">
 *   <YourPageContent />
 * </PageLoader>
 */

import React, { useEffect, useState } from 'react';
import { Shield, Settings } from 'lucide-react';

type PageType = 'dashboard' | 'redact' | 'batch' | 'settings';

interface PageLoaderProps {
    page:     PageType;
    children: React.ReactNode;
    duration?: number; // ms — default 1600
}

// ── Radar sweep — Mission Control ─────────────────────────────────────────────
function RadarLoader() {
    return (
        <div className="flex flex-col items-center gap-6">
            <div className="relative w-28 h-28">
                {[0, 1, 2].map(i => (
                    <div key={i} className="absolute rounded-full border border-[#FFA500]/20"
                        style={{ inset: `${i * 14}px` }} />
                ))}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-px bg-[#FFA500]/10" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-px h-full bg-[#FFA500]/10" />
                </div>
                <div className="absolute inset-0 rounded-full overflow-hidden">
                    <div className="absolute inset-0 animate-spin" style={{ animationDuration: '1.8s' }}>
                        <div className="absolute top-1/2 left-1/2 w-1/2 h-0.5 origin-left -translate-y-1/2"
                            style={{ background: 'linear-gradient(to right, #FFA500cc, transparent)' }} />
                    </div>
                    <div className="absolute inset-0 animate-spin" style={{ animationDuration: '1.8s', animationDelay: '-0.15s' }}>
                        <div className="absolute top-1/2 left-1/2 w-1/2 h-3 origin-left -translate-y-1/2 opacity-20"
                            style={{ background: 'linear-gradient(to right, #FFA500, transparent)' }} />
                    </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#FFA500]" />
                </div>
                <div className="absolute top-4 right-7 w-2 h-2 rounded-full bg-[#FFA500] animate-ping opacity-80" />
                <div className="absolute bottom-6 left-5 w-1.5 h-1.5 rounded-full bg-[#FFA500]/60 animate-ping" style={{ animationDelay: '0.4s' }} />
            </div>
            <div className="text-center space-y-1">
                <p className="text-sm font-bold text-white tracking-widest font-mono">MISSION CONTROL</p>
                <p className="text-[11px] text-[#FFA500]/60 font-mono">Scanning telemetry…</p>
            </div>
        </div>
    );
}

// ── Document scan line — Sanitize ─────────────────────────────────────────────
function ScanLoader() {
    return (
        <div className="flex flex-col items-center gap-6">
            <div className="relative w-24 h-32 border border-[#34D399]/30 rounded-xl overflow-hidden bg-[#0A0A0A] shadow-[0_0_30px_rgba(52,211,153,0.1)]">
                {[20, 33, 46, 59, 72, 85].map(top => (
                    <div key={top} className="absolute h-px bg-white/[0.06]" style={{ top: `${top}%`, left: '12px', right: '12px' }} />
                ))}
                <div className="absolute h-2.5 rounded bg-[#34D399]/15 border border-[#34D399]/25" style={{ top: '28%', left: '12px', right: '20px' }} />
                <div className="absolute h-2.5 rounded bg-[#34D399]/15 border border-[#34D399]/25" style={{ top: '56%', left: '12px', right: '30px' }} />
                <div className="absolute h-2.5 rounded bg-[#34D399]/10 border border-[#34D399]/20" style={{ top: '70%', left: '12px', right: '15px' }} />
                <div className="absolute left-0 right-0 h-0.5 bg-[#34D399] shadow-[0_0_12px_#34D399]"
                    style={{ animation: 'scanLine 1.4s ease-in-out infinite' }} />
                <div className="absolute left-0 right-0 h-8 pointer-events-none"
                    style={{ background: 'linear-gradient(transparent, rgba(52,211,153,0.06), transparent)', animation: 'scanLine 1.4s ease-in-out infinite' }} />
                <style>{`
                    @keyframes scanLine {
                        0%   { top: 4%; }
                        50%  { top: 88%; }
                        100% { top: 4%; }
                    }
                `}</style>
            </div>
            <div className="text-center space-y-1">
                <p className="text-sm font-bold text-white tracking-widest font-mono">SANITIZE</p>
                <p className="text-[11px] text-[#34D399]/60 font-mono">Initializing detection pipeline…</p>
            </div>
        </div>
    );
}

// ── Conveyor belt — Assembly Line ─────────────────────────────────────────────
function ConveyorLoader() {
    return (
        <div className="flex flex-col items-center gap-6">
            <div className="relative w-40 h-20 overflow-hidden">
                <div className="absolute bottom-5 left-0 right-0 h-px bg-[#818CF8]/20" />
                <div className="absolute bottom-3 left-0 right-0 h-px bg-[#818CF8]/10" />
                {[0, 1, 2, 3].map(i => (
                    <div key={i}
                        className="absolute bottom-6 w-9 h-7 rounded border border-[#818CF8]/40 bg-[#818CF8]/8 flex flex-col items-start justify-center gap-1 px-1.5"
                        style={{ animation: `conveyor 2.2s linear infinite`, animationDelay: `${i * -0.55}s`, left: '-2.5rem' }}>
                        <div className="w-full h-0.5 bg-[#818CF8]/30 rounded" />
                        <div className="w-3/4 h-0.5 bg-[#818CF8]/20 rounded" />
                        <div className="w-1/2 h-0.5 bg-[#818CF8]/20 rounded" />
                    </div>
                ))}
                {[0, 1, 2, 3, 4].map(i => (
                    <div key={i}
                        className="absolute bottom-1.5 w-3 h-3 rounded-full border border-[#818CF8]/25 bg-[#818CF8]/8 animate-spin"
                        style={{ left: `${i * 25}%`, animationDuration: '0.8s' }} />
                ))}
                <style>{`
                    @keyframes conveyor {
                        from { transform: translateX(0); }
                        to   { transform: translateX(12rem); }
                    }
                `}</style>
            </div>
            <div className="text-center space-y-1">
                <p className="text-sm font-bold text-white tracking-widest font-mono">ASSEMBLY LINE</p>
                <p className="text-[11px] text-[#818CF8]/60 font-mono">Loading batch processor…</p>
            </div>
        </div>
    );
}

// ── Gears — Engine Config ─────────────────────────────────────────────────────
function GearLoader() {
    return (
        <div className="flex flex-col items-center gap-6">
            <div className="relative w-28 h-28">
                <div className="absolute inset-4 rounded-full bg-[#F472B6]/5 blur-xl animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <Settings className="w-16 h-16 text-[#F472B6]/30 animate-spin" style={{ animationDuration: '4s' }} />
                </div>
                <div className="absolute -top-1 -right-1">
                    <Settings className="w-9 h-9 text-[#F472B6]/50 animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
                </div>
                <div className="absolute -bottom-1 -left-1">
                    <Settings className="w-6 h-6 text-[#F472B6]/40 animate-spin" style={{ animationDuration: '1.5s' }} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-[#F472B6]/60" />
                </div>
            </div>
            <div className="text-center space-y-1">
                <p className="text-sm font-bold text-white tracking-widest font-mono">ENGINE CONFIG</p>
                <p className="text-[11px] text-[#F472B6]/60 font-mono">Loading configuration…</p>
            </div>
        </div>
    );
}

// ── Page accent colors ────────────────────────────────────────────────────────
const PAGE_CONFIG: Record<PageType, { bg: string; accent: string; label: string }> = {
    dashboard: { bg: 'radial-gradient(ellipse at center, rgba(255,165,0,0.04) 0%, transparent 70%)',    accent: '#FFA500', label: 'Dashboard' },
    redact:    { bg: 'radial-gradient(ellipse at center, rgba(52,211,153,0.04) 0%, transparent 70%)',   accent: '#34D399', label: 'Redact'    },
    batch:     { bg: 'radial-gradient(ellipse at center, rgba(129,140,248,0.04) 0%, transparent 70%)',  accent: '#818CF8', label: 'Batch'     },
    settings:  { bg: 'radial-gradient(ellipse at center, rgba(244,114,182,0.04) 0%, transparent 70%)',  accent: '#F472B6', label: 'Settings'  },
};

// ── keyframes injected once ───────────────────────────────────────────────────
const GLOBAL_STYLES = `
@keyframes textBloom {
    0%   { opacity: 0; letter-spacing: 0.35em; transform: scale(0.88); }
    100% { opacity: 1; letter-spacing: 0.12em; transform: scale(1);    }
}
@keyframes btnMorph {
    0%   { opacity: 0; transform: scale(0.82) translateY(6px); }
    60%  { opacity: 1; transform: scale(1.04) translateY(-1px); }
    100% { opacity: 1; transform: scale(1) translateY(0);       }
}
@keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
}
`;

// ── Main component ────────────────────────────────────────────────────────────
export function PageLoader({ page, children, duration = 1600 }: PageLoaderProps) {
    const [done,       setDone]       = useState(false);
    const [fadeOut,    setFadeOut]    = useState(false);
    const [showButton, setShowButton] = useState(false);
    const cfg = PAGE_CONFIG[page];

    useEffect(() => {
        const fadeTimer   = setTimeout(() => setFadeOut(true),    duration - 320);
        const doneTimer   = setTimeout(() => setDone(true),       duration);
        const buttonTimer = setTimeout(() => setShowButton(true), duration * 0.45);
        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(doneTimer);
            clearTimeout(buttonTimer);
        };
    }, [duration]);

    return (
        <div className="relative w-full h-full">
            <style>{GLOBAL_STYLES}</style>

            {/* Page content — mounted but invisible until loader finishes */}
            <div className={`w-full h-full transition-opacity duration-300 ${done ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {children}
            </div>

            {/* Full-screen loader overlay */}
            {!done && (
                <div
                    className="fixed inset-0 z-[999] flex flex-col items-center justify-center"
                    style={{
                        background:      '#0A0A0A',
                        backgroundImage: cfg.bg,
                        opacity:         fadeOut ? 0 : 1,
                        transition:      'opacity 320ms ease',
                    }}
                >
                    {/* Top accent bar */}
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: cfg.accent + '40' }} />

                    {/* ── Blending overlay: text → button ── */}
                    <div className="mb-8 h-10 flex items-center justify-center">
                        {!showButton ? (
                            /* Phase 1 — loading text blooms in */
                            <span
                                key="loading-text"
                                className="text-[11px] font-mono uppercase"
                                style={{
                                    color:     cfg.accent,
                                    animation: 'textBloom 0.5s ease forwards',
                                    opacity:   0,
                                }}
                            >
                                Initializing {cfg.label}…
                            </span>
                        ) : (
                            /* Phase 2 — button morphs in */
                            <button
                                key="start-btn"
                                tabIndex={-1}
                                className="relative overflow-hidden px-5 py-2 rounded-md text-[11px] font-mono font-semibold uppercase tracking-widest border cursor-default select-none"
                                style={{
                                    borderColor: cfg.accent + '60',
                                    color:       cfg.accent,
                                    background:  cfg.accent + '0D',
                                    animation:   'btnMorph 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards',
                                    opacity:     0,
                                }}
                            >
                                {/* shimmer stripe */}
                                <span
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                        background:           `linear-gradient(105deg, transparent 40%, ${cfg.accent}22 50%, transparent 60%)`,
                                        backgroundSize:       '200% auto',
                                        animation:            'shimmer 1.4s linear infinite',
                                        animationDelay:       '0.2s',
                                    }}
                                />
                                <span className="relative z-10">Start {cfg.label}</span>
                            </button>
                        )}
                    </div>

                    {/* Per-page thematic loader */}
                    {page === 'dashboard' && <RadarLoader />}
                    {page === 'redact'    && <ScanLoader />}
                    {page === 'batch'     && <ConveyorLoader />}
                    {page === 'settings'  && <GearLoader />}

                    {/* Ciphera wordmark */}
                    <div className="absolute bottom-8 flex items-center gap-2 opacity-30">
                        <Shield className="w-3.5 h-3.5" style={{ color: cfg.accent }} />
                        <span className="text-xs font-mono text-gray-500">CIPHERA V3</span>
                    </div>
                </div>
            )}
        </div>
    );
}