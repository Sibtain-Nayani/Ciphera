"use client";

/**
 * ConfidenceSlider.tsx
 * =====================
 * Lets the user control how sensitive the V3 detection pipeline is.
 * Lower threshold = more detections (more false positives).
 * Higher threshold = fewer detections (more precise).
 *
 * Place at: v3/frontend/src/components/redact/ConfidenceSlider.tsx
 *
 * Add to redact/page.tsx sidebar, just below <TemplateSelector />:
 *   import { ConfidenceSlider } from '@/components/redact/ConfidenceSlider';
 *   <ConfidenceSlider value={threshold} onChange={setThreshold} />
 *
 * And add state to WorkspacePage:
 *   const [threshold, setThreshold] = useState(0.50);
 *
 * Then pass threshold to redactionEngine.tokenize(..., threshold, ...)
 */

import React from 'react';
import { Gauge } from 'lucide-react';

interface Props {
    value:    number;
    onChange: (v: number) => void;
}

const PRESETS = [
    { label: 'High recall',  value: 0.30, desc: 'More detections, some false positives', color: '#F87171' },
    { label: 'Balanced',     value: 0.50, desc: 'Recommended for most documents',        color: '#FFA500' },
    { label: 'High precision', value: 0.75, desc: 'Fewer detections, very accurate',     color: '#34D399' },
];

export const ConfidenceSlider: React.FC<Props> = ({ value, onChange }) => {
    const pct = Math.round(value * 100);

    const color = pct <= 40 ? '#F87171' : pct <= 65 ? '#FFA500' : '#34D399';
    const label = pct <= 40 ? 'High recall' : pct <= 65 ? 'Balanced' : 'High precision';

    return (
        <div className="rounded-xl border border-[#2A2A2A] bg-[#181818] px-3.5 py-3 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md" style={{ backgroundColor: color + '20', color }}>
                        <Gauge className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-white uppercase tracking-wide" style={{ letterSpacing: '0.06em' }}>
                        Sensitivity
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold" style={{ color }}>{pct}%</span>
                    <span className="text-[9px] text-gray-600 font-medium">{label}</span>
                </div>
            </div>

            {/* Slider */}
            <div className="relative">
                <input
                    type="range"
                    min={0.20}
                    max={0.90}
                    step={0.05}
                    value={value}
                    onChange={e => onChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                        background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - 0.20) / 0.70) * 100}%, #2A2A2A ${((value - 0.20) / 0.70) * 100}%, #2A2A2A 100%)`,
                    }}
                />
            </div>

            {/* Preset buttons */}
            <div className="flex gap-1.5">
                {PRESETS.map(p => (
                    <button
                        key={p.value}
                        onClick={() => onChange(p.value)}
                        title={p.desc}
                        className={`flex-1 py-1 rounded-lg text-[9px] font-semibold transition-all cursor-pointer border ${
                            Math.abs(value - p.value) < 0.03
                                ? 'text-black border-transparent'
                                : 'text-gray-500 border-[#2A2A2A] hover:border-[#3A3A3A] hover:text-gray-300 bg-transparent'
                        }`}
                        style={Math.abs(value - p.value) < 0.03 ? { backgroundColor: p.color, borderColor: p.color } : {}}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            <p className="text-[9px] text-gray-600 font-mono leading-relaxed">
                {pct <= 40
                    ? 'Casting a wide net — expect more matches including edge cases.'
                    : pct <= 65
                    ? 'Balanced detection — good for most KYC, legal, and HR documents.'
                    : 'Strict mode — only high-confidence entities are flagged.'
                }
            </p>
        </div>
    );
};