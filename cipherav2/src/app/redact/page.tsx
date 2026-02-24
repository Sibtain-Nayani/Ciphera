"use client";

import React, { useState } from 'react';
import { Download, FileText, Settings2, Eye, EyeOff, Shield, ChevronLeft } from 'lucide-react';

export default function WorkspacePage() {
    const [previewMode, setPreviewMode] = useState<'original' | 'redacted'>('redacted');

    // Rule Toggle States
    const [rules, setRules] = useState({
        email: true,
        phone: true,
        creditCard: true,
        ssn: false,
        names: false,
    });

    const toggleRule = (rule: keyof typeof rules) => {
        setRules(prev => ({ ...prev, [rule]: !prev[rule] }));
    };

    return (
        <div className="w-full font-sans flex flex-col md:flex-row h-[calc(100vh-64px)] md:h-screen selection:bg-[#FFA500] selection:text-black">

            {/* LEFT PANE: Document Viewer (60%) */}
            <section className="w-full md:w-[60%] lg:w-[65%] flex flex-col border-r border-[#3B3B3B] h-full">

                {/* Toolbar */}
                <header className="flex items-center justify-between p-4 px-6 bg-[#1E1E1E] border-b border-[#3B3B3B] shrink-0">
                    <div className="flex items-center gap-4">
                        <button className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-[#2A2A2A] cursor-pointer">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-500" />
                                <h1 className="text-sm font-medium text-white">Employee_Census_Data_v2.csv</h1>
                            </div>
                            <span className="text-xs font-mono text-gray-500 mt-0.5">ID: DOC-9483 • 14.1 MB</span>
                        </div>
                    </div>

                    <button className="flex items-center gap-2 bg-[#FFA500] hover:bg-[#ffb733] text-black px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 shadow-[0_0_15px_rgba(255,165,0,0.2)] hover:shadow-[0_0_20px_rgba(255,165,0,0.4)] hover:-translate-y-0.5 cursor-pointer">
                        <Download className="w-4 h-4" />
                        Export Secure
                    </button>
                </header>

                {/* Editor / Text Area */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-[#212121]">
                    <div className="max-w-3xl mx-auto font-mono text-[13px] leading-relaxed text-gray-400 break-words whitespace-pre-wrap">
                        {`[SYSTEM LOG: INITIALIZING DATA PARSER...]
[TIMESTAMP: 2026-02-25T09:30:14Z]
BEGIN RECORD BATCH:

Employee_ID, First_Name, Last_Name, Email, Phone, Department, Salary, CC_OnFile
EMP-001, Sarah, Jenkins, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.email && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.email && previewMode === 'redacted' ? '[REDACTED_EMAIL]' : 's.jenkins@corp-domain.com'}
                        </span>

                        {`, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.phone && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.phone && previewMode === 'redacted' ? '[REDACTED_PHONE]' : '555-0198-442'}
                        </span>

                        {`, Engineering, $145,000, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.creditCard && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.creditCard && previewMode === 'redacted' ? '[REDACTED_CC]' : '4532-XXXX-XXXX-8912'}
                        </span>

                        {`
EMP-002, Marcus, Chen, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.email && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.email && previewMode === 'redacted' ? '[REDACTED_EMAIL]' : 'm.chen@corp-domain.com'}
                        </span>

                        {`, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.phone && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.phone && previewMode === 'redacted' ? '[REDACTED_PHONE]' : '555-0122-991'}
                        </span>

                        {`, Marketing, $92,500, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.creditCard && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.creditCard && previewMode === 'redacted' ? '[REDACTED_CC]' : '3782-XXXX-XXXX-1004'}
                        </span>

                        {`
EMP-003, Elena, Rodriguez, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.email && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.email && previewMode === 'redacted' ? '[REDACTED_EMAIL]' : 'e.rodriguez@corp-domain.com'}
                        </span>

                        {`, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.phone && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.phone && previewMode === 'redacted' ? '[REDACTED_PHONE]' : '555-0177-334'}
                        </span>

                        {`, Legal, $178,000, `}

                        <span className={`px-1 rounded mx-0.5 transition-colors duration-300 ${rules.creditCard && previewMode === 'redacted' ? 'bg-[#FFA500] text-black font-medium' : 'bg-transparent text-gray-300'}`}>
                            {rules.creditCard && previewMode === 'redacted' ? '[REDACTED_CC]' : '5103-XXXX-XXXX-6671'}
                        </span>

                        {`

[END OF BATCH PREVIEW]
[AWAITING REDACTION CONFIRMATION...]`}
                    </div>
                </div>
            </section>

            {/* RIGHT PANE: Configuration Sidebar (40%) */}
            <section className="w-full md:w-[40%] lg:w-[35%] flex flex-col h-full bg-[#1E1E1E]">

                {/* Header & Preview Toggle */}
                <header className="p-6 border-b border-[#3B3B3B] shrink-0 space-y-6">
                    <div className="flex items-center gap-3">
                        <Settings2 className="w-5 h-5 text-[#FFA500]" />
                        <h2 className="text-lg font-medium text-white">Redaction Workspace</h2>
                    </div>

                    {/* Segmented Control for Preview */}
                    <div className="flex p-1 bg-[#212121] rounded-lg border border-[#3B3B3B]">
                        <button
                            onClick={() => setPreviewMode('original')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all duration-300 cursor-pointer ${previewMode === 'original' ? 'bg-[#3B3B3B] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Eye className="w-4 h-4" /> Original
                        </button>
                        <button
                            onClick={() => setPreviewMode('redacted')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all duration-300 cursor-pointer ${previewMode === 'redacted' ? 'bg-[#FFA500] text-black shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Shield className="w-4 h-4" /> Redacted
                        </button>
                    </div>
                </header>

                {/* Rules List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                        <h3 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">Active Pattern Rules</h3>
                        <div className="space-y-3">

                            {[
                                { id: 'email', label: 'Email Addresses', desc: 'Matches standard RFC 5322 formats', count: 142 },
                                { id: 'phone', label: 'Phone Numbers', desc: 'Matches international & local formats', count: 87 },
                                { id: 'creditCard', label: 'Credit Cards', desc: 'Matches Visa, MC, Amex patterns', count: 24 },
                                { id: 'ssn', label: 'Social Security (SSN)', desc: 'Matches XXX-XX-XXXX patterns', count: 0 },
                                { id: 'names', label: 'Proper Names (NLP)', desc: 'Uses local NER model to find names', count: 312 },
                            ].map((rule) => {
                                const isRuleActive = rules[rule.id as keyof typeof rules];
                                return (
                                    <div
                                        key={rule.id}
                                        onClick={() => toggleRule(rule.id as keyof typeof rules)}
                                        className={`group flex items-start justify-between p-4 rounded-xl border transition-all duration-300 cursor-pointer select-none
                    ${isRuleActive
                                                ? 'bg-[#FFA500]/5 border-[#FFA500]/30 hover:border-[#FFA500]/60'
                                                : 'bg-[#212121] border-[#3B3B3B] hover:border-gray-500'}`}
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-medium ${isRuleActive ? 'text-white' : 'text-gray-400'}`}>
                                                    {rule.label}
                                                </span>
                                                {isRuleActive && rule.count > 0 && (
                                                    <span className="px-2 py-0.5 rounded-full bg-[#FFA500]/20 text-[#FFA500] text-[10px] font-mono border border-[#FFA500]/30">
                                                        {rule.count} MATCHES
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">{rule.desc}</p>
                                        </div>

                                        {/* Sleek Custom Switch */}
                                        <div className={`relative w-10 h-5 rounded-full transition-colors duration-300 mt-0.5 shrink-0 ${isRuleActive ? 'bg-[#FFA500]' : 'bg-[#3B3B3B]'}`}>
                                            <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform duration-300 ${isRuleActive ? 'translate-x-5 shadow-sm' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                )
                            })}

                        </div>
                    </div>

                    {/* Engine Info Box */}
                    <div className="mt-8 p-4 rounded-xl border border-[#3B3B3B] bg-[#212121] flex items-start gap-3">
                        <EyeOff className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <h4 className="text-sm font-medium text-gray-300">Local NLP Engine Active</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Entity recognition is running locally on this machine. No data is transmitted to external servers during this preview.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
}
