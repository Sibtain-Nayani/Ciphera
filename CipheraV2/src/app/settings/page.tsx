"use client";

import React from 'react';
import { ShieldCheck, Mail, Phone, CreditCard, Fingerprint, User, Eye, Lock, FileDown, Zap } from 'lucide-react';
import { useDocumentStore, RuleType, RedactionAction } from '@/store/documentStore';

/**
 * Metadata for each parser rule card.
 * Defines icon, color scheme, regex pattern, and action options.
 */
interface ParserMeta {
    label: string;
    icon: React.ReactNode;
    iconBgClass: string;
    iconBorderClass: string;
    iconTextClass: string;
    regex: string;
    regexLabel: string;
    actions: { value: RedactionAction | string; label: string }[];
}

const PARSER_META: Record<RuleType, ParserMeta> = {
    email: {
        label: 'Email Addresses',
        icon: <Mail className="w-5 h-5" />,
        iconBgClass: 'bg-blue-500/10',
        iconBorderClass: 'border-blue-500/20',
        iconTextClass: 'text-blue-400',
        regex: '/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/i',
        regexLabel: 'RegEx',
        actions: [
            { value: 'replace', label: 'Replace ([REDACTED])' },
            { value: 'mask', label: 'Mask (j***@***.com)' },
            { value: 'blackout', label: 'Remove Completely' },
        ],
    },
    phone: {
        label: 'Phone Numbers',
        icon: <Phone className="w-5 h-5" />,
        iconBgClass: 'bg-emerald-500/10',
        iconBorderClass: 'border-emerald-500/20',
        iconTextClass: 'text-emerald-400',
        regex: '/(\\(\\d{3}\\)|[-\\s.]?\\d{3})[-\\s.]?\\d{3}[-\\s.]?\\d{4}/',
        regexLabel: 'RegEx',
        actions: [
            { value: 'replace', label: 'Replace ([REDACTED])' },
            { value: 'mask', label: 'Mask ((XXX)-XXX-XXXX)' },
        ],
    },
    creditCard: {
        label: 'Credit Cards',
        icon: <CreditCard className="w-5 h-5" />,
        iconBgClass: 'bg-purple-500/10',
        iconBorderClass: 'border-purple-500/20',
        iconTextClass: 'text-purple-400',
        regex: '/(?:\\d{4}[-\\s]?){3}\\d{4}|\\d{4}[-\\s]?\\d{6}[-\\s]?\\d{5}/',
        regexLabel: 'RegEx',
        actions: [
            { value: 'mask', label: 'Mask (****-1234)' },
            { value: 'replace', label: 'Replace ([PCI DATA])' },
            { value: 'blackout', label: 'Blackout (██████)' },
        ],
    },
    ssn: {
        label: 'Social Security (SSN)',
        icon: <Fingerprint className="w-5 h-5" />,
        iconBgClass: 'bg-gray-500/10',
        iconBorderClass: 'border-gray-500/20',
        iconTextClass: 'text-gray-400',
        regex: '/\\d{3}[-\\s]?\\d{2}[-\\s]?\\d{4}/',
        regexLabel: 'RegEx',
        actions: [
            { value: 'mask', label: 'Mask (XXX-XX-XXXX)' },
            { value: 'replace', label: 'Replace ([REDACTED])' },
        ],
    },
    names: {
        label: 'Proper Names (NLP)',
        icon: <User className="w-5 h-5" />,
        iconBgClass: 'bg-[#FFA500]/10',
        iconBorderClass: 'border-[#FFA500]/20',
        iconTextClass: 'text-[#FFA500]',
        regex: 'en_core_web_trf (Transformer)',
        regexLabel: 'Spacy',
        actions: [
            { value: 'replace', label: 'Replace ([PERSON])' },
        ],
    },
};

/**
 * ToggleSwitch — iOS-style toggle bound to a boolean state.
 */
function ToggleSwitch({
    checked,
    onChange,
    disabled,
    id,
}: {
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
    id: string;
}) {
    return (
        <button
            id={id}
            role="switch"
            aria-checked={checked}
            aria-label="Toggle parser"
            onClick={disabled ? undefined : onChange}
            className={`
                relative w-12 h-6 rounded-full transition-colors duration-300 shrink-0
                ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                ${checked ? 'bg-[#FFA500]' : 'bg-[#3B3B3B]'}
            `}
        >
            <span
                className={`
                    absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full
                    transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
                    ${checked ? 'translate-x-6 shadow-sm' : 'translate-x-0'}
                `}
            />
        </button>
    );
}

