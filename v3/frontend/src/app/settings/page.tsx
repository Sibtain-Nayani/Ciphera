"use client";

import React from 'react';
import {
    ShieldCheck, Lock, FileDown, Zap, Code2, Activity, Cpu, Layers,
    Fingerprint, CalendarDays,
} from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { ToggleSwitch } from '@/components/settings/ToggleSwitch';
import { ParserCard } from '@/components/settings/ParserCard';
import { CustomRuleCard } from '@/components/settings/CustomRuleCard';
import { AddRuleDialog } from '@/components/settings/AddRuleDialog';

export default function SettingsPage() {
    const { customRules } = useDocumentStore();

    const [preferences, setPreferences] = React.useState({
        strictMode:    true,
        autoExport:    true,
        hardwareAccel: true,
    });
    const [saveToast, setSaveToast] = React.useState(false);

    const togglePref = (key: keyof typeof preferences) =>
        setPreferences((p) => ({ ...p, [key]: !p[key] }));

    const handleSave = () => {
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 2500);
    };

    const standardParsers: RuleType[] = ['email', 'phone', 'creditCard', 'ssn', 'names'];
    const dobParsers:      RuleType[] = ['dob', 'date'];
    const networkParsers:  RuleType[] = ['url', 'ip'];
    const indianParsers:   RuleType[] = ['aadhaar', 'pan', 'gst', 'ifsc', 'voterId', 'passport', 'vehicleReg'];

    return (
        <div className="flex flex-col min-h-screen">
            {/* Header */}
            <header className="p-6 md:p-8 border-b border-border bg-secondary">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-card rounded-xl border border-border shadow-md">
                            <ShieldCheck className="w-8 h-8 text-[#FFA500]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white mb-1">Security &amp; Rule Configuration</h1>
                            <p className="text-sm max-w-2xl text-muted-foreground">
                                Manage entity recognition rules, Indian PII parsers, and system preferences for V3 detection pipeline.
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 pb-32">
                <div className="max-w-7xl mx-auto w-full space-y-10">

                    {/* Standard Parsers */}
                    <section>
                        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-6 font-medium">Standard Parsers</h2>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {standardParsers.map((k) => <ParserCard key={k} ruleKey={k} />)}
                        </div>
                    </section>

                    {/* Date & DOB Parsers */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                                <CalendarDays className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    Date &amp; DOB Parsers
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">V3</span>
                                </h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Detects dates of birth in 8+ formats: DD/MM/YYYY, DD.MM.YYYY, D Month YYYY, ISO 8601 and more.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {dobParsers.map((k) => <ParserCard key={k} ruleKey={k} />)}
                        </div>
                    </section>

                    {/* Network Parsers */}
                    <section>
                        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-6 font-medium">Network Parsers</h2>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {networkParsers.map((k) => <ParserCard key={k} ruleKey={k} />)}
                        </div>
                    </section>

                    {/* Indian PII Parsers */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
                                <Fingerprint className="w-5 h-5 text-orange-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    Indian PII Parsers
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">V3</span>
                                </h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Domain-specific detection for Indian identity and financial documents.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {indianParsers.map((k) => <ParserCard key={k} ruleKey={k} />)}
                        </div>
                    </section>

                    {/* Custom Regex Rules */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-[#FFA500]/10 rounded-lg border border-[#FFA500]/20">
                                <Code2 className="w-5 h-5 text-[#FFA500]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white">Custom Regex Rules</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Define your own patterns for domain-specific redaction.</p>
                            </div>
                        </div>
                        <div className="space-y-6">
                            {customRules.length > 0 && (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    {customRules.map((rule) => <CustomRuleCard key={rule.id} rule={rule} />)}
                                </div>
                            )}
                            {customRules.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-10 px-6 rounded-xl border-2 border-dashed border-border text-center">
                                    <Code2 className="w-10 h-10 text-gray-600 mb-3" />
                                    <p className="text-sm text-gray-500 font-medium">No custom rules yet</p>
                                    <p className="text-xs text-gray-600 mt-1 max-w-xs">Create regex patterns tailored to your data.</p>
                                </div>
                            )}
                            <AddRuleDialog />
                        </div>
                    </section>

                    {/* System Preferences */}
                    <section className="bg-card border border-border rounded-xl p-6 shadow-lg">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-[#FFA500]/10 rounded-lg border border-[#FFA500]/20">
                                <Lock className="w-5 h-5 text-[#FFA500]" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">System Preferences</h2>
                        </div>
                        <div className="space-y-2">
                            {[
                                { key: 'strictMode',    icon: Lock,     label: 'Strict Verification Mode',   desc: 'Forces manual review before export.'                },
                                { key: 'autoExport',    icon: FileDown, label: 'Auto-Export to PDF',          desc: 'Generates a flattened PDF upon approval.'           },
                                { key: 'hardwareAccel', icon: Zap,      label: 'Hardware Acceleration',       desc: 'Use local GPU for NLP if available.'                },
                            ].map(({ key, icon: Icon, label, desc }) => (
                                <div key={key}
                                    className="flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-border hover:bg-secondary transition-all cursor-pointer"
                                    onClick={() => togglePref(key as keyof typeof preferences)}
                                >
                                    <div className="flex items-start gap-3">
                                        <Icon className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                                        <div>
                                            <h3 className="text-sm font-medium text-white">{label}</h3>
                                            <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                                        </div>
                                    </div>
                                    <ToggleSwitch
                                        id={`toggle-${key}`}
                                        checked={preferences[key as keyof typeof preferences]}
                                        onChange={() => togglePref(key as keyof typeof preferences)}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Backend Matrix */}
                    <section className="bg-[#141414] border border-[#3B3B3B] rounded-xl p-6 shadow-xl relative overflow-hidden">
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full pointer-events-none" />
                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                    <Activity className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Inference Engine Matrix</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">V3 Multi-layer Pipeline — Regex + Presidio + spaCy Transformer + Voting</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-[#1A1A1A] border border-[#3B3B3B] rounded-full">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-xs font-mono text-gray-400">STATUS: ONLINE</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                            {[
                                { Icon: Layers, label: 'Active Model',   value: 'en_core_web_trf',  sub: 'spaCy RoBERTa Transformer'           },
                                { Icon: Zap,    label: 'API Endpoint',   value: 'localhost:8000',   sub: '/api/v3/analyze'                     },
                                { Icon: Cpu,    label: 'Entity Types',   value: '17 Types',         sub: 'Incl. 7 Indian PII + DOB'            },
                            ].map(({ Icon, label, value, sub }) => (
                                <div key={label} className="p-4 rounded-xl bg-[#1A1A1A] border border-[#3B3B3B] flex flex-col gap-2">
                                    <div className="flex items-center gap-2 text-gray-400 mb-1">
                                        <Icon className="w-4 h-4" />
                                        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
                                    </div>
                                    <span className="text-lg font-mono text-white tracking-tight">{value}</span>
                                    <span className="text-[10px] text-gray-500 font-mono">{sub}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                </div>
            </div>

            {/* Footer */}
            <footer className="sticky bottom-0 z-10 bg-secondary border-t border-border p-4 md:p-6 shadow-2xl">
                <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
                    <div className={`transition-all duration-300 ${saveToast ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                        <span className="text-sm text-emerald-400 font-medium flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Settings saved successfully
                        </span>
                    </div>
                    <div className="flex items-center gap-4 ml-auto">
                        <button className="px-6 py-2.5 border border-border text-muted-foreground rounded-lg hover:bg-card hover:text-white transition-colors font-medium text-sm cursor-pointer">
                            Discard
                        </button>
                        <button onClick={handleSave}
                            className="px-6 py-2.5 bg-[#FFA500] text-black rounded-lg shadow-[0_0_15px_rgba(255,165,0,0.3)] hover:bg-[#E69500] transition-all font-medium text-sm cursor-pointer">
                            Save Changes
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
