"use client";

/**
 * ApiKeyManager.tsx
 * ==================
 * Settings page component for managing API keys.
 * Place at: v3/frontend/src/components/settings/ApiKeyManager.tsx
 * 
 * Add to settings page:
 *   import { ApiKeyManager } from '@/components/settings/ApiKeyManager';
 *   <ApiKeyManager />
 */

import React, { useState, useEffect } from 'react';
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
            if (!r.ok) { setError('Invalid admin password'); return; }
            setKeys(await r.json());
        } catch { setError('Backend unreachable'); }
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
            if (!r.ok) { setError('Failed to create key'); return; }
            const data = await r.json();
            setCreatedKey(data.api_key);
            setNewKeyName(''); setNewKeyDesc(''); setShowCreate(false);
            await fetchKeys();
        } catch { setError('Backend unreachable'); }
        finally { setLoading(false); }
    };

    const revokeKey = async (keyId: string) => {
        if (!confirm('Revoke this key? This cannot be undone.')) return;
        setLoading(true);
        try {
            await fetch(`${BASE}/api/v3/keys/${keyId}?admin_password=${encodeURIComponent(adminPassword)}`, { method: 'DELETE' });
            await fetchKeys();
        } catch { setError('Failed to revoke key'); }
        finally { setLoading(false); }
    };

    const copyKey = async (key: string) => {
        await navigator.clipboard.writeText(key);
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
    };

    return (
        <div className="space-y-4">
            {/* Admin auth */}
            <div className="p-4 rounded-xl bg-[#141414] border border-[#2A2A2A]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Admin Authentication</p>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && fetchKeys()}
                            placeholder="Admin password"
                            className="w-full px-3 py-2 bg-[#1E1E1E] border border-[#2A2A2A] text-sm text-white rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none pr-9"
                        />
                        <button onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 cursor-pointer">
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <button onClick={fetchKeys} disabled={loading || !adminPassword}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#FFA500]/10 hover:bg-[#FFA500]/20 text-[#FFA500] border border-[#FFA500]/30 rounded-lg text-xs font-medium cursor-pointer transition-all disabled:opacity-40">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Load Keys
                    </button>
                </div>
                <p className="text-[10px] text-gray-600 mt-2 font-mono">
                    Default dev password: ciphera_admin_dev · Set CIPHERA_ADMIN_PASSWORD env var in production
                </p>
            </div>

            {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}

            {/* Created key display */}
            {createdKey && (
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <p className="text-sm font-semibold text-emerald-400">API Key Created</p>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2">Copy this key now — it will not be shown again.</p>
                    <div className="flex items-center gap-2 p-2.5 bg-[#0D0D0D] rounded-lg border border-[#2A2A2A]">
                        <code className="flex-1 text-[11px] text-emerald-300 font-mono truncate">{createdKey}</code>
                        <button onClick={() => copyKey(createdKey)}
                            className="shrink-0 p-1.5 text-gray-500 hover:text-white hover:bg-[#2A2A2A] rounded cursor-pointer transition-colors">
                            {copiedKey ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <button onClick={() => setCreatedKey(null)} className="mt-2 text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer">Dismiss</button>
                </div>
            )}

            {/* Key list */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        API Keys {keys.length > 0 && `(${keys.length})`}
                    </p>
                    <button onClick={() => setShowCreate(!showCreate)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFA500] hover:bg-[#ffb733] text-black rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                        <Plus className="w-3.5 h-3.5" /> New Key
                    </button>
                </div>

                {showCreate && (
                    <div className="p-4 rounded-xl bg-[#141414] border border-[#2A2A2A] space-y-3">
                        <input type="text" placeholder="Key name (e.g. Production App)" value={newKeyName}
                            onChange={e => setNewKeyName(e.target.value)}
                            className="w-full px-3 py-2 bg-[#1E1E1E] border border-[#2A2A2A] text-sm text-white rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none" />
                        <input type="text" placeholder="Description (optional)" value={newKeyDesc}
                            onChange={e => setNewKeyDesc(e.target.value)}
                            className="w-full px-3 py-2 bg-[#1E1E1E] border border-[#2A2A2A] text-sm text-white rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none" />
                        <div className="flex gap-2">
                            <button onClick={createKey} disabled={!newKeyName.trim() || loading}
                                className="flex-1 py-2 bg-[#FFA500] hover:bg-[#ffb733] text-black text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-40">
                                Generate Key
                            </button>
                            <button onClick={() => setShowCreate(false)}
                                className="px-4 py-2 bg-[#2A2A2A] text-gray-400 hover:text-white text-sm rounded-lg cursor-pointer">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {keys.length === 0 && !showCreate && (
                    <div className="py-8 text-center text-gray-600 text-sm">
                        Load keys with your admin password to manage them.
                    </div>
                )}

                {keys.map(key => (
                    <div key={key.key_id}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border ${key.is_active ? 'bg-[#141414] border-[#2A2A2A]' : 'bg-[#111] border-[#1E1E1E] opacity-50'}`}>
                        <div className="p-2 rounded-lg bg-[#FFA500]/10 shrink-0">
                            <Key className="w-3.5 h-3.5 text-[#FFA500]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-white truncate">{key.name}</p>
                                {!key.is_active && <span className="text-[9px] text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded font-mono">REVOKED</span>}
                            </div>
                            <p className="text-[10px] text-gray-600 font-mono">{key.key_id} · {key.request_count} requests · {new Date(key.created_at).toLocaleDateString()}</p>
                            {key.description && <p className="text-[11px] text-gray-500 mt-0.5">{key.description}</p>}
                        </div>
                        {key.is_active && (
                            <button onClick={() => revokeKey(key.key_id)}
                                className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg cursor-pointer transition-colors shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Usage example */}
            <div className="p-4 rounded-xl bg-[#0D0D0D] border border-[#1E1E1E]">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Integration Example</p>
                <pre className="text-[10px] text-gray-400 font-mono leading-relaxed overflow-x-auto">{`curl -X POST http://your-server:8000/api/v3/public/redact \\
  -H "X-API-Key: ck_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Name: Rihaan, Aadhaar: 1234 5678 9012"}'`}</pre>
            </div>
        </div>
    );
};