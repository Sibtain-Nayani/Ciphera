"use client";

import React, { useState } from 'react';
import { ShieldAlert, Plus, Trash2, Edit2, Settings, FileDown, Code, Lock, Zap, CheckCircle2 } from 'lucide-react';
import { useDocumentStore, RuleType, RedactionAction } from '@/store/documentStore';

export default function SettingsPage() {
    const { rules, setRuleAction } = useDocumentStore();

    const [preferences, setPreferences] = useState({
        strictMode: true,
        autoExport: false,
        hardwareAccel: true,
    });

    const togglePref = (key: keyof typeof preferences) => {
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const ruleDetails: Record<RuleType, { label: string, desc: string }> = {
        email: { label: 'Email Addresses', desc: '/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/i' },
        phone: { label: 'Phone Numbers', desc: '/(\\d{3}[-\\s.]?\\d{4}[-\\s.]?\\d{3,4}|\\(\\d{3}\\)\\s*\\d{3}[-\\s.]?\\d{4})/i' },
        creditCard: { label: 'Credit Cards', desc: '/(\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}|\\d{4}[-\\s]?\\d{6}[-\\s]?\\d{5})/i' },
        ssn: { label: 'Social Security (SSN)', desc: '/(\\d{3}-\\d{2}-\\d{4})/i' },
        names: { label: 'Proper Names (NLP)', desc: 'Spacy EN_CORE_WEB_LG Native Model' },
    }

    return (
        <div className="w-full py-12 px-6 font-sans flex justify-center selection:bg-[#FFA500] selection:text-black">
            <main className="max-w-3xl w-full space-y-10">

                {/* Page Header */}
                <header className="border-b border-[#3B3B3B] pb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <ShieldAlert className="w-7 h-7 text-[#FFA500]" />
                        <h1 className="text-2xl font-semibold text-white tracking-tight">Security & Rule Configuration</h1>
                    </div>
                    <p className="text-sm text-gray-400">
                        Define custom regex patterns, manage entity recognition actions, and configure system-wide security preferences.
                    </p>
                </header>

                {/* Active Rules List */}
                <section className="space-y-4">
                    <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider pl-1">Active Parsers</h2>

                    <div className="bg-[#1E1E1E] border border-[#3B3B3B] rounded-2xl overflow-hidden divide-y divide-[#3B3B3B]">

                        {(Object.entries(rules) as [RuleType, { isActive: boolean, action: RedactionAction }][]).map(([ruleKey, config]) => (
                            <div key={ruleKey} className="p-5 flex items-center justify-between hover:bg-[#252525] transition-colors group">
                                <div className="space-y-1.5 w-1/2">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-sm font-medium text-white">{ruleDetails[ruleKey].label}</h3>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors ${config.isActive ? 'bg-[#FFA500]/10 border-[#FFA500]/50 text-[#FFA500]' : 'bg-[#151515] border-[#3B3B3B] text-gray-500'}`}>
                                            {config.isActive ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                    </div>
                                    <code className="text-[10px] font-mono text-gray-400 bg-[#2A2A2A] px-1.5 py-0.5 rounded truncate block max-w-xs">{ruleDetails[ruleKey].desc}</code>
                                </div>

                                <div className="flex items-center gap-4 w-1/2 justify-end">
                                    <label className="text-xs text-gray-500 font-medium">ACTION:</label>
                                    <select
                                        value={config.action}
                                        onChange={(e) => setRuleAction(ruleKey, e.target.value as RedactionAction)}
                                        className="appearance-none bg-[#151515] border border-[#3B3B3B] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500] transition-all cursor-pointer w-44 hover:bg-[#2A2A2A]"
                                    >
                                        <option value="replace">Replace ([REDACTED])</option>
                                        <option value="mask">Mask (e.g. t***t)</option>
                                        <option value="blackout">Blackout (██████)</option>
                                    </select>
                                </div>
                            </div>
                        ))}

                        <div className="p-5 flex items-center justify-between bg-[#212121]/50 border-t border-[#3B3B3B]">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <span className="text-sm italic">5 built-in NLP rules currently available</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* System Preferences */}
                <section className="bg-[#1E1E1E] border border-[#3B3B3B] rounded-2xl p-6 mb-12">
                    <div className="flex items-center gap-2 mb-6">
                        <Settings className="w-5 h-5 text-gray-400" />
                        <h2 className="text-lg font-medium text-white">System Preferences</h2>
                    </div>

                    <div className="space-y-2">
                        <div
                            className="flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-[#3B3B3B] hover:bg-[#252525] transition-all cursor-pointer"
                            onClick={() => togglePref('strictMode')}
                        >
                            <div className="flex items-start gap-3">
                                <Lock className="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <h3 className="text-sm font-medium text-white">Strict Verification Mode</h3>
                                    <p className="text-xs text-gray-500 mt-1">Forces manual review of all redactions before export is allowed.</p>
                                </div>
                            </div>
                            <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${preferences.strictMode ? 'bg-[#FFA500]' : 'bg-[#3B3B3B]'}`}>
                                <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${preferences.strictMode ? 'translate-x-5 shadow-sm' : 'translate-x-0'}`}></div>
                            </div>
                        </div>

                        <div
                            className="flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-[#3B3B3B] hover:bg-[#252525] transition-all cursor-pointer"
                            onClick={() => togglePref('autoExport')}
                        >
                            <div className="flex items-start gap-3">
                                <FileDown className="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <h3 className="text-sm font-medium text-white">Auto-Export to PDF</h3>
                                    <p className="text-xs text-gray-500 mt-1">Automatically generates a flattened PDF upon redaction approval.</p>
                                </div>
                            </div>
                            <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${preferences.autoExport ? 'bg-[#FFA500]' : 'bg-[#3B3B3B]'}`}>
                                <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${preferences.autoExport ? 'translate-x-5 shadow-sm' : 'translate-x-0'}`}></div>
                            </div>
                        </div>

                        <div
                            className="flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-[#3B3B3B] hover:bg-[#252525] transition-all cursor-pointer"
                            onClick={() => togglePref('hardwareAccel')}
                        >
                            <div className="flex items-start gap-3">
                                <Zap className="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <h3 className="text-sm font-medium text-white">Hardware Acceleration</h3>
                                    <p className="text-xs text-gray-500 mt-1">Utilize local GPU for NLP entity recognition if available.</p>
                                </div>
                            </div>
                            <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${preferences.hardwareAccel ? 'bg-[#FFA500]' : 'bg-[#3B3B3B]'}`}>
                                <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${preferences.hardwareAccel ? 'translate-x-5 shadow-sm' : 'translate-x-0'}`}></div>
                            </div>
                        </div>
                    </div>
                </section>

            </main>
        </div>
    );
}
