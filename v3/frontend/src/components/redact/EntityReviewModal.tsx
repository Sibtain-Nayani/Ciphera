"use client";

import React, { useState, useMemo } from 'react';
import {
    X, ShieldCheck, ShieldOff, CheckSquare, Square,
    AlertTriangle, CheckCircle2, Eye, Slash, Hash,
} from 'lucide-react';
import { Token } from '@/lib/redactionEngine';
import { RedactionAction } from '@/store/documentStore';

interface EntityReviewModalProps {
    isOpen:    boolean;
    tokens:    Token[];
    onConfirm: (approvedIds: Set<string>, actionOverrides: Record<string, RedactionAction>) => void;
    onCancel:  () => void;
}

const ENTITY_COLORS: Record<string, string> = {
    email: '#60A5FA', phone: '#34D399', creditCard: '#F59E0B', ssn: '#F472B6',
    names: '#3B82F6', dob: '#F87171', date: '#94A3B8', url: '#06B6D4', ip: '#A78BFA',
    aadhaar: '#F97316', pan: '#EAB308', gst: '#2DD4BF', ifsc: '#38BDF8',
    voterId: '#EC4899', passport: '#818CF8', vehicleReg: '#FB7185',
    upi: '#34D399', bankAccount: '#60A5FA', drivingLicence: '#F97316', pinCode: '#A78BFA',
};

const TYPE_LABELS: Record<string, string> = {
    email: 'Email', phone: 'Phone', creditCard: 'Credit Card', ssn: 'SSN',
    names: 'Name', dob: 'Date of Birth', date: 'Date', url: 'URL', ip: 'IP Address',
    aadhaar: 'Aadhaar', pan: 'PAN', gst: 'GST', ifsc: 'IFSC',
    voterId: 'Voter ID', passport: 'Passport', vehicleReg: 'Vehicle Reg',
    upi: 'UPI ID', bankAccount: 'Bank Account', drivingLicence: 'Driving Licence', pinCode: 'PIN Code',
};

type SortMode = 'type' | 'score' | 'position';

// ── Per-entity action picker ──────────────────────────────────────────────────
const ACTION_OPTIONS: { value: RedactionAction; label: string; icon: React.ReactNode }[] = [
    { value: 'replace',  label: 'Replace',  icon: <Hash className="w-3 h-3" /> },
    { value: 'mask',     label: 'Mask',     icon: <Eye className="w-3 h-3" /> },
    { value: 'blackout', label: 'Blackout', icon: <Slash className="w-3 h-3" /> },
];

function ActionPicker({
    value, onChange, color,
}: { value: RedactionAction; onChange: (a: RedactionAction) => void; color: string }) {
    return (
        <div style={{ display: 'flex', gap: '2px' }}>
            {ACTION_OPTIONS.map(opt => (
                <button
                    key={opt.value}
                    onClick={(e) => { e.stopPropagation(); onChange(opt.value); }}
                    title={opt.label}
                    style={{
                        padding:         '3px 6px',
                        borderRadius:    '5px',
                        border:          `1px solid ${value === opt.value ? color + '60' : 'transparent'}`,
                        background:      value === opt.value ? color + '20' : 'transparent',
                        color:           value === opt.value ? color : '#6B7280',
                        cursor:          'pointer',
                        display:         'flex',
                        alignItems:      'center',
                        gap:             '3px',
                        fontSize:        '9px',
                        fontFamily:      'Courier New, monospace',
                        letterSpacing:   '0.06em',
                        transition:      'all 0.12s',
                    }}
                >
                    {opt.icon}
                    <span className="hidden sm:inline">{opt.label}</span>
                </button>
            ))}
        </div>
    );
}

