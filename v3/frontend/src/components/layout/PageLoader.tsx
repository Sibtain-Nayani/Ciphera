"use client";

/**
 * PageLoader.tsx
 * ==============
 * Blocks the page with a full-screen animated loader.
 * The page content is hidden underneath until the animation completes.
 * Each page gets a unique thematic animation.
 *
 * Usage: wrap page content with <PageLoader page="dashboard">
 *   <YourPageContent />
 * </PageLoader>
 *
 * Place at: v3/frontend/src/components/layout/PageLoader.tsx
 */

import React, { useEffect, useState } from 'react';
import { Shield, Settings, LayoutDashboard } from 'lucide-react';

type PageType = 'dashboard' | 'redact' | 'batch' | 'settings';

interface PageLoaderProps {
    page:     PageType;
    children: React.ReactNode;
    duration?: number; // ms — default 1400
}

// ── Radar sweep — Mission Control ─────────────────────────────────────────────
function RadarLoader() {
    return (
        <div className="flex flex-col items-center gap-6">
            <div className="relative w-28 h-28">
                {/* Rings */}
                {[0, 1, 2].map(i => (
                    <div key={i} className="absolute rounded-full border border-[#FFA500]/20"
                        style={{ inset: `${i * 14}px` }} />
                ))}
                {/* Cross-hairs */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-px bg-[#FFA500]/10" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-px h-full bg-[#FFA500]/10" />
                </div>
                {/* Sweep */}
                <div className="absolute inset-0 rounded-full overflow-hidden">
                    <div className="absolute inset-0 animate-spin" style={{ animationDuration: '1.8s' }}>
                        <div className="absolute top-1/2 left-1/2 w-1/2 h-0.5 origin-left -translate-y-1/2"
                            style={{ background: 'linear-gradient(to right, #FFA500cc, transparent)' }} />
                    </div>
                    {/* Sweep glow trail */}
                    <div className="absolute inset-0 animate-spin" style={{ animationDuration: '1.8s', animationDelay: '-0.15s' }}>
                        <div className="absolute top-1/2 left-1/2 w-1/2 h-3 origin-left -translate-y-1/2 opacity-20"
                            style={{ background: 'linear-gradient(to right, #FFA500, transparent)' }} />
                    </div>
                </div>
                {/* Center dot */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#FFA500]" />
                </div>
                {/* Blip */}
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
                {/* Paper lines */}
                {[20, 33, 46, 59, 72, 85].map(top => (
                    <div key={top} className="absolute h-px bg-white/[0.06]" style={{ top: `${top}%`, left: '12px', right: '12px' }} />
                ))}
                {/* Redaction blocks */}
                <div className="absolute h-2.5 rounded bg-[#34D399]/15 border border-[#34D399]/25" style={{ top: '28%', left: '12px', right: '20px' }} />
                <div className="absolute h-2.5 rounded bg-[#34D399]/15 border border-[#34D399]/25" style={{ top: '56%', left: '12px', right: '30px' }} />
                <div className="absolute h-2.5 rounded bg-[#34D399]/10 border border-[#34D399]/20" style={{ top: '70%', left: '12px', right: '15px' }} />
                {/* Scan line */}
                <div className="absolute left-0 right-0 h-0.5 bg-[#34D399] shadow-[0_0_12px_#34D399]"
                    style={{ animation: 'scanLine 1.4s ease-in-out infinite' }} />
                {/* Scan glow */}
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
                {/* Track rails */}
                <div className="absolute bottom-5 left-0 right-0 h-px bg-[#818CF8]/20" />
                <div className="absolute bottom-3 left-0 right-0 h-px bg-[#818CF8]/10" />
                {/* Moving document cards */}
                {[0, 1, 2, 3].map(i => (
                    <div key={i}
                        className="absolute bottom-6 w-9 h-7 rounded border border-[#818CF8]/40 bg-[#818CF8]/8 flex flex-col items-start justify-center gap-1 px-1.5"
                        style={{ animation: `conveyor 2.2s linear infinite`, animationDelay: `${i * -0.55}s`, left: '-2.5rem' }}>
                        <div className="w-full h-0.5 bg-[#818CF8]/30 rounded" />
                        <div className="w-3/4 h-0.5 bg-[#818CF8]/20 rounded" />
                        <div className="w-1/2 h-0.5 bg-[#818CF8]/20 rounded" />
                    </div>
                ))}
                {/* Rollers */}
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
                {/* Outer glow */}
                <div className="absolute inset-4 rounded-full bg-[#F472B6]/5 blur-xl animate-pulse" />
                {/* Large gear */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <Settings className="w-16 h-16 text-[#F472B6]/30 animate-spin" style={{ animationDuration: '4s' }} />
                </div>
                {/* Small gear top-right — counter-rotates */}
                <div className="absolute -top-1 -right-1">
                    <Settings className="w-9 h-9 text-[#F472B6]/50 animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
                </div>
                {/* Tiny gear bottom-left */}
                <div className="absolute -bottom-1 -left-1">
                    <Settings className="w-6 h-6 text-[#F472B6]/40 animate-spin" style={{ animationDuration: '1.5s' }} />
                </div>
                {/* Center shield */}
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

// ── Page colors ───────────────────────────────────────────────────────────────
const PAGE_CONFIG = {
    dashboard: { bg: 'radial-gradient(ellipse at center, rgba(255,165,0,0.04) 0%, transparent 70%)', accent: '#FFA500' },
    redact:    { bg: 'radial-gradient(ellipse at center, rgba(52,211,153,0.04) 0%, transparent 70%)', accent: '#34D399' },
    batch:     { bg: 'radial-gradient(ellipse at center, rgba(129,140,248,0.04) 0%, transparent 70%)', accent: '#818CF8' },
    settings:  { bg: 'radial-gradient(ellipse at center, rgba(244,114,182,0.04) 0%, transparent 70%)', accent: '#F472B6' },
};

// ── Main component ────────────────────────────────────────────────────────────
export function PageLoader({ page, children, duration = 1400 }: PageLoaderProps) {
    const [done, setDone] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);
    const cfg = PAGE_CONFIG[page];

    useEffect(() => {
        // Start fade-out slightly before done so transition is smooth
        const fadeTimer = setTimeout(() => setFadeOut(true), duration - 300);
        const doneTimer = setTimeout(() => setDone(true), duration);
        return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
    }, [duration]);

    return (
        <div className="relative w-full h-full">
            {/* Page content — always mounted but hidden until loader done */}
            <div className={`w-full h-full transition-opacity duration-300 ${done ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {children}
            </div>

            {/* Loader overlay — sits on top, fades out */}
            {!done && (
                <div
                    className="fixed inset-0 z-[999] flex flex-col items-center justify-center transition-opacity duration-300"
                    style={{
                        background: `#0A0A0A`,
                        backgroundImage: cfg.bg,
                        opacity: fadeOut ? 0 : 1,
                    }}
                >
                    {/* Top accent bar */}
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: cfg.accent + '40' }} />

                    {page === 'dashboard' && <RadarLoader />}
                    {page === 'redact'    && <ScanLoader />}
                    {page === 'batch'     && <ConveyorLoader />}
                    {page === 'settings'  && <GearLoader />}

                    {/* Ciphera wordmark at bottom */}
                    <div className="absolute bottom-8 flex items-center gap-2 opacity-30">
                        <Shield className="w-3.5 h-3.5" style={{ color: cfg.accent }} />
                        <span className="text-xs font-mono text-gray-500">CIPHERA V3</span>
                    </div>
                </div>
            )}
        </div>
    );
}