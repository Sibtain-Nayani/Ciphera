"use client";

import React, { useState, useEffect } from 'react';
import { Copy, Check, Trash2, Plus, BarChart3, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useUiStore } from '@/store/uiStore';

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

    const revokeKey = async (keyId: string) => {
        if (!confirm('Revoke this API key? This cannot be undone.')) return;
        try {
            await apiFetch(`/api/v3/keys/${keyId}`, { method: 'DELETE' });
            await load();
            useUiStore.getState().addToast('Key revoked.', 'success');
        } catch {
            useUiStore.getState().addToast('Failed to revoke key.', 'error');
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
                    <button onClick={load} disabled={loading}
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.5)', border: '1px solid rgba(239,239,239,0.1)', background: 'transparent', padding: '8px 14px', cursor: 'pointer' }}
                        className="hover:border-[rgba(245,196,0,0.4)] hover:text-[#F5C400] transition-all">
                        {loading ? '…' : 'Refresh'}
                    </button>
                    <button onClick={() => setShowCreate(!showCreate)}
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', color: showCreate ? '#F5C400' : 'rgba(239,239,239,0.7)', border: showCreate ? '1px solid #F5C400' : '1px solid rgba(239,239,239,0.2)', padding: '10px 20px', background: showCreate ? 'rgba(245,196,0,0.05)' : 'transparent', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        className="hover:border-[#F5C400] hover:text-[#F5C400] transition-all">
                        <Plus style={{ width: 11, height: 11 }} />
                        {showCreate ? 'Cancel' : 'New Key'}
                    </button>
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
            {showCreate && (
                <div style={{ padding: '24px', background: '#131315', border: '1px solid rgba(239,239,239,0.15)', position: 'relative', overflow: 'hidden' }} className="space-y-3">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #F5C400, transparent)', opacity: 0.4 }} />
                    <div>
                        <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.4)', display: 'block', marginBottom: '5px' }}>Key Name *</label>
                        <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production Integration" style={inputStyle}
                            onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                            onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.15)'} />
                    </div>
                    <div>
                        <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.4)', display: 'block', marginBottom: '5px' }}>Description</label>
                        <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional note" style={inputStyle}
                            onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                            onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.15)'} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.4)', display: 'block', marginBottom: '5px' }}>Rate Limit (req/min)</label>
                            <input type="number" min="1" max="1000" value={rpm} onChange={e => setRpm(e.target.value)} style={{ ...inputStyle }}
                                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                                onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.15)'} />
                        </div>
                        <div>
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.4)', display: 'block', marginBottom: '5px' }}>Expires in days (optional)</label>
                            <input type="number" min="1" max="365" value={expDays} onChange={e => setExpDays(e.target.value)} placeholder="Never" style={inputStyle}
                                onFocus={e => e.currentTarget.style.borderColor = 'rgba(245,196,0,0.5)'}
                                onBlur={e  => e.currentTarget.style.borderColor = 'rgba(239,239,239,0.15)'} />
                        </div>
                    </div>
                    <button onClick={createKey} disabled={!name.trim() || createBusy}
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', background: '#F5C400', color: '#080808', border: 'none', padding: '12px 20px', cursor: createBusy ? 'not-allowed' : 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px', opacity: (!name.trim() || createBusy) ? 0.5 : 1 }}
                        className="hover:bg-[#ffe166] transition-all">
                        {createBusy && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
                        Generate Key
                    </button>
                </div>
            )}

            {/* Keys list */}
            {loading && !keys.length ? (
                <div style={{ padding: '40px', textAlign: 'center', fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.3)' }}>
                    Loading keys…
                </div>
            ) : keys.length === 0 && !showCreate ? (
                <div style={{ padding: '40px', textAlign: 'center', background: '#131315', border: '1px solid rgba(239,239,239,0.07)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(239,239,239,0.3)' }}>
                    No API keys yet. Generate one above.
                </div>
            ) : (
                <div className="space-y-[2px]">
                    {keys.map((key) => (
                        <React.Fragment key={key.key_id}>
                            <div className="group relative overflow-hidden"
                                style={{ background: '#131315', border: '1px solid rgba(239,239,239,0.15)', padding: '16px 20px' }}>
                                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                    {/* Left: name + prefix + stats */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', fontWeight: 600, color: key.is_active ? '#EFEFEF' : 'rgba(239,239,239,0.3)' }} className="group-hover:text-[#F5C400] transition-colors">
                                                {key.name}
                                            </span>
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: key.is_active ? '#4ade80' : '#ef4444', border: `1px solid ${key.is_active ? 'rgba(74,222,128,0.25)' : 'rgba(239,68,68,0.25)'}`, padding: '2px 7px', background: key.is_active ? 'rgba(74,222,128,0.05)' : 'transparent' }}>
                                                {key.is_active ? 'ACTIVE' : 'REVOKED'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,239,239,0.35)', letterSpacing: '0.1em' }}>{key.key_prefix}</span>
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,239,239,0.35)', letterSpacing: '0.1em' }}>{key.request_count.toLocaleString()} requests</span>
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,239,239,0.35)', letterSpacing: '0.1em' }}>{key.rate_limit_rpm}/min</span>
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', color: 'rgba(239,239,239,0.35)', letterSpacing: '0.1em' }}>
                                                Last: {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Right: actions */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                        <button onClick={() => copyText(key.key_prefix, key.key_id)}
                                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, color: copied === key.key_id ? '#4ade80' : 'rgba(239,239,239,0.5)', border: `1px solid ${copied === key.key_id ? 'rgba(74,222,128,0.3)' : 'rgba(239,239,239,0.15)'}`, background: 'transparent', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                                            className="hover:border-[#F5C400] hover:text-[#F5C400] transition-all">
                                            {copied === key.key_id ? <Check style={{ width: 10, height: 10 }} /> : <Copy style={{ width: 10, height: 10 }} />}
                                            {copied === key.key_id ? 'Copied' : 'Copy ID'}
                                        </button>
                                        <button onClick={() => loadUsage(key.key_id)}
                                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, color: showUsage === key.key_id ? '#F5C400' : 'rgba(239,239,239,0.5)', border: `1px solid ${showUsage === key.key_id ? 'rgba(245,196,0,0.3)' : 'rgba(239,239,239,0.15)'}`, background: showUsage === key.key_id ? 'rgba(245,196,0,0.05)' : 'transparent', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                                            className="hover:border-[rgba(245,196,0,0.4)] hover:text-[#F5C400] transition-all">
                                            <BarChart3 style={{ width: 10, height: 10 }} />
                                            Usage
                                        </button>
                                        {key.is_active && (
                                            <button onClick={() => revokeKey(key.key_id)}
                                                style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 500, color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', background: 'transparent', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                                                className="hover:bg-[rgba(248,113,113,0.08)] transition-all">
                                                <Trash2 style={{ width: 10, height: 10 }} />
                                                Revoke
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
};