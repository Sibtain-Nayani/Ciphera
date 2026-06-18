"use client";

import React, { useState, useEffect } from 'react';
import { Copy, Check, Trash2, Plus, Activity, Loader2, RefreshCw, Eye, Webhook as WebhookIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Tooltip } from '@/components/ui/Tooltip';

interface Webhook {
    webhook_id: string;
    api_key_id: string | null;
    url: string;
    description: string;
    events: string[];
    is_active: boolean;
    created_at: string;
}

interface Delivery {
    delivery_id: string;
    event: string;
    status: string;
    http_status_code: number | null;
    response_time_ms: number | null;
    attempt: number;
    delivered_at: string | null;
    error_message: string | null;
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

export const WebhookManager: React.FC = () => {
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [createdSecret, setCreatedSecret] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [showDeliveries, setShowDeliveries] = useState<string | null>(null);
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [pinging, setPinging] = useState<string | null>(null);
    const [pingStatus, setPingStatus] = useState<{ id: string, msg: string, ok: boolean } | null>(null);
    const [deleteWebhookId, setDeleteWebhookId] = useState<string | null>(null);

    // Form state
    const [url, setUrl] = useState('');
    const [desc, setDesc] = useState('');
    const [events, setEvents] = useState('redaction.complete,webhook.test');
    const [apiKeyId, setApiKeyId] = useState('');
    const [createBusy, setCreateBusy] = useState(false);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/v3/webhooks/list');
            if (res.ok) {
                const d = await res.json();
                setWebhooks(d.webhooks || []);
            } else {
                setError('Failed to load webhooks.');
            }
        } catch {
            setError('Backend unreachable.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const createWebhook = async () => {
        if (!url.trim()) return;
        setCreateBusy(true); setError('');
        try {
            const body: any = {
                url: url.trim(),
                description: desc.trim(),
                events: events.split(',').map(e => e.trim()).filter(Boolean),
            };
            if (apiKeyId.trim()) body.api_key_id = apiKeyId.trim();

            const res = await apiFetch('/api/v3/webhooks/register', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.detail || 'Failed to register webhook');
            }
            const d = await res.json();
            setCreatedSecret(d.secret);
            setShowCreate(false);
            setUrl(''); setDesc(''); setApiKeyId('');
            await load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setCreateBusy(false);
        }
    };