/**
 * ParserCard — Individual rule configuration card.
 */
function ParserCard({ ruleKey }: { ruleKey: RuleType }) {
    const { rules, toggleRule, setRuleAction } = useDocumentStore();
    const config = rules[ruleKey];
    const meta = PARSER_META[ruleKey];
    const isActive = config.isActive;

    return (
        <article
            id={`parser-card-${ruleKey}`}
            className={`
                bg-card rounded-xl border border-border p-6 shadow-lg
                transition-opacity duration-300
                ${!isActive ? 'opacity-50' : ''}
            `}
        >
            {/* Card Header: Icon + Label + Toggle */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${meta.iconBgClass} flex items-center justify-center border ${meta.iconBorderClass} ${meta.iconTextClass}`}>
                        {meta.icon}
                    </div>
                    <h3 className={`font-semibold ${isActive ? 'text-white' : 'text-gray-400'}`}>
                        {meta.label}
                    </h3>
                </div>
                <ToggleSwitch
                    id={`toggle-${ruleKey}`}
                    checked={isActive}
                    onChange={() => toggleRule(ruleKey)}
                />
            </div>

            {/* Card Body: Regex + Action + Preview */}
            <div className="space-y-5">
                {/* Regex / Model Field */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        {ruleKey === 'names' ? 'Model' : 'Regex Pattern'}
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            readOnly
                            disabled={!isActive}
                            value={meta.regex}
                            spellCheck={false}
                            className={`
                                w-full rounded-lg px-4 py-2.5 text-sm font-mono
                                border border-border transition-all
                                focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500]
                                ${isActive
                                    ? 'bg-input text-emerald-400'
                                    : 'bg-background text-gray-500 cursor-not-allowed opacity-60'
                                }
                            `}
                            style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
                        />
                        <span className={`
                            absolute right-3 top-2.5 text-xs px-1
                            ${isActive
                                ? 'text-muted-foreground bg-input'
                                : 'text-muted-foreground bg-background opacity-60'
                            }
                        `}>
                            {meta.regexLabel}
                        </span>
                    </div>
                </div>

                {/* Action Select + Preview Button Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            Action
                        </label>
                        <select
                            id={`action-${ruleKey}`}
                            disabled={!isActive}
                            value={config.action}
                            onChange={(e) => setRuleAction(ruleKey, e.target.value as RedactionAction)}
                            className={`
                                w-full rounded-lg px-4 py-2.5 text-sm
                                border border-border appearance-none transition-all
                                focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500]
                                ${isActive
                                    ? 'bg-input text-white cursor-pointer'
                                    : 'bg-background text-gray-500 cursor-not-allowed opacity-60'
                                }
                            `}
                        >
                            {meta.actions.map((a) => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-end">
                        <button
                            id={`preview-${ruleKey}`}
                            disabled={!isActive}
                            className={`
                                w-full h-[42px] flex items-center justify-center gap-2
                                rounded-lg text-sm font-medium transition-all
                                ${isActive
                                    ? 'border border-[#FFA500] text-[#FFA500] hover:bg-[#FFA500] hover:text-black cursor-pointer'
                                    : 'border border-border text-gray-500 cursor-not-allowed opacity-60'
                                }
                            `}
                        >
                            <Eye className="w-4 h-4" />
                            Preview Redaction
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
}

/**
 * SettingsPage — Security & Rule Configuration dashboard.
 * Matches the Stitch "Security Settings Dashboard" design using Ciphera's own theme.
 */
export default function SettingsPage() {
    const [preferences, setPreferences] = React.useState({
        strictMode: true,
        autoExport: false,
        hardwareAccel: true,
    });

    const togglePref = (key: keyof typeof preferences) => {
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
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

                    {/* Active Parsers Section */}
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

                    {/* System Preferences Section */}
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
                <div className="max-w-7xl mx-auto w-full flex items-center justify-end gap-4">
                    <button
                        id="btn-discard"
                        className="px-6 py-2.5 border border-border text-muted-foreground rounded-lg hover:bg-card hover:text-white transition-colors font-medium text-sm cursor-pointer"
                    >
                        Discard
                    </button>
                    <button
                        id="btn-save"
                        className="px-6 py-2.5 bg-[#FFA500] text-black rounded-lg shadow-[0_0_15px_rgba(255,165,0,0.3)] hover:bg-[#E69500] transition-all font-medium text-sm cursor-pointer"
                    >
                        Save Changes
                    </button>
                </div>
            </footer>
        </div>
    );
}
