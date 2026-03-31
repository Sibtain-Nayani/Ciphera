"use client";

import React from 'react';
import { Mail, Phone, CreditCard, Fingerprint, User, Eye } from 'lucide-react';
import { useDocumentStore, RuleType, RedactionAction } from '@/store/documentStore';
import { ToggleSwitch } from './ToggleSwitch';

/**
 * Visual metadata for each built-in parser rule.
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
            { value: 'mask', label: 'Mask (Partial Hide)' },
            { value: 'blackout', label: 'Blackout (██████)' },
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
            { value: 'mask', label: 'Mask (Partial Hide)' },
            { value: 'blackout', label: 'Blackout (██████)' },
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
            { value: 'replace', label: 'Replace ([REDACTED])' },
            { value: 'mask', label: 'Mask (Partial Hide)' },
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
            { value: 'replace', label: 'Replace ([REDACTED])' },
            { value: 'mask', label: 'Mask (Partial Hide)' },
            { value: 'blackout', label: 'Blackout (██████)' },
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
            { value: 'replace', label: 'Replace ([REDACTED])' },
            { value: 'mask', label: 'Mask (Partial Hide)' },
            { value: 'blackout', label: 'Blackout (██████)' },
        ],
    },
};

/**
 * ParserCard — Built-in rule configuration card.
 * Shows the icon, toggle, regex pattern (read-only), action selector, and preview button.
 */
export function ParserCard({ ruleKey }: { ruleKey: RuleType }) {
    const { rules, toggleRule, setRuleAction } = useDocumentStore();
    const config = rules[ruleKey];
    const meta = PARSER_META[ruleKey];
    const isActive = config.isActive;

    return (
        <article
            id={`parser-card-${ruleKey}`}
            className={`
                group bg-card rounded-xl border border-border p-6 shadow-lg
                transition-all duration-300 animate-in fade-in
                hover:border-[#3B3B3B]/80 hover:shadow-xl
                ${!isActive ? 'opacity-50' : ''}
            `}
        >
            {/* Card Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${meta.iconBgClass} flex items-center justify-center border ${meta.iconBorderClass} ${meta.iconTextClass} transition-transform duration-300 group-hover:scale-105`}>
                        {meta.icon}
                    </div>
                    <h3 className={`font-semibold transition-colors ${isActive ? 'text-white' : 'text-gray-400'}`}>
                        {meta.label}
                    </h3>
                </div>
                <ToggleSwitch
                    id={`toggle-${ruleKey}`}
                    checked={isActive}
                    onChange={() => toggleRule(ruleKey)}
                />
            </div>

            {/* Card Body */}
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

                {/* Action + Preview */}
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
                            Preview
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
}
