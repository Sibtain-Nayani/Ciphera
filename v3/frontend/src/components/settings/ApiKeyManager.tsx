"use client";

import React, { useState } from 'react';
import { Key, Plus, Trash2, Copy, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

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
    const [copiedKey,     setCopiedKey]     = useState(false);
    const [error,         setError]         = useState('');
    const [showPassword,  setShowPassword]  = useState(false);

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

    const copyKey = async (key: string) => {
        await navigator.clipboard.writeText(key);
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
    };

    const textSharpness: React.CSSProperties = {
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
    };

    return (
        <div className="space-y-6">
            {/* Admin auth */}
            <div className="p-5 rounded-none bg-[#080808] border border-white/5">
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(255, 255, 255, 0.45)', ...textSharpness }} className="font-semibold uppercase mb-3">
                    // ADMIN KEY AUTHENTICATION MATRIX
                </p>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && fetchKeys()}
                            placeholder="ADMIN VAULT CREDENTIAL"
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}
                            className="w-full px-3 py-2 bg-black border border-white/15 text-white rounded-none placeholder:text-gray-700 focus:border-[#F5C400]/40 focus:outline-none pr-9 tracking-widest"
                        />
                        <button onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 cursor-pointer">
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <button onClick={fetchKeys} disabled={loading || !adminPassword}
                        style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.05em', fontWeight: 700 }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#F5C400]/10 hover:bg-[#F5C400]/25 text-[#F5C400] border border-[#F5C400]/30 rounded-none cursor-pointer transition-all disabled:opacity-40">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        LOAD VAULT
                    </button>
                </div>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.2)' }} className="mt-2.5">
                    * LOCAL CONSOLE CREDENTIAL: ciphera_admin_dev · SYSTEM SEEDED VIA CIPHERA_ADMIN_PASSWORD ENV
                </p>
            </div>

            {error && (
                <div style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)', fontFamily: "'IBM Plex Mono', monospace" }} 
                    className="flex items-center gap-2 px-3 py-2 rounded-none">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <p className="text-xs text-red-400 font-bold tracking-wider">{error}</p>
                </div>
            )}

            {/* Created key display */}
            {createdKey && (
                <div style={{ border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.05)' }} 
                    className="p-5 rounded-none">
                    <div className="flex items-center gap-2 mb-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '16px', ...textSharpness }} className="font-bold text-emerald-400 uppercase tracking-wider">API KEY COMMITTED SECURELY</p>
                    </div>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.45)' }} className="mb-3">
                        BUFFER COMMITTED: Copy signature now. local vault will obscure this hash forever.
                    </p>
                    <div className="flex items-center gap-2 p-2.5 bg-black rounded-none border border-white/10">
                        <code className="flex-1 text-[11px] text-emerald-300 font-mono truncate">{createdKey}</code>
                        <button onClick={() => copyKey(createdKey)}
                            className="shrink-0 p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-none cursor-pointer transition-colors">
                            {copiedKey ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <button onClick={() => setCreatedKey(null)} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px' }} 
                        className="mt-3 text-gray-600 hover:text-gray-400 cursor-pointer">// DISMISS BUFFER</button>
                </div>
            )}

            {/* Key list */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '18px', ...textSharpness }} className="font-bold text-white uppercase tracking-wider">
                        Secure Port Authorizations {keys.length > 0 && `(${keys.length})`}
                    </p>
                    <button onClick={() => setShowCreate(!showCreate)}
                        style={{ background: '#F5C400', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.05em', fontWeight: 700 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-black rounded-none cursor-pointer transition-all hover:brightness-110">
                        <Plus className="w-3.5 h-3.5" /> MOUNT KEY
                    </button>
                </div>

                {showCreate && (
                    <div className="p-4 rounded-none bg-[#080808] border border-white/5 space-y-3">
                        <input type="text" placeholder="KEY LABEL (e.g. Production Suite)" value={newKeyName}
                            onChange={e => setNewKeyName(e.target.value)}
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px' }}
                            className="w-full px-3 py-2 bg-black border border-white/15 text-white rounded-none placeholder:text-gray-700 focus:border-[#F5C400]/40 focus:outline-none" />
                        <input type="text" placeholder="DESCRIPTION NOTES (Optional)" value={newKeyDesc}
                            onChange={e => setNewKeyDesc(e.target.value)}
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px' }}
                            className="w-full px-3 py-2 bg-black border border-white/15 text-white rounded-none placeholder:text-gray-700 focus:border-[#F5C400]/40 focus:outline-none" />
                        <div className="flex gap-2">
                            <button onClick={createKey} disabled={!newKeyName.trim() || loading}
                                style={{ background: '#F5C400', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', letterSpacing: '0.05em', fontWeight: 700 }}
                                className="flex-1 py-2 text-black rounded-none cursor-pointer disabled:opacity-40 hover:brightness-110">
                                COMMIT GENERATION
                            </button>
                            <button onClick={() => setShowCreate(false)}
                                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px' }}
                                className="px-4 py-2 bg-[#1A1A1A] border border-white/5 text-gray-400 hover:text-white rounded-none cursor-pointer transition-colors">
                                CANCEL
                            </button>
                        </div>
                    </div>
                )}

                {keys.length === 0 && !showCreate && (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', ...textSharpness }} className="py-8 text-center text-gray-600">
                        [ Decryption password required to load securely authorized keys ]
                    </div>
                )}

                {keys.map(key => (
                    <div key={key.key_id}
                        className={`flex items-center gap-4 p-4 rounded-none border ${key.is_active ? 'bg-[#080808] border-white/5' : 'bg-[#040404] border-white/5 opacity-40'}`}>
                        <div style={{ background: key.is_active ? 'rgba(245,196,0,0.1)' : 'rgba(255,255,255,0.03)' }} className="p-2.5 rounded-none shrink-0">
                            <Key className={`w-4 h-4 ${key.is_active ? 'text-[#F5C400]' : 'text-gray-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#fff', ...textSharpness }} className="truncate leading-none">{key.name}</p>
                                {!key.is_active && (
                                    <span style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', fontSize: '8px' }} 
                                        className="px-1.5 py-0.5 rounded-none text-red-400 font-bold tracking-widest font-mono shrink-0">
                                        SCRUBBED
                                    </span>
                                )}
                            </div>
                            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.3)' }} className="mt-1">
                                ID: {key.key_id} · Intercepts: {key.request_count} jobs · Created: {new Date(key.created_at).toLocaleDateString()}
                            </p>
                            {key.description && <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.5)', ...textSharpness }} className="mt-1">{key.description}</p>}
                        </div>
                        {key.is_active && (
                            <button onClick={() => revokeKey(key.key_id)}
                                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-none cursor-pointer transition-colors shrink-0">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Usage example */}
            <div className="p-4 rounded-none bg-black border border-white/5">
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.45)', ...textSharpness }} className="font-semibold uppercase mb-2.5">
                    // INTEGRATION SUITE // CURL MOUNT REFERENCE
                </p>
                <pre className="text-[10px] text-gray-400 font-mono leading-relaxed overflow-x-auto">{`curl -X POST http://your-server:8000/api/v3/public/redact \\
  -H "X-API-Key: ck_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Name: Rihaan, Aadhaar: 1234 5678 9012"}'`}</pre>
            </div>
        </div>
    );
};