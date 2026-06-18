"use client";

import React, { useState, useEffect } from 'react';
import { Copy, Check, Trash2, Plus, BarChart3, Loader2, RefreshCw, Key } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUiStore } from '@/store/uiStore';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Tooltip } from '@/components/ui/Tooltip';

interface ApiKey {
    key_id:         string;
    name:           string;
    description:    string;
    key_prefix:     string;
    created_at:     string;
    expires_at:     string | null;
    last_used_at:   string | null;
    request_count:  number;
    is_active:      boolean;
    rate_limit_rpm: number;
}

const inputStyle: React.CSSProperties = {
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: '11px',
    fontWeight: 500,
    background: '#0d0d0d',
    border: '1px solid rgba(239,239,239,0.15)',
    color: '#EFEFEF',
    padding: '10px 16px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
};

export const ApiKeyManager: React.FC = () => {
    const [keys,        setKeys]        = useState<ApiKey[]>([]);
    const [loading,     setLoading]     = useState(false);
    const [showCreate,  setShowCreate]  = useState(false);
    const [createdKey,  setCreatedKey]  = useState<string | null>(null);
    const [copied,      setCopied]      = useState<string | null>(null);
    const [showUsage,   setShowUsage]   = useState<string | null>(null);
    const [usageData,   setUsageData]   = useState<any>(null);
    const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);

    // Create form state
    const [name,       setName]       = useState('');
    const [desc,       setDesc]       = useState('');
    const [rpm,        setRpm]        = useState('60');
    const [expDays,    setExpDays]    = useState('');
    const [createBusy, setCreateBusy] = useState(false);
    const [error,      setError]      = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/v3/keys/list');
            if (res.ok) {
                const d = await res.json();
                setKeys(d.keys || []);
            } else {
                setError('Failed to load keys. Make sure you are logged in.');
            }
        } catch {
            setError('Backend unreachable.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const createKey = async () => {
        if (!name.trim()) return;
        setCreateBusy(true); setError('');
        try {
            const body: any = {
                name,
                description: desc,
                rate_limit_rpm: parseInt(rpm) || 60,
            };
            if (expDays) body.expires_in_days = parseInt(expDays);

            const res = await apiFetch('/api/v3/keys/create', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.detail || 'Failed to create key');
            }
            const d = await res.json();
            setCreatedKey(d.api_key);
            setShowCreate(false);
            setName(''); setDesc(''); setRpm('60'); setExpDays('');
            await load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setCreateBusy(false);
        }
    };

    const confirmRevokeKey = async () => {
        if (!revokeKeyId) return;
        try {
            await apiFetch(`/api/v3/keys/${revokeKeyId}`, { method: 'DELETE' });
            // Optimistically remove from UI immediately
            setKeys(prev => prev.filter(k => k.key_id !== revokeKeyId));
            useUiStore.getState().addToast('Key revoked.', 'success');
            // Also re-fetch for backend consistency
            await load();
        } catch {
            useUiStore.getState().addToast('Failed to revoke key.', 'error');
        } finally {
            setRevokeKeyId(null);
        }
    };

    const copyText = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const loadUsage = async (keyId: string) => {
        if (showUsage === keyId) { setShowUsage(null); setUsageData(null); return; }
        setShowUsage(keyId);
        const res = await apiFetch(`/api/v3/keys/${keyId}/usage`);
        if (res.ok) setUsageData(await res.json());
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', margin: 0, letterSpacing: '0.03em' }}>API KEYS</h3>
                    <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.55)', marginTop: '6px' }}>
                        JWT-authenticated keys. Each key has its own rate limit and usage tracking.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Tooltip content="Refresh list">
                        <button onClick={load} disabled={loading}
                            className="p-2 border border-[rgba(239,239,239,0.15)] hover:bg-[rgba(245,196,0,0.1)] hover:text-[#F5C400] hover:border-[#F5C400] text-[rgba(239,239,239,0.5)] transition-colors">
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </Tooltip>
                    {!showCreate && !createdKey && (
                        <button onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 bg-[rgba(245,196,0,0.1)] hover:bg-[rgba(245,196,0,0.2)] text-[#F5C400] transition-colors border border-[rgba(245,196,0,0.2)] px-4 py-2"
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                            <Plus size={14} /> NEW API KEY
                        </button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', padding: '12px 16px', background: 'rgba(248,113,113,0.05)' }}>
                    {error}
                </div>
            )}

            {/* Created key banner */}
            {createdKey && (
                <div style={{ border: '1px solid rgba(74,222,128,0.3)', padding: '20px 24px', background: '#131315', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #4ade80, transparent)', opacity: 0.5 }} />
                    <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '14px', fontWeight: 700, color: '#4ade80', margin: '0 0 10px 0' }}>✓ KEY GENERATED — copy now, not shown again</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: '#EFEFEF', background: '#0a0a0b', padding: '8px 14px', flex: 1, border: '1px solid rgba(239,239,239,0.1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{createdKey}</code>
                        <button onClick={() => copyText(createdKey, 'new')}
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', border: `1px solid ${copied === 'new' ? 'rgba(74,222,128,0.3)' : 'rgba(239,239,239,0.2)'}`, background: '#F5C400', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: copied === 'new' ? '#4ade80' : '#080808', fontWeight: 700, flexShrink: 0 }}>
                            {copied === 'new' ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                            {copied === 'new' ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <button onClick={() => setCreatedKey(null)} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, background: 'none', border: 'none', color: 'rgba(239,239,239,0.4)', cursor: 'pointer', marginTop: '12px', padding: 0, letterSpacing: '0.14em', textTransform: 'uppercase' }}
                        className="hover:text-[#EFEFEF] transition-colors">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Create form */}
            {showCreate && !createdKey && (
                <div className="p-6 bg-[#131315] border border-[rgba(239,239,239,0.15)] animate-stage-in">
                    <h4 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '16px', fontWeight: 700, color: '#EFEFEF', marginBottom: '20px' }}>
                        GENERATE API KEY
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2 md:col-span-2">
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase' }}>Key Name *</label>
                            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production Integration" style={inputStyle}
                                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                                onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.15)'} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase' }}>Description</label>
                            <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional note" style={inputStyle}
                                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                                onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.15)'} />
                        </div>
                        <div className="space-y-2">
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase' }}>Rate Limit (req/min)</label>
                            <input type="number" min="1" max="1000" value={rpm} onChange={e => setRpm(e.target.value)} style={inputStyle}
                                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                                onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.15)'} />
                        </div>
                        <div className="space-y-2">
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase' }}>Expires in days (optional)</label>
                            <input type="number" min="1" max="365" value={expDays} onChange={e => setExpDays(e.target.value)} placeholder="Never" style={inputStyle}
                                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                                onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.15)'} />
                        </div>
                    </div>
                    <div className="flex gap-4 mt-8">
                        <button onClick={createKey} disabled={!name.trim() || createBusy}
                            className="bg-[#F5C400] hover:bg-[#d4a900] text-black px-6 py-2 transition-colors flex items-center gap-2 disabled:opacity-50"
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                            {createBusy ? <Loader2 size={14} className="animate-spin" /> : 'GENERATE KEY'}
                        </button>
                        <button onClick={() => setShowCreate(false)}
                            className="bg-transparent border border-[rgba(239,239,239,0.2)] hover:bg-[rgba(239,239,239,0.05)] text-[#EFEFEF] px-6 py-2 transition-colors"
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            {/* Keys list */}
            {loading && !keys.length ? (
                <div style={{ padding: '40px', textAlign: 'center', fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.3)' }}>
                    Loading keys…
                </div>
            ) : keys.length === 0 && !showCreate ? (
                <div className="flex flex-col items-center justify-center py-16 bg-[#131315] border border-[rgba(239,239,239,0.15)] animate-stage-in relative overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#F5C400] blur-[100px] rounded-full opacity-[0.03] pointer-events-none" />
                    <div className="p-4 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] mb-4 relative z-10">
                        <Key className="w-8 h-8 text-[#F5C400]/60" />
                    </div>
                    <h4 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', marginBottom: '8px' }} className="relative z-10">
                        No API Keys Generated
                    </h4>
                    <p style={{ fontFamily: '"SF Pro Display", sans-serif', fontSize: '13px', color: 'rgba(239,239,239,0.5)', maxWidth: '300px', textAlign: 'center', marginBottom: '24px' }} className="relative z-10">
                        Create an API key to securely authenticate and interact with the Ciphera redaction engine programmatically.
                    </p>
                    <button onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 bg-[rgba(245,196,0,0.1)] hover:bg-[rgba(245,196,0,0.2)] text-[#F5C400] transition-colors border border-[rgba(245,196,0,0.2)] px-6 py-2.5 relative z-10"
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                        <Plus size={14} /> GENERATE YOUR FIRST KEY
                    </button>
                </div>
            ) : (
                <div className="space-y-[2px]">
                    {keys.map((key) => (
                        <div key={key.key_id} className="bg-[#131315] border border-[rgba(239,239,239,0.15)] relative group">
                            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[rgba(245,196,0,0.5)]" />
                            
                            <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', color: '#EFEFEF' }}>{key.name}</span>
                                        <span className={`px-2 py-0.5 text-[10px] ${key.is_active ? 'bg-[rgba(74,222,128,0.1)] text-[#4ade80]' : 'bg-[rgba(239,68,68,0.1)] text-[#ef4444]'}`} style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                            {key.is_active ? 'ACTIVE' : 'REVOKED'}
                                        </span>
                                    </div>
                                    <p style={{ fontFamily: '"SF Pro Display", sans-serif', fontSize: '13px', color: 'rgba(239,239,239,0.5)', wordBreak: 'break-all' }}>
                                        {key.description || 'No description provided'}
                                    </p>
                                    <div className="mt-3 flex gap-2 flex-wrap">
                                        <span className="px-2 py-0.5 border border-[rgba(239,239,239,0.1)] text-[10px] text-[#EFEFEF] opacity-70" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                            PREFIX: {key.key_prefix}
                                        </span>
                                        <span className="px-2 py-0.5 border border-[rgba(239,239,239,0.1)] text-[10px] text-[#EFEFEF] opacity-70" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                            {key.request_count.toLocaleString()} REQUESTS
                                        </span>
                                        <span className="px-2 py-0.5 border border-[rgba(239,239,239,0.1)] text-[10px] text-[#EFEFEF] opacity-70" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                            {key.rate_limit_rpm}/MIN
                                        </span>
                                        <span className="px-2 py-0.5 border border-[rgba(239,239,239,0.1)] text-[10px] text-[#EFEFEF] opacity-70" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                            LAST: {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'NEVER'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Tooltip content="Copy Key ID">
                                        <button onClick={() => copyText(key.key_prefix, key.key_id)}
                                            className="p-2 border border-[rgba(239,239,239,0.15)] hover:bg-[rgba(245,196,0,0.1)] hover:text-[#F5C400] hover:border-[#F5C400] text-[rgba(239,239,239,0.5)] transition-colors">
                                            {copied === key.key_id ? <Check size={16} className="text-[#4ade80]" /> : <Copy size={16} />}
                                        </button>
                                    </Tooltip>
                                    <Tooltip content="Usage History">
                                        <button onClick={() => loadUsage(key.key_id)}
                                            className="p-2 border border-[rgba(239,239,239,0.15)] hover:bg-[rgba(239,239,239,0.1)] text-[rgba(239,239,239,0.5)] hover:text-[#EFEFEF] transition-colors">
                                            <BarChart3 size={16} />
                                        </button>
                                    </Tooltip>
                                    {key.is_active && (
                                        <Tooltip content="Revoke Key">
                                            <button onClick={() => setRevokeKeyId(key.key_id)}
                                                className="p-2 border border-[rgba(239,239,239,0.15)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[#ef4444] hover:border-[#ef4444] text-[rgba(239,239,239,0.5)] transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </Tooltip>
                                    )}
                                </div>
                            </div>
                            
                            {/* Usage section placeholder if needed */}
                            {showUsage === key.key_id && usageData && (
                                <div className="border-t border-[rgba(239,239,239,0.15)] bg-[#0d0d0d] p-5">
                                    <h5 style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: '#EFEFEF', marginBottom: '12px' }}>RECENT USAGE ({usageData.total_calls} calls total)</h5>
                                    {usageData.daily_volume?.length === 0 ? (
                                        <p className="text-[12px] text-[rgba(239,239,239,0.4)]">No recent usage recorded.</p>
                                    ) : (
                                        <div className="flex items-end gap-2 h-16">
                                            {usageData.daily_volume?.map((d: any, i: number) => (
                                                <div key={i} className="flex-1 bg-[rgba(245,196,0,0.5)] hover:bg-[#F5C400] transition-colors"
                                                    style={{ height: `${Math.max(10, (d.calls / usageData.total_calls) * 100)}%` }}
                                                    title={`${d.day}: ${d.calls} calls`} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <ConfirmModal
                isOpen={!!revokeKeyId}
                title="Revoke API Key"
                message="Are you sure you want to revoke this API key? Any applications currently using it will be denied access instantly. This action cannot be undone."
                confirmText="Revoke Key"
                onConfirm={confirmRevokeKey}
                onCancel={() => setRevokeKeyId(null)}
            />
        </div>
    );
};