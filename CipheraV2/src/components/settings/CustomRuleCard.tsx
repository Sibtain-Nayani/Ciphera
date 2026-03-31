"use client";

import React from 'react';
import { Trash2, AlertCircle, CheckCircle2, Code2 } from 'lucide-react';
import { useDocumentStore, CustomRule, RedactionAction, PRESET_COLORS, PresetColor } from '@/store/documentStore';
import { ToggleSwitch } from './ToggleSwitch';

/**
 * Validates a regex pattern string.
 * Returns true if the pattern compiles without error.
 */
function isValidRegex(pattern: string): boolean {
    if (!pattern.trim()) return false;
    try {
        new RegExp(pattern);
        return true;
    } catch {
        return false;
    }
}

const CUSTOM_ACTIONS: { value: RedactionAction; label: string }[] = [
    { value: 'replace', label: 'Replace ([REDACTED])' },
    { value: 'mask', label: 'Mask (Partial Hide)' },
    { value: 'blackout', label: 'Blackout (██████)' },
];

/**
 * CustomRuleCard — Editable card for a user-defined regex rule.
 * Supports inline editing of label, pattern, color, and action.
 */
export function CustomRuleCard({ rule }: { rule: CustomRule }) {
    const { updateCustomRule, removeCustomRule, toggleCustomRule } = useDocumentStore();
    const isActive = rule.isActive;
    const regexValid = isValidRegex(rule.pattern);

    return (
        <article
            id={`custom-rule-${rule.id}`}
            className={`
                group bg-card rounded-xl border border-border p-6 shadow-lg
                transition-all duration-300 animate-in fade-in
                hover:border-[#3B3B3B]/80 hover:shadow-xl
                ${!isActive ? 'opacity-50' : ''}
            `}
        >
            {/* Header: Color dot + Label + Toggle + Delete */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    {/* Color badge with icon */}
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center border transition-transform duration-300 group-hover:scale-105"
                        style={{
                            backgroundColor: `${rule.color}15`,
                            borderColor: `${rule.color}33`,
                            color: rule.color,
                        }}
                    >
                        <Code2 className="w-5 h-5" />
                    </div>

                    {/* Editable label */}
                    <input
                        type="text"
                        value={rule.label}
                        onChange={(e) => updateCustomRule(rule.id, { label: e.target.value })}
                        disabled={!isActive}
                        placeholder="Rule name…"
                        className={`
                            font-semibold bg-transparent border-none outline-none
                            w-40 transition-colors placeholder:text-gray-600
                            ${isActive ? 'text-white' : 'text-gray-400 cursor-not-allowed'}
                        `}
                    />
                </div>

                <div className="flex items-center gap-3">
                    {/* Delete button */}
                    <button
                        id={`delete-rule-${rule.id}`}
                        onClick={() => removeCustomRule(rule.id)}
                        className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer"
                        title="Delete rule"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <ToggleSwitch
                        id={`toggle-custom-${rule.id}`}
                        checked={isActive}
                        onChange={() => toggleCustomRule(rule.id)}
                    />
                </div>
            </div>

            {/* Body */}
            <div className="space-y-5">
                {/* Regex pattern input (editable) */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        Regex Pattern
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={rule.pattern}
                            onChange={(e) => updateCustomRule(rule.id, { pattern: e.target.value })}
                            disabled={!isActive}
                            placeholder="e.g. sk-[a-zA-Z0-9]{32}"
                            spellCheck={false}
                            className={`
                                w-full rounded-lg px-4 py-2.5 text-sm font-mono pr-20
                                border transition-all
                                focus:outline-none focus:ring-1
                                ${!isActive
                                    ? 'bg-background text-gray-500 cursor-not-allowed opacity-60 border-border'
                                    : regexValid
                                        ? 'bg-input text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500/50'
                                        : 'bg-input text-red-400 border-red-500/30 focus:border-red-500 focus:ring-red-500/50'
                                }
                            `}
                            style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}
                        />
                        {/* Validation indicator */}
                        <span className="absolute right-3 top-2.5 flex items-center gap-1.5">
                            {isActive && rule.pattern.trim() && (
                                regexValid ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                )
                            )}
                            <span className={`text-xs px-1 ${isActive ? 'text-muted-foreground bg-input' : 'text-muted-foreground bg-background opacity-60'}`}>
                                RegEx
                            </span>
                        </span>
                    </div>
                    {/* Inline error */}
                    {isActive && rule.pattern.trim() && !regexValid && (
                        <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Invalid regex pattern
                        </p>
                    )}
                </div>

                {/* Action + Color picker row */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Action dropdown */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            Action
                        </label>
                        <select
                            id={`action-custom-${rule.id}`}
                            disabled={!isActive}
                            value={rule.action}
                            onChange={(e) => updateCustomRule(rule.id, { action: e.target.value as RedactionAction })}
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
                            {CUSTOM_ACTIONS.map((a) => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Color presets */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            Color
                        </label>
                        <div className="flex items-center gap-2 h-[42px] flex-wrap">
                            {PRESET_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    disabled={!isActive}
                                    onClick={() => updateCustomRule(rule.id, { color: color as PresetColor })}
                                    className={`
                                        w-6 h-6 rounded-full border-2 transition-all
                                        ${!isActive ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:scale-110'}
                                        ${rule.color === color ? 'border-white scale-110 shadow-lg' : 'border-transparent'}
                                    `}
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </article>
    );
}
