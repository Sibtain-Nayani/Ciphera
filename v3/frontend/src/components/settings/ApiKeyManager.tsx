"use client";

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface ApiKey {
    key_id:        string;
    name:          string;
    description:   string;
    created_at:    string;
    request_count: number;
    is_active:     boolean;
}

export const ApiKeyManager: React.FC = () => {
    const [keys,          setKeys]          = useState<ApiKey[]>([]);
    const [loading,       setLoading]       = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [newKeyName,    setNewKeyName]    = useState('');
    const [newKeyDesc,    setNewKeyDesc]    = useState('');
    const [createdKey,    setCreatedKey]    = useState<string | null>(null);
    const [showCreate,    setShowCreate]    = useState(false);
    const [copiedKey,     setCopiedKey]     = useState<string | null>(null);
    const [revealedKeys,  setRevealedKeys]  = useState<Record<string, boolean>>({});
    const [error,         setError]         = useState('');

    const BASE = 'http://127.0.0.1:8000';

    const fetchKeys = async () => {
        if (!adminPassword) return;
        setLoading(true); setError('');
        try {
            const r = await fetch(`${BASE}/api/v3/keys/list?admin_password=${encodeURIComponent(adminPassword)}`);
            if (!r.ok) { setError('ACCESS REJECTED: Invalid admin password signature'); return; }
            setKeys(await r.json());
        } catch { setError('BACKEND DOWN: Verification core unreachable'); }
        finally { setLoading(false); }
    };

    const createKey = async () => {
        if (!newKeyName.trim() || !adminPassword) return;
        setLoading(true); setError('');
        try {
            const r = await fetch(`${BASE}/api/v3/keys/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName, description: newKeyDesc, admin_password: adminPassword }),
            });
            if (!r.ok) { setError('COMMIT FAIL: Could not write new key buffer'); return; }
            const data = await r.json();
            setCreatedKey(data.api_key);
            setNewKeyName(''); setNewKeyDesc(''); setShowCreate(false);
            await fetchKeys();
        } catch { setError('BACKEND DOWN: Write core unreachable'); }
        finally { setLoading(false); }
    };

    const revokeKey = async (keyId: string) => {
        if (!confirm('DESTROY KEY AUTHORIZATION? This revoke signature is permanent.')) return;
        setLoading(true);
        try {
            await fetch(`${BASE}/api/v3/keys/${keyId}?admin_password=${encodeURIComponent(adminPassword)}`, { method: 'DELETE' });
            await fetchKeys();
        } catch { setError('REVOKE FAIL: Could not scrub key buffer'); }
        finally { setLoading(false); }
    };

    const copyKey = async (key: string, type: 'new' | 'list' = 'list', id?: string) => {
        await navigator.clipboard.writeText(key);
        if (type === 'new') {
            setCopiedKey('new');
            setTimeout(() => setCopiedKey(null), 2000);
        } else if (id) {
            setCopiedKey(id);
            setTimeout(() => setCopiedKey(null), 2000);
        }
    };

    const toggleReveal = (id: string) => {
        setRevealedKeys(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="space-y-8">
            
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', margin: 0, letterSpacing: '0.03em' }}>API KEYS</h3>
                    <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.55)', marginTop: '6px' }}>
                        Manage secure access credentials for the pipeline.
                    </p>
                </div>
                <button onClick={() => setShowCreate(!showCreate)}
                    style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', color: showCreate ? '#F5C400' : 'rgba(239,239,239,0.7)', border: showCreate ? '1px solid #F5C400' : '1px solid rgba(239,239,239,0.2)', padding: '10px 20px', background: showCreate ? 'rgba(245,196,0,0.05)' : 'transparent', textTransform: 'uppercase', cursor: 'pointer' }}
                    className="hover:border-[#F5C400] hover:text-[#F5C400] hover:shadow-[0_0_10px_rgba(245,196,0,0.1)] transition-all duration-200">
                    {showCreate ? 'CANCEL' : 'GENERATE KEY'}
                </button>
            </div>

            {/* Admin auth inline */}
            {!keys.length && !error && !showCreate && (
                <div className="flex gap-3 mb-6">
                    <input
                        type="password"
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && fetchKeys()}
                        placeholder="ADMIN PASSWORD"
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, background: '#131315', border: '1px solid rgba(239,239,239,0.15)', color: '#EFEFEF', padding: '10px 16px', outline: 'none' }}
                        className="flex-1 focus:border-[#F5C400] transition-colors"
                    />
                    <button onClick={fetchKeys} disabled={loading || !adminPassword}
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', background: '#F5C400', color: '#080808', border: 'none', padding: '10px 20px', cursor: 'pointer' }}
                        className="hover:bg-[#ffe166] hover:shadow-[0_0_12px_rgba(245,196,0,0.4)] transition-all disabled:opacity-50">
                        {loading ? 'LOADING...' : 'LOAD KEYS'}
                    </button>
                </div>
            )}

            {error && (
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', padding: '14px 20px', background: 'rgba(248,113,113,0.05)' }}>
                    {error}
                </div>
            )}

            {showCreate && (
                <div className="p-6 bg-[#131315] border border-[rgba(239,239,239,0.15)] space-y-4 mb-6 relative overflow-hidden shadow-lg">
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C400] to-transparent opacity-40" />
                    <input type="password" placeholder="ADMIN PASSWORD" value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, background: '#0d0d0d', border: '1px solid rgba(239,239,239,0.15)', color: '#EFEFEF', padding: '10px 16px', width: '100%', outline: 'none', boxSizing: 'border-box' }}
                        className="focus:border-[#F5C400] transition-colors" />
                    <input type="text" placeholder="KEY NAME" value={newKeyName}
                        onChange={e => setNewKeyName(e.target.value)}
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, background: '#0d0d0d', border: '1px solid rgba(239,239,239,0.15)', color: '#EFEFEF', padding: '10px 16px', width: '100%', outline: 'none', boxSizing: 'border-box' }}
                        className="focus:border-[#F5C400] transition-colors" />
                    <input type="text" placeholder="DESCRIPTION" value={newKeyDesc}
                        onChange={e => setNewKeyDesc(e.target.value)}
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 500, background: '#0d0d0d', border: '1px solid rgba(239,239,239,0.15)', color: '#EFEFEF', padding: '10px 16px', width: '100%', outline: 'none', boxSizing: 'border-box' }}
                        className="focus:border-[#F5C400] transition-colors" />
                    <button onClick={createKey} disabled={!newKeyName.trim() || !adminPassword || loading}
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', background: '#F5C400', color: '#080808', border: 'none', padding: '12px 20px', cursor: 'pointer', width: '100%' }}
                        className="hover:bg-[#ffe166] hover:shadow-[0_0_15px_rgba(245,196,0,0.4)] transition-all disabled:opacity-50 mt-2 group">
                        <span className="inline-block transition-transform group-hover:scale-105">COMMIT GENERATION</span>
                    </button>
                </div>
            )}

            {createdKey && (
                <div className="mb-6 relative overflow-hidden shadow-lg" style={{ border: '1px solid rgba(74,222,128,0.3)', padding: '20px 24px', background: '#131315' }}>
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#4ade80] to-transparent opacity-50" />
                    <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '15px', fontWeight: 700, color: '#4ade80', margin: '0 0 12px 0' }}>API KEY GENERATED</p>
                    <div className="flex items-center gap-4">
                        <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', fontWeight: 500, color: '#EFEFEF', background: '#0a0a0b', padding: '8px 16px', flex: 1, border: '1px solid rgba(239,239,239,0.1)' }}>{createdKey}</code>
                        <button onClick={() => copyKey(createdKey, 'new')}
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 600, color: copiedKey === 'new' ? '#4ade80' : 'rgba(239,239,239,0.6)', border: `1px solid ${copiedKey === 'new' ? 'rgba(74,222,128,0.3)' : 'rgba(239,239,239,0.2)'}`, background: 'transparent', padding: '8px 16px', cursor: 'pointer' }}
                            className="hover:border-[#F5C400] hover:text-[#F5C400] transition-all">
                            {copiedKey === 'new' ? '✓ COPIED' : 'COPY'}
                        </button>
                    </div>
                    <button onClick={() => setCreatedKey(null)} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, background: 'none', border: 'none', color: 'rgba(239,239,239,0.5)', cursor: 'pointer', marginTop: '16px', padding: 0 }} className="hover:text-[#EFEFEF] transition-colors">
                        DISMISS
                    </button>
                </div>
            )}

            {keys.length > 0 && (
                <div className="space-y-[2px]">
                    {keys.map(key => {
                        const isRevoked = !key.is_active;
                        return (
                            <div key={key.key_id} className="group relative overflow-hidden" style={{ background: '#131315', border: '1px solid rgba(239,239,239,0.15)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F5C400] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-4">
                                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', fontWeight: 600, color: isRevoked ? 'rgba(239,239,239,0.4)' : '#EFEFEF' }} className="group-hover:text-[#F5C400] transition-colors">{key.name}</span>
                                        {!isRevoked && (
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 600, color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', padding: '3px 10px', background: 'rgba(74,222,128,0.05)' }}>
                                                ACTIVE
                                            </span>
                                        )}
                                        {isRevoked && (
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '9px', fontWeight: 600, color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', padding: '3px 10px', background: 'rgba(248,113,113,0.05)' }}>
                                                REVOKED
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 400, color: 'rgba(239,239,239,0.5)', letterSpacing: '0.1em', marginTop: '2px' }}>
                                        {revealedKeys[key.key_id] ? key.key_id : '••••••••••••••••••••••••••••••••'}
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <button onClick={() => toggleReveal(key.key_id)}
                                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, color: 'rgba(239,239,239,0.6)', border: '1px solid rgba(239,239,239,0.2)', background: 'transparent', padding: '6px 14px', cursor: 'pointer' }}
                                        className="hover:border-[#F5C400] hover:text-[#F5C400] transition-all">
                                        {revealedKeys[key.key_id] ? 'HIDE' : 'REVEAL'}
                                    </button>
                                    <button onClick={() => copyKey(key.key_id, 'list', key.key_id)}
                                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, color: copiedKey === key.key_id ? '#4ade80' : 'rgba(239,239,239,0.6)', border: `1px solid ${copiedKey === key.key_id ? 'rgba(74,222,128,0.3)' : 'rgba(239,239,239,0.2)'}`, background: 'transparent', padding: '6px 14px', cursor: 'pointer' }}
                                        className="hover:border-[#F5C400] hover:text-[#F5C400] transition-all">
                                        {copiedKey === key.key_id ? '✓ COPIED' : 'COPY'}
                                    </button>
                                    {!isRevoked && (
                                        <button onClick={() => revokeKey(key.key_id)}
                                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', fontWeight: 500, color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', background: 'transparent', padding: '6px 14px', cursor: 'pointer', marginLeft: '4px' }}
                                            className="hover:bg-[rgba(248,113,113,0.1)] hover:shadow-[0_0_10px_rgba(248,113,113,0.15)] transition-all">
                                            REVOKE
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};