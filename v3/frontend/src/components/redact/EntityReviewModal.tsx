"use client";

import React, { useState, useMemo } from 'react';
import {
    X, ShieldCheck, ShieldOff, CheckSquare, Square,
    AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { Token } from '@/lib/redactionEngine';

interface EntityReviewModalProps {
    isOpen:    boolean;
    tokens:    Token[];
    onConfirm: (approvedIds: Set<string>) => void;
    onCancel:  () => void;
}

const ENTITY_COLORS: Record<string, string> = {
    email: '#60A5FA', phone: '#34D399', creditCard: '#F59E0B', ssn: '#F472B6',
    names: '#3B82F6', dob: '#F87171', date: '#94A3B8', url: '#06B6D4', ip: '#A78BFA',
    aadhaar: '#F97316', pan: '#EAB308', gst: '#2DD4BF', ifsc: '#38BDF8',
    voterId: '#EC4899', passport: '#818CF8', vehicleReg: '#FB7185',
};

const TYPE_LABELS: Record<string, string> = {
    email: 'Email', phone: 'Phone', creditCard: 'Credit Card', ssn: 'SSN',
    names: 'Name', dob: 'Date of Birth', date: 'Date', url: 'URL', ip: 'IP Address',
    aadhaar: 'Aadhaar', pan: 'PAN', gst: 'GST', ifsc: 'IFSC',
    voterId: 'Voter ID', passport: 'Passport', vehicleReg: 'Vehicle Reg',
};

const EntityRow: React.FC<{ token: Token; color: string; isApproved: boolean; onToggle: () => void }> = ({ token, color, isApproved, onToggle }) => (
    <div onClick={onToggle}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${isApproved ? 'bg-white/[0.04] hover:bg-white/[0.07]' : 'opacity-50 hover:opacity-70 hover:bg-white/[0.02]'}`}>
        <div className="shrink-0">
            {isApproved ? <CheckSquare className="w-4 h-4" style={{ color }} /> : <Square className="w-4 h-4 text-gray-600" />}
        </div>
        <div className="flex-1 min-w-0">
            <p className={`text-sm font-mono font-medium truncate ${isApproved ? 'text-white' : 'text-gray-500'}`}>{token.value}</p>
            {token.score !== undefined && (
                <div className="flex items-center gap-2 mt-0.5">
                    <div className="h-1 w-16 bg-[#2A2A2A] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(token.score * 100).toFixed(0)}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-[9px] text-gray-600 font-mono">{(token.score * 100).toFixed(0)}% confidence</span>
                </div>
            )}
        </div>
        {isApproved ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 opacity-60 shrink-0" /> : <ShieldOff className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
    </div>
);

export const EntityReviewModal: React.FC<EntityReviewModalProps> = ({ isOpen, tokens, onConfirm, onCancel }) => {
    const sensitiveTokens = useMemo(() => tokens.filter(t => t.type !== 'text'), [tokens]);
    const [approved, setApproved]     = useState<Set<string>>(() => new Set(sensitiveTokens.map(t => t.id)));
    const [filterType, setFilterType] = useState<string>('all');

    if (!isOpen) return null;

    const entityTypes  = Array.from(new Set(sensitiveTokens.map(t => t.type)));
    const filtered     = filterType === 'all' ? sensitiveTokens : sensitiveTokens.filter(t => t.type === filterType);
    const toggleOne    = (id: string) => setApproved(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const approveAll   = () => setApproved(new Set(sensitiveTokens.map(t => t.id)));
    const rejectAll    = () => setApproved(new Set());
    const approveType  = (type: string) => setApproved(prev => { const n = new Set(prev); sensitiveTokens.filter(t => t.type === type).forEach(t => n.add(t.id)); return n; });
    const rejectType   = (type: string) => setApproved(prev => { const n = new Set(prev); sensitiveTokens.filter(t => t.type === type).forEach(t => n.delete(t.id)); return n; });
    const approvedCount = approved.size;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative z-10 w-full max-w-2xl mx-4 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><ShieldCheck className="w-4 h-4 text-emerald-400" /></div>
                        <div>
                            <h2 className="text-sm font-semibold text-white">Human-in-the-Loop Review</h2>
                            <p className="text-[11px] text-gray-500 mt-0.5">Approve or reject each detected entity before export</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-1.5 text-gray-500 hover:text-white hover:bg-[#2A2A2A] rounded-lg transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
                </div>

                {/* Stats bar */}
                <div className="px-5 py-3 bg-[#141414] border-b border-[#2A2A2A] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-gray-400 font-mono">{approvedCount} will redact</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-600" /><span className="text-xs text-gray-400 font-mono">{sensitiveTokens.length - approvedCount} will pass through</span></div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={approveAll} className="text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer font-medium">Approve All</button>
                        <span className="text-gray-700">·</span>
                        <button onClick={rejectAll} className="text-[11px] text-gray-500 hover:text-gray-300 cursor-pointer">Reject All</button>
                    </div>
                </div>

                {/* Filter tabs */}
                <div className="px-5 py-2 border-b border-[#2A2A2A] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
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

                {/* Entity list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                            <ShieldCheck className="w-8 h-8 mb-2 opacity-40" />
                            <p className="text-sm">No entities of this type detected</p>
                        </div>
                    )}
                    {filterType === 'all' ? entityTypes.map(type => {
                        const group  = sensitiveTokens.filter(t => t.type === type);
                        const color  = ENTITY_COLORS[type] || '#6B7280';
                        return (
                            <div key={type} className="mb-3">
                                <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>{TYPE_LABELS[type] || type}</span>
                                        <span className="text-[10px] text-gray-600 font-mono">{group.length} detected</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => approveType(type)} className="text-[10px] text-emerald-400 hover:text-emerald-300 cursor-pointer">all</button>
                                        <span className="text-gray-700 text-[10px]">/</span>
                                        <button onClick={() => rejectType(type)} className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer">none</button>
                                    </div>
                                </div>
                                {group.map(token => <EntityRow key={token.id} token={token} color={color} isApproved={approved.has(token.id)} onToggle={() => toggleOne(token.id)} />)}
                            </div>
                        );
                    }) : filtered.map(token => <EntityRow key={token.id} token={token} color={ENTITY_COLORS[token.type] || '#6B7280'} isApproved={approved.has(token.id)} onToggle={() => toggleOne(token.id)} />)}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-[#2A2A2A] flex items-center gap-3 shrink-0">
                    {approvedCount === 0 && (
                        <div className="flex items-center gap-1.5 text-amber-400 text-xs mr-auto">
                            <AlertTriangle className="w-3.5 h-3.5" />No entities selected — export will be unredacted
                        </div>
                    )}
                    <div className="ml-auto flex gap-3">
                        <button onClick={onCancel} className="px-4 py-2 border border-[#2A2A2A] text-gray-400 hover:text-white hover:bg-[#2A2A2A] rounded-xl text-sm font-medium transition-all cursor-pointer">Cancel</button>
                        <button onClick={() => onConfirm(approved)} className="flex items-center gap-2 px-5 py-2 bg-[#FFA500] hover:bg-[#ffb733] text-black rounded-xl text-sm font-semibold transition-all cursor-pointer">
                            <CheckCircle2 className="w-4 h-4" />Export {approvedCount} Redacted
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};