// ── Entity row ────────────────────────────────────────────────────────────────
const EntityRow: React.FC<{
    token:          Token;
    color:          string;
    isApproved:     boolean;
    actionOverride: RedactionAction;
    onToggle:       () => void;
    onActionChange: (a: RedactionAction) => void;
}> = ({ token, color, isApproved, actionOverride, onToggle, onActionChange }) => {
    const score    = token.score ?? 0;
    const isHindi  = token.language === 'hi';

    return (
        <div
            className={`rounded-xl transition-all ${isApproved ? 'bg-white/[0.03]' : 'opacity-40'}`}
            style={{ border: `1px solid ${isApproved ? color + '25' : 'transparent'}`, marginBottom: '2px' }}
        >
            {/* Main row */}
            <div
                onClick={onToggle}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03] rounded-xl transition-all"
            >
                {/* Checkbox */}
                <div className="shrink-0">
                    {isApproved
                        ? <CheckSquare className="w-4 h-4" style={{ color }} />
                        : <Square className="w-4 h-4 text-gray-600" />
                    }
                </div>

                {/* Value + confidence */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className={`text-sm font-mono font-medium truncate ${isApproved ? 'text-white' : 'text-gray-500'}`}>
                            {token.value}
                        </p>
                        {isHindi && (
                            <span style={{
                                fontSize: '8px', fontFamily: 'sans-serif',
                                color: color, opacity: 0.8,
                                border: `1px solid ${color}40`,
                                borderRadius: '3px', padding: '0 3px',
                            }}>हि</span>
                        )}
                    </div>
                    {/* Score bar */}
                    {token.score !== undefined && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="h-1 w-20 bg-[#2A2A2A] rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-300"
                                    style={{
                                        width:      `${score * 100}%`,
                                        background: score >= 0.85 ? '#22c55e' : score >= 0.65 ? '#FFA500' : '#ef4444',
                                    }} />
                            </div>
                            <span className="text-[9px] text-gray-600 font-mono">
                                {(score * 100).toFixed(0)}% confidence
                                {token.source ? ` · ${token.source}` : ''}
                            </span>
                        </div>
                    )}
                    {/* ML reasoning — collapsed, shown on token hover in workspace */}
                    {token.mlReasoning && (
                        <p className="text-[9px] text-gray-600 mt-0.5 font-mono truncate">
                            {token.mlReasoning}
                        </p>
                    )}
                </div>

                {/* Shield icon */}
                {isApproved
                    ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 opacity-60 shrink-0" />
                    : <ShieldOff   className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                }
            </div>

            {/* Action override row — only shown when approved */}
            {isApproved && (
                <div className="px-10 pb-2.5 flex items-center gap-2">
                    <span style={{
                        fontFamily:  'Courier New, monospace',
                        fontSize:    '8px',
                        color:       '#4B5563',
                        letterSpacing:'0.1em',
                        textTransform:'uppercase',
                    }}>Action:</span>
                    <ActionPicker value={actionOverride} onChange={onActionChange} color={color} />
                </div>
            )}
        </div>
    );
};

