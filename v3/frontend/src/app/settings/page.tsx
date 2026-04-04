"use client";

import React from 'react';
import {
    ShieldCheck, Lock, FileDown, Zap, Code2, Activity, Cpu, Layers,
    Fingerprint, CreditCard, IdCard,
} from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { ToggleSwitch } from '@/components/settings/ToggleSwitch';
import { ParserCard } from '@/components/settings/ParserCard';
import { CustomRuleCard } from '@/components/settings/CustomRuleCard';
import { AddRuleDialog } from '@/components/settings/AddRuleDialog';

export default function SettingsPage() {
    const { customRules } = useDocumentStore();

    const [preferences, setPreferences] = React.useState({
        strictMode: true,
        autoExport: false,
        hardwareAccel: true,
    });

    const [saveToast, setSaveToast] = React.useState(false);

    const togglePref = (key: keyof typeof preferences) => {
        setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = () => {
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 2500);
    };

    const standardParsers: RuleType[] = ['email', 'phone', 'creditCard', 'ssn', 'names'];
    const indianParsers:   RuleType[] = ['aadhaar', 'pan', 'gst', 'ifsc', 'voterId', 'passport', 'vehicleReg'];

    return (
        <div className="flex flex-col min-h-screen">
            {/* ── Header ── */}
            <header className="p-6 md:p-8 border-b border-border bg-secondary">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-card rounded-xl border border-border shadow-md">
                            <ShieldCheck className="w-8 h-8 text-[#FFA500]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-1">
                                Security &amp; Rule Configuration
                            </h1>
                            <p className="text-sm max-w-2xl text-muted-foreground">
                                Define custom regex patterns, manage entity recognition actions, and configure system-wide security preferences for document processing.
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            {/* ── Scrollable Content ── */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 pb-32">
                <div className="max-w-7xl mx-auto w-full space-y-10">

                    {/* ── Section 1: Standard Parsers ── */}
                    <section>
                        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-6 font-medium">
                            Standard Parsers
                        </h2>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {standardParsers.map((ruleKey) => (
                                <ParserCard key={ruleKey} ruleKey={ruleKey} />
                            ))}
                        </div>
                    </section>

                    {/* ── Section 2: Indian PII Parsers (V3) ── */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
                                <Fingerprint className="w-5 h-5 text-orange-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    Indian PII Parsers
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">
                                        V3
                                    </span>
                                </h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Domain-specific detection for Indian identity and financial documents.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {indianParsers.map((ruleKey) => (
                                <ParserCard key={ruleKey} ruleKey={ruleKey} />
                            ))}
                        </div>
                    </section>

                    {/* ── Section 3: Custom Regex Rules ── */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-[#FFA500]/10 rounded-lg border border-[#FFA500]/20">
                                <Code2 className="w-5 h-5 text-[#FFA500]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white">Custom Regex Rules</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Define your own regex patterns for domain-specific redaction.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {customRules.length > 0 && (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    {customRules.map((rule) => (
                                        <CustomRuleCard key={rule.id} rule={rule} />
                                    ))}
                                </div>
                            )}

                            {customRules.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-10 px-6 rounded-xl border-2 border-dashed border-border text-center">
                                    <Code2 className="w-10 h-10 text-gray-600 mb-3" />
                                    <p className="text-sm text-gray-500 font-medium">No custom rules yet</p>
                                    <p className="text-xs text-gray-600 mt-1 max-w-xs">
                                        Create regex patterns tailored to your data — match API keys, internal IDs, or any custom format.
                                    </p>
                                </div>
                            )}

                            <AddRuleDialog />
                        </div>
                    </section>

                    {/* ── Section 4: System Preferences ── */}
                    <section className="bg-card border border-border rounded-xl p-6 shadow-lg">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-[#FFA500]/10 rounded-lg border border-[#FFA500]/20">
                                <Lock className="w-5 h-5 text-[#FFA500]" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">System Preferences</h2>
                        </div>

                        <div className="space-y-2">
                            <div
                                className="flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-border hover:bg-secondary transition-all cursor-pointer"
                                onClick={() => togglePref('strictMode')}
                            >
                                <div className="flex items-start gap-3">
                                    <Lock className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <h3 className="text-sm font-medium text-white">Strict Verification Mode</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Forces manual review of all redactions before export is allowed.
                                        </p>
                                    </div>
                                </div>
                                <ToggleSwitch id="toggle-strict-mode" checked={preferences.strictMode} onChange={() => togglePref('strictMode')} />
                            </div>

                            <div
                                className="flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-border hover:bg-secondary transition-all cursor-pointer"
                                onClick={() => togglePref('autoExport')}
                            >
                                <div className="flex items-start gap-3">
                                    <FileDown className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <h3 className="text-sm font-medium text-white">Auto-Export to PDF</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Automatically generates a flattened PDF upon redaction approval.
                                        </p>
                                    </div>
                                </div>
                                <ToggleSwitch id="toggle-auto-export" checked={preferences.autoExport} onChange={() => togglePref('autoExport')} />
                            </div>

                            <div
                                className="flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-border hover:bg-secondary transition-all cursor-pointer"
                                onClick={() => togglePref('hardwareAccel')}
                            >
                                <div className="flex items-start gap-3">
                                    <Zap className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                                    <div>
                                        <h3 className="text-sm font-medium text-white">Hardware Acceleration</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Utilize local GPU for NLP entity recognition if available.
                                        </p>
                                    </div>
                                </div>
                                <ToggleSwitch id="toggle-hardware-accel" checked={preferences.hardwareAccel} onChange={() => togglePref('hardwareAccel')} />
                            </div>
                        </div>
                    </section>

                    {/* ── Section 5: Backend Connection Matrix ── */}
                    <section className="bg-[#141414] border border-[#3B3B3B] rounded-xl p-6 shadow-xl relative overflow-hidden">
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full pointer-events-none"></div>
                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                    <Activity className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Inference Engine Matrix</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">V3 Multi-layer Pipeline — Regex + Presidio + spaCy + Voting</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-[#1A1A1A] border border-[#3B3B3B] rounded-full">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-xs font-mono text-gray-400">STATUS: ONLINE</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                            <div className="p-4 rounded-xl bg-[#1A1A1A] border border-[#3B3B3B] flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-gray-400 mb-1">
                                    <Layers className="w-4 h-4" />
                                    <span className="text-xs font-semibold uppercase tracking-wider">Active Model</span>
                                </div>
                                <span className="text-lg font-mono text-white tracking-tight">en_core_web_lg</span>
                                <span className="text-[10px] text-gray-500 font-mono">spaCy + Presidio + Regex</span>
                            </div>

                            <div className="p-4 rounded-xl bg-[#1A1A1A] border border-[#3B3B3B] flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-gray-400 mb-1">
                                    <Zap className="w-4 h-4" />
                                    <span className="text-xs font-semibold uppercase tracking-wider">API Endpoint</span>
                                </div>
                                <span className="text-lg font-mono text-white tracking-tight">localhost:8000</span>
                                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    /api/v3/analyze
                                </span>
                            </div>

                            <div className="p-4 rounded-xl bg-[#1A1A1A] border border-[#3B3B3B] flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-gray-400 mb-1">
                                    <Cpu className="w-4 h-4" />
                                    <span className="text-xs font-semibold uppercase tracking-wider">Indian PII</span>
                                </div>
                                <span className="text-lg font-mono text-white tracking-tight">7 Types</span>
                                <span className="text-[10px] text-gray-500 font-mono">Aadhaar · PAN · GST · IFSC +3</span>
                            </div>
                        </div>
                    </section>

                </div>
            </div>

            {/* ── Sticky Footer ── */}
            <footer className="sticky bottom-0 z-10 bg-secondary border-t border-border p-4 md:p-6 shadow-2xl">
                <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
                    <div className={`transition-all duration-300 ${saveToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                        <span className="text-sm text-emerald-400 font-medium flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Settings saved successfully
                        </span>
                    </div>
                    <div className="flex items-center gap-4 ml-auto">
                        <button className="px-6 py-2.5 border border-border text-muted-foreground rounded-lg hover:bg-card hover:text-white transition-colors font-medium text-sm cursor-pointer">
                            Discard
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2.5 bg-[#FFA500] text-black rounded-lg shadow-[0_0_15px_rgba(255,165,0,0.3)] hover:bg-[#E69500] transition-all font-medium text-sm cursor-pointer"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
}