    const confirmDeleteWebhook = async () => {
        if (!deleteWebhookId) return;
        try {
            const res = await apiFetch(`/api/v3/webhooks/${deleteWebhookId}`, { method: 'DELETE' });
            if (res.ok) {
                // Optimistically remove from UI immediately
                setWebhooks(prev => prev.filter(wh => wh.webhook_id !== deleteWebhookId));
                // Also re-fetch for backend consistency
                await load();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setDeleteWebhookId(null);
        }
    };

    const pingWebhook = async (id: string) => {
        setPinging(id); setPingStatus(null);
        try {
            const res = await apiFetch(`/api/v3/webhooks/${id}/test`, { method: 'POST' });
            if (res.ok) {
                setPingStatus({ id, msg: 'Test payload sent successfully.', ok: true });
            } else {
                const d = await res.json().catch(() => ({}));
                setPingStatus({ id, msg: d.detail || 'Failed to send test.', ok: false });
            }
        } catch (e: any) {
            setPingStatus({ id, msg: e.message || 'Error sending test.', ok: false });
        } finally {
            setPinging(null);
            setTimeout(() => setPingStatus(null), 4000);
        }
    };

    const loadDeliveries = async (id: string) => {
        if (showDeliveries === id) {
            setShowDeliveries(null);
            return;
        }
        setShowDeliveries(id);
        setDeliveries([]);
        try {
            const res = await apiFetch(`/api/v3/webhooks/${id}/deliveries`);
            if (res.ok) {
                const d = await res.json();
                setDeliveries(d.deliveries || []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h3 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', margin: 0, letterSpacing: '0.03em' }}>
                        WEBHOOK INTEGRATIONS
                    </h3>
                    <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '13px', fontWeight: 400, color: 'rgba(239,239,239,0.6)', lineHeight: 1.7, marginTop: '6px' }}>
                        Receive real-time push notifications when async jobs or redactions complete.
                    </p>
                </div>
                {!showCreate && !createdSecret && (
                    <button onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 bg-[rgba(245,196,0,0.1)] hover:bg-[rgba(245,196,0,0.2)] text-[#F5C400] transition-colors border border-[rgba(245,196,0,0.2)] px-4 py-2"
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                        <Plus size={14} /> NEW WEBHOOK
                    </button>
                )}
            </div>

            {error && (
                <div className="p-4 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#ef4444] text-[13px]"
                    style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                    {error}
                </div>
            )}

            {createdSecret && (
                <div className="p-6 bg-[#131315] border border-[rgba(74,222,128,0.2)] shadow-[0_0_20px_rgba(74,222,128,0.05)] relative overflow-hidden animate-stage-in">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#4ade80]" />
                    <h4 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '16px', fontWeight: 700, color: '#4ade80', marginBottom: '8px' }}>
                        WEBHOOK REGISTERED SUCCESSFULLY
                    </h4>
                    <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: '14px', color: 'rgba(239,239,239,0.7)', marginBottom: '16px' }}>
                        Please save your signing secret below. <strong>It will not be shown again.</strong><br/>
                        Use this secret to verify the <span style={{ color: '#EFEFEF', fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px' }}>X-Ciphera-Signature</span> HMAC-SHA256 header.
                    </p>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 bg-[#0d0d0d] border border-[rgba(74,222,128,0.3)] text-[#4ade80] px-4 py-3 select-all"
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px' }}>
                            {createdSecret}
                        </div>
                        <button onClick={() => handleCopy(createdSecret, 'secret')}
                            className="bg-[#0d0d0d] border border-[rgba(239,239,239,0.2)] hover:bg-[rgba(239,239,239,0.1)] text-[#EFEFEF] px-4 py-3 transition-colors flex items-center justify-center min-w-[50px]">
                            {copied === 'secret' ? <Check size={16} className="text-[#4ade80]" /> : <Copy size={16} />}
                        </button>
                    </div>
                    <button onClick={() => setCreatedSecret(null)}
                        className="mt-6 text-[#EFEFEF] border border-[rgba(239,239,239,0.2)] hover:bg-[rgba(239,239,239,0.05)] px-6 py-2 transition-colors"
                        style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                        I HAVE SAVED MY SECRET
                    </button>
                </div>
            )}

            {showCreate && !createdSecret && (
                <div className="p-6 bg-[#131315] border border-[rgba(239,239,239,0.15)] animate-stage-in">
                    <h4 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '16px', fontWeight: 700, color: '#EFEFEF', marginBottom: '20px' }}>
                        REGISTER WEBHOOK
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2 md:col-span-2">
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase' }}>Webhook URL</label>
                            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.yourdomain.com/webhooks/ciphera" style={inputStyle} />
                        </div>
                        <div className="space-y-2">
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase' }}>Description (Optional)</label>
                            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Production Billing" style={inputStyle} />
                        </div>
                        <div className="space-y-2">
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase' }}>API Key ID Scope (Optional)</label>
                            <input value={apiKeyId} onChange={e => setApiKeyId(e.target.value)} placeholder="key_... (Leave blank for all)" style={inputStyle} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: 'rgba(239,239,239,0.5)', textTransform: 'uppercase' }}>Events to subscribe to (comma separated)</label>
                            <input value={events} onChange={e => setEvents(e.target.value)} placeholder="redaction.complete, webhook.test" style={inputStyle} />
                        </div>
                    </div>
                    <div className="flex gap-4 mt-8">
                        <button onClick={createWebhook} disabled={createBusy || !url.trim()}
                            className="bg-[#F5C400] hover:bg-[#d4a900] text-black px-6 py-2 transition-colors flex items-center gap-2 disabled:opacity-50"
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                            {createBusy ? <Loader2 size={14} className="animate-spin" /> : 'REGISTER'}
                        </button>
                        <button onClick={() => setShowCreate(false)}
                            className="bg-transparent border border-[rgba(239,239,239,0.2)] hover:bg-[rgba(239,239,239,0.05)] text-[#EFEFEF] px-6 py-2 transition-colors"
                            style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            {!createdSecret && (
                <div className="space-y-4">
                    {loading ? (
                        <div className="py-10 text-center text-[rgba(239,239,239,0.4)]">
                            <Loader2 className="mx-auto animate-spin mb-4" />
                            <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px' }}>LOADING WEBHOOKS...</p>
                        </div>
                    ) : webhooks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 bg-[#131315] border border-[rgba(239,239,239,0.15)] animate-stage-in relative overflow-hidden">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[#F5C400] blur-[100px] rounded-full opacity-[0.03] pointer-events-none" />
                            <div className="p-4 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] mb-4 relative z-10">
                                <WebhookIcon className="w-8 h-8 text-[#F5C400]/60" />
                            </div>
                            <h4 style={{ fontFamily: '"Barlow", sans-serif', fontSize: '18px', fontWeight: 700, color: '#EFEFEF', marginBottom: '8px' }} className="relative z-10">
                                No Webhooks Registered
                            </h4>
                            <p style={{ fontFamily: '"SF Pro Display", sans-serif', fontSize: '13px', color: 'rgba(239,239,239,0.5)', maxWidth: '300px', textAlign: 'center', marginBottom: '24px' }} className="relative z-10">
                                Register a webhook to receive real-time push notifications when asynchronous redaction jobs complete.
                            </p>
                            <button onClick={() => setShowCreate(true)}
                                className="flex items-center gap-2 bg-[rgba(245,196,0,0.1)] hover:bg-[rgba(245,196,0,0.2)] text-[#F5C400] transition-colors border border-[rgba(245,196,0,0.2)] px-6 py-2.5 relative z-10"
                                style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em' }}>
                                <Plus size={14} /> NEW WEBHOOK
                            </button>
                        </div>
                    ) : (
                        webhooks.map((wh) => (
                            <div key={wh.webhook_id} className="bg-[#131315] border border-[rgba(239,239,239,0.15)] relative group">
                                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[rgba(245,196,0,0.5)]" />
                                
                                <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', color: '#EFEFEF' }}>{wh.webhook_id}</span>
                                            {wh.description && (
                                                <span className="px-2 py-0.5 bg-[rgba(239,239,239,0.05)] text-[10px] text-[rgba(239,239,239,0.7)]" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                                    {wh.description}
                                                </span>
                                            )}
                                            {wh.api_key_id && (
                                                <span className="px-2 py-0.5 bg-[rgba(245,196,0,0.1)] text-[#F5C400] text-[10px]" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                                    SCOPED: {wh.api_key_id.substring(0,8)}...
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontFamily: '"SF Pro Display", sans-serif', fontSize: '13px', color: 'rgba(239,239,239,0.5)', wordBreak: 'break-all' }}>
                                            {wh.url}
                                        </p>
                                        <div className="mt-3 flex gap-2 flex-wrap">
                                            {wh.events.map(ev => (
                                                <span key={ev} className="px-2 py-0.5 border border-[rgba(239,239,239,0.1)] text-[10px] text-[#EFEFEF] opacity-70" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                                    {ev}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Tooltip content="Send Test Ping">
                                            <button onClick={() => pingWebhook(wh.webhook_id)} disabled={pinging === wh.webhook_id}
                                                className="p-2 border border-[rgba(239,239,239,0.15)] hover:bg-[rgba(245,196,0,0.1)] hover:text-[#F5C400] hover:border-[#F5C400] text-[rgba(239,239,239,0.5)] transition-colors">
                                                {pinging === wh.webhook_id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Delivery History">
                                            <button onClick={() => loadDeliveries(wh.webhook_id)}
                                                className="p-2 border border-[rgba(239,239,239,0.15)] hover:bg-[rgba(239,239,239,0.1)] text-[rgba(239,239,239,0.5)] hover:text-[#EFEFEF] transition-colors">
                                                <Activity size={16} />
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Delete Webhook">
                                            <button onClick={() => setDeleteWebhookId(wh.webhook_id)}
                                                className="p-2 border border-[rgba(239,239,239,0.15)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[#ef4444] hover:border-[#ef4444] text-[rgba(239,239,239,0.5)] transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>

                                {pingStatus?.id === wh.webhook_id && (
                                    <div className={`px-5 py-2 text-[11px] border-t ${pingStatus.ok ? 'bg-[rgba(74,222,128,0.05)] border-[rgba(74,222,128,0.2)] text-[#4ade80]' : 'bg-[rgba(239,68,68,0.05)] border-[rgba(239,68,68,0.2)] text-[#ef4444]'}`}
                                        style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                        {pingStatus.msg}
                                    </div>
                                )}

                                {showDeliveries === wh.webhook_id && (
                                    <div className="border-t border-[rgba(239,239,239,0.15)] bg-[#0d0d0d] p-5">
                                        <h5 style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', color: '#EFEFEF', marginBottom: '12px' }}>RECENT DELIVERIES</h5>
                                        {deliveries.length === 0 ? (
                                            <p className="text-[12px] text-[rgba(239,239,239,0.4)]">No deliveries recorded in the last 7 days.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {deliveries.map(d => (
                                                    <div key={d.delivery_id} className="flex items-center justify-between p-2 border border-[rgba(239,239,239,0.05)] bg-[#131315]">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${d.status === 'success' ? 'bg-[#4ade80]' : 'bg-[#ef4444]'}`} />
                                                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '11px', color: 'rgba(239,239,239,0.8)' }}>
                                                                {d.event}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-4 text-[10px] text-[rgba(239,239,239,0.5)]" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                                                            {d.http_status_code && <span>HTTP {d.http_status_code}</span>}
                                                            {d.response_time_ms && <span>{d.response_time_ms}ms</span>}
                                                            <span>{d.delivered_at ? new Date(d.delivered_at).toLocaleString() : '—'}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={!!deleteWebhookId}
                title="Delete Webhook"
                message="Are you sure you want to delete this webhook integration? You will no longer receive push notifications to this URL."
                confirmText="Delete Webhook"
                onConfirm={confirmDeleteWebhook}
                onCancel={() => setDeleteWebhookId(null)}
            />
        </div>
    );
};