// ── Modal ─────────────────────────────────────────────────────────────────────
export const EntityReviewModal: React.FC<EntityReviewModalProps> = ({
    isOpen, tokens, onConfirm, onCancel,
}) => {
    const sensitiveTokens = useMemo(() => tokens.filter(t => t.type !== 'text'), [tokens]);

    const [approved, setApproved] = useState<Set<string>>(
        () => new Set(sensitiveTokens.map(t => t.id))
    );
    // Per-entity action overrides — default = 'replace'
    const [actionOverrides, setActionOverrides] = useState<Record<string, RedactionAction>>(
        () => Object.fromEntries(sensitiveTokens.map(t => [t.id, 'replace' as RedactionAction]))
    );
    const [filterType, setFilterType] = useState<string>('all');
    const [sortMode,   setSortMode]   = useState<SortMode>('type');
    const [filterLang, setFilterLang] = useState<'all' | 'en' | 'hi'>('all');

    if (!isOpen) return null;

    const entityTypes = Array.from(new Set(sensitiveTokens.map(t => t.type)));
    const hasHindi    = sensitiveTokens.some(t => t.language === 'hi');

    // Apply filters
    let filtered = filterType === 'all'
        ? sensitiveTokens
        : sensitiveTokens.filter(t => t.type === filterType);

    if (filterLang !== 'all') {
        filtered = filtered.filter(t =>
            filterLang === 'hi' ? t.language === 'hi' : t.language !== 'hi'
        );
    }

    // Apply sort
    const sorted = [...filtered].sort((a, b) => {
        if (sortMode === 'score')    return (b.score ?? 0) - (a.score ?? 0);
        if (sortMode === 'position') return 0; // original order
        return (a.type ?? '').localeCompare(b.type ?? '');
    });

    const toggleOne       = (id: string) => setApproved(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const approveAll      = () => setApproved(new Set(sensitiveTokens.map(t => t.id)));
    const rejectAll       = () => setApproved(new Set());
    const approveType     = (type: string) => setApproved(prev => { const n = new Set(prev); sensitiveTokens.filter(t => t.type === type).forEach(t => n.add(t.id)); return n; });
    const rejectType      = (type: string) => setApproved(prev => { const n = new Set(prev); sensitiveTokens.filter(t => t.type === type).forEach(t => n.delete(t.id)); return n; });

    const setAction = (id: string, action: RedactionAction) =>
        setActionOverrides(prev => ({ ...prev, [id]: action }));

    // Bulk action for a type
    const setActionForType = (type: string, action: RedactionAction) =>
        setActionOverrides(prev => {
            const n = { ...prev };
            sensitiveTokens.filter(t => t.type === type).forEach(t => { n[t.id] = action; });
            return n;
        });

    const approvedCount = approved.size;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative z-10 w-full max-w-2xl mx-4 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl shadow-2xl flex flex-col max-h-[88vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-white">Human-in-the-Loop Review</h2>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                                Approve entities, choose per-entity redaction action, then export
                            </p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-1.5 text-gray-500 hover:text-white hover:bg-[#2A2A2A] rounded-lg transition-colors cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Stats bar */}
                <div className="px-5 py-2.5 bg-[#141414] border-b border-[#2A2A2A] flex items-center justify-between shrink-0 flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-xs text-gray-400 font-mono">{approvedCount} will redact</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-gray-600" />
                            <span className="text-xs text-gray-400 font-mono">{sensitiveTokens.length - approvedCount} pass through</span>
                        </div>
                        {hasHindi && (
                            <div className="flex items-center gap-1.5">
                                <span style={{ fontFamily: 'sans-serif', fontSize: '10px', color: '#F97316', border: '1px solid #F9731640', borderRadius: '3px', padding: '0 4px' }}>हि</span>
                                <span className="text-xs text-gray-500 font-mono">{sensitiveTokens.filter(t => t.language === 'hi').length} Hindi</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={approveAll} className="text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer font-medium">Approve All</button>
                        <span className="text-gray-700">·</span>
                        <button onClick={rejectAll} className="text-[11px] text-gray-500 hover:text-gray-300 cursor-pointer">Reject All</button>
                    </div>
                </div>

                {/* Filter + sort controls */}
                <div className="px-4 py-2 border-b border-[#2A2A2A] shrink-0 flex flex-wrap gap-2 items-center">
                    {/* Type filter tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                        <button onClick={() => setFilterType('all')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${filterType === 'all' ? 'bg-[#FFA500]/15 text-[#FFA500] border border-[#FFA500]/30' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2A2A2A]'}`}>
                            All ({sensitiveTokens.length})
                        </button>
                        {entityTypes.map(type => {
                            const color = ENTITY_COLORS[type] || '#6B7280';
                            const count = sensitiveTokens.filter(t => t.type === type).length;
                            return (
                                <button key={type} onClick={() => setFilterType(type)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap border ${filterType === type ? 'opacity-100' : 'opacity-50 hover:opacity-80 border-transparent bg-[#2A2A2A]'}`}
                                    style={filterType === type ? { backgroundColor: color + '20', color, borderColor: color + '40' } : {}}>
                                    {TYPE_LABELS[type] || type} ({count})
                                </button>
                            );
                        })}
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Language filter — only shown if Hindi entities present */}
                    {hasHindi && (
                        <div className="flex items-center gap-1">
                            {(['all', 'en', 'hi'] as const).map(lang => (
                                <button key={lang} onClick={() => setFilterLang(lang)}
                                    className={`px-2 py-1 rounded text-[10px] font-mono transition-all cursor-pointer ${filterLang === lang ? 'bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30' : 'text-gray-600 hover:text-gray-400'}`}>
                                    {lang === 'all' ? 'All langs' : lang === 'hi' ? 'हिंदी' : 'English'}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Sort */}
                    <div className="flex items-center gap-1">
                        {(['type', 'score', 'position'] as const).map(s => (
                            <button key={s} onClick={() => setSortMode(s)}
                                className={`px-2 py-1 rounded text-[10px] font-mono transition-all cursor-pointer capitalize ${sortMode === s ? 'bg-[#2A2A2A] text-white' : 'text-gray-600 hover:text-gray-400'}`}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Entity list */}
                <div className="flex-1 overflow-y-auto p-3">
                    {sorted.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                            <ShieldCheck className="w-8 h-8 mb-2 opacity-40" />
                            <p className="text-sm">No entities match current filter</p>
                        </div>
                    )}

                    {filterType === 'all' && filterLang === 'all'
                        // Grouped by type
                        ? entityTypes.map(type => {
                            const group = sensitiveTokens.filter(t => t.type === type);
                            const color = ENTITY_COLORS[type] || '#6B7280';
                            const sortedGroup = sortMode === 'score'
                                ? [...group].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                                : group;
                            return (
                                <div key={type} className="mb-4">
                                    {/* Group header */}
                                    <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
                                                {TYPE_LABELS[type] || type}
                                            </span>
                                            <span className="text-[10px] text-gray-600 font-mono">{group.length} detected</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Bulk approve/reject */}
                                            <button onClick={() => approveType(type)} className="text-[10px] text-emerald-400 hover:text-emerald-300 cursor-pointer">all</button>
                                            <span className="text-gray-700 text-[10px]">/</span>
                                            <button onClick={() => rejectType(type)} className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer">none</button>
                                            {/* Bulk action for type */}
                                            <span className="text-gray-700 text-[10px] ml-1">·</span>
                                            <ActionPicker
                                                value={actionOverrides[group[0]?.id] ?? 'replace'}
                                                onChange={a => setActionForType(type, a)}
                                                color={color}
                                            />
                                        </div>
                                    </div>
                                    {sortedGroup.map(token => (
                                        <EntityRow
                                            key={token.id}
                                            token={token}
                                            color={color}
                                            isApproved={approved.has(token.id)}
                                            actionOverride={actionOverrides[token.id] ?? 'replace'}
                                            onToggle={() => toggleOne(token.id)}
                                            onActionChange={a => setAction(token.id, a)}
                                        />
                                    ))}
                                </div>
                            );
                        })
                        // Flat list (when filtered)
                        : sorted.map(token => (
                            <EntityRow
                                key={token.id}
                                token={token}
                                color={ENTITY_COLORS[token.type] || '#6B7280'}
                                isApproved={approved.has(token.id)}
                                actionOverride={actionOverrides[token.id] ?? 'replace'}
                                onToggle={() => toggleOne(token.id)}
                                onActionChange={a => setAction(token.id, a)}
                            />
                        ))
                    }
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-[#2A2A2A] flex items-center gap-3 shrink-0">
                    {approvedCount === 0 && (
                        <div className="flex items-center gap-1.5 text-amber-400 text-xs mr-auto">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            No entities selected — export will be unredacted
                        </div>
                    )}
                    <div className="ml-auto flex gap-3">
                        <button onClick={onCancel}
                            className="px-4 py-2 border border-[#2A2A2A] text-gray-400 hover:text-white hover:bg-[#2A2A2A] rounded-xl text-sm font-medium transition-all cursor-pointer">
                            Cancel
                        </button>
                        <button onClick={() => onConfirm(approved, actionOverrides)}
                            className="flex items-center gap-2 px-5 py-2 bg-[#FFA500] hover:bg-[#ffb733] text-black rounded-xl text-sm font-semibold transition-all cursor-pointer">
                            <CheckCircle2 className="w-4 h-4" />
                            Export {approvedCount} Redacted
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};