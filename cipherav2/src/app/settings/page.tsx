"use client";

import React, { useState } from 'react';
import { ShieldAlert, Plus, Trash2, Edit2, Settings, FileDown, Code, Lock, Zap, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
    const [preferences, setPreferences] = useState({
        strictMode: true,
        autoExport: false,
        hardwareAccel: true,
    });

    const togglePref = (key: keyof typeof preferences) => {
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
    };

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

                {/* Custom Rules Builder Section */}
                <section className="bg-[#1E1E1E] border border-[#3B3B3B] rounded-2xl p-6 shadow-lg">
                    <div className="flex items-center gap-2 mb-6">
                        <Code className="w-5 h-5 text-gray-400" />
                        <h2 className="text-lg font-medium text-white">Custom Rule Builder</h2>
                    </div>

                    <div className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Rule Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g., GSTIN Detection"
                                    className="w-full bg-[#212121] border border-[#3B3B3B] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500] transition-all placeholder:text-gray-600"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Redaction Action</label>
                                <div className="relative">
                                    <select className="appearance-none w-full bg-[#212121] border border-[#3B3B3B] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500] transition-all cursor-pointer">
                                        <option value="mask">Mask (e.g., ****-1234)</option>
                                        <option value="blackout">Blackout [REDACTED]</option>
                                        <option value="scramble">Scramble (Randomize)</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider flex justify-between">
                                <span>Regex Pattern</span>
                                <span className="text-emerald-500 font-mono lowercase">Valid</span>
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                    <span className="text-[#FFA500] font-mono text-sm">/</span>
                                </div>
                                <input
                                    type="text"
                                    defaultValue="^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
                                    className="w-full bg-[#151515] border border-[#3B3B3B] rounded-lg pl-8 pr-8 py-3 text-sm text-gray-300 font-mono focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500] transition-all"
                                />
                                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                                    <span className="text-[#FFA500] font-mono text-sm">/g</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button className="flex items-center gap-2 bg-[#2A2A2A] hover:bg-[#FFA500] text-[#FFA500] hover:text-black border border-[#FFA500]/30 hover:border-transparent px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 cursor-pointer">
                                <Plus className="w-4 h-4" />
                                Deploy Rule
                            </button>
                        </div>
                    </div>
                </section>

                {/* Active Rules List */}
                <section className="space-y-4">
                    <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider pl-1">Active Parsers</h2>

                    <div className="bg-[#1E1E1E] border border-[#3B3B3B] rounded-2xl overflow-hidden divide-y divide-[#3B3B3B]">
                        <div className="p-5 flex items-center justify-between hover:bg-[#252525] transition-colors group">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-sm font-medium text-white">PAN Card Detection</h3>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#151515] border border-[#3B3B3B] text-gray-400">BLACKOUT</span>
                                </div>
                                <code className="text-xs font-mono text-[#FFA500] bg-[#FFA500]/10 px-1.5 py-0.5 rounded">/[A-Z]{'{'}5{'}'}[0-9]{'{'}4{'}'}[A-Z]{'{'}1{'}'}/g</code>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-2 text-gray-400 hover:text-white hover:bg-[#3B3B3B] rounded-md transition-colors cursor-pointer"><Edit2 className="w-4 h-4" /></button>
                                <button className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>

                        <div className="p-5 flex items-center justify-between hover:bg-[#252525] transition-colors group">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-sm font-medium text-white">Aadhaar Card Detection</h3>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#151515] border border-[#3B3B3B] text-gray-400">MASK</span>
                                </div>
                                <code className="text-xs font-mono text-[#FFA500] bg-[#FFA500]/10 px-1.5 py-0.5 rounded">/^\d{'{'}4{'}'}\s\d{'{'}4{'}'}\s\d{'{'}4{'}'}$/g</code>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-2 text-gray-400 hover:text-white hover:bg-[#3B3B3B] rounded-md transition-colors cursor-pointer"><Edit2 className="w-4 h-4" /></button>
                                <button className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>

                        <div className="p-5 flex items-center justify-between bg-[#212121]/50">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <span className="text-sm italic">5 built-in NLP rules currently active</span>
                                </div>
                            </div>
                            <button className="text-xs text-[#FFA500] hover:underline cursor-pointer">View built-in rules</button>
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
