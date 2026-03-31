"use client";

import React from 'react';
import { ShieldCheck, Lock, FileDown, Zap, Code2 } from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { ToggleSwitch } from '@/components/settings/ToggleSwitch';
import { ParserCard } from '@/components/settings/ParserCard';
import { CustomRuleCard } from '@/components/settings/CustomRuleCard';
import { AddRuleDialog } from '@/components/settings/AddRuleDialog';

/**
 * SettingsPage — Security & Rule Configuration dashboard.
 *
 * Three sections:
 * 1. Active Parsers (built-in Presidio rules)
 * 2. Custom Regex Rules (user-defined, persisted to localStorage)
 * 3. System Preferences (strict mode, auto-export, hardware accel)
 */
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

    const parserOrder: RuleType[] = ['email', 'phone', 'creditCard', 'ssn', 'names'];

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

                    {/* ── Section 1: Active Parsers ── */}
                    <section>
                        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-6 font-medium">
                            Active Parsers
                        </h2>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {parserOrder.map((ruleKey) => (
                                <ParserCard key={ruleKey} ruleKey={ruleKey} />
                            ))}
                        </div>
                    </section>

                    {/* ── Section 2: Custom Regex Rules ── */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-[#FFA500]/10 rounded-lg border border-[#FFA500]/20">
                                <Code2 className="w-5 h-5 text-[#FFA500]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white">Custom Regex Rules</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Define your own regex patterns for domain-specific redaction — API keys, employee IDs, custom formats, and more.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Existing custom rules */}
                            {customRules.length > 0 && (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    {customRules.map((rule) => (
                                        <CustomRuleCard key={rule.id} rule={rule} />
                                    ))}
                                </div>
                            )}

                            {/* Empty state */}
                            {customRules.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-10 px-6 rounded-xl border-2 border-dashed border-border text-center">
                                    <Code2 className="w-10 h-10 text-gray-600 mb-3" />
                                    <p className="text-sm text-gray-500 font-medium">No custom rules yet</p>
                                    <p className="text-xs text-gray-600 mt-1 max-w-xs">
                                        Create regex patterns tailored to your data — match API keys, internal IDs, or any custom format.
                                    </p>
                                </div>
                            )}

                            {/* Add rule button / dialog */}
                            <AddRuleDialog />
                        </div>
                    </section>

                    {/* ── Section 3: System Preferences ── */}
                    <section className="bg-card border border-border rounded-xl p-6 shadow-lg">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-[#FFA500]/10 rounded-lg border border-[#FFA500]/20">
                                <Lock className="w-5 h-5 text-[#FFA500]" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">System Preferences</h2>
                        </div>

                        <div className="space-y-2">
                            {/* Strict Verification Mode */}
                            <div
                                id="pref-strict-mode"
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
                                <ToggleSwitch
                                    id="toggle-strict-mode"
                                    checked={preferences.strictMode}
                                    onChange={() => togglePref('strictMode')}
                                />
                            </div>

                            {/* Auto-Export to PDF */}
                            <div
                                id="pref-auto-export"
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
                                <ToggleSwitch
                                    id="toggle-auto-export"
                                    checked={preferences.autoExport}
                                    onChange={() => togglePref('autoExport')}
                                />
                            </div>

                            {/* Hardware Acceleration */}
                            <div
                                id="pref-hardware-accel"
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
                                <ToggleSwitch
                                    id="toggle-hardware-accel"
                                    checked={preferences.hardwareAccel}
                                    onChange={() => togglePref('hardwareAccel')}
                                />
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* ── Sticky Footer ── */}
            <footer className="sticky bottom-0 z-10 bg-secondary border-t border-border p-4 md:p-6 shadow-2xl">
                <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
                    {/* Toast */}
                    <div className={`transition-all duration-300 ${saveToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                        <span className="text-sm text-emerald-400 font-medium flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Settings saved successfully
                        </span>
                    </div>

                    <div className="flex items-center gap-4 ml-auto">
                        <button
                            id="btn-discard"
                            className="px-6 py-2.5 border border-border text-muted-foreground rounded-lg hover:bg-card hover:text-white transition-colors font-medium text-sm cursor-pointer"
                        >
                            Discard
                        </button>
                        <button
                            id="btn-save"
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
