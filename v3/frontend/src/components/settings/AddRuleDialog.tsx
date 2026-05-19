"use client";

import React, { useState, useCallback } from 'react';
import { Plus, X, CheckCircle2, AlertCircle, FlaskConical } from 'lucide-react';
import { useDocumentStore, RedactionAction, PRESET_COLORS, PresetColor, MAX_CUSTOM_RULES } from '@/store/documentStore';

/**
 * Validates a regex pattern string.
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

const ACTIONS: { value: RedactionAction; label: string }[] = [
    { value: 'replace', label: 'Replace ([REDACTED])' },
    { value: 'mask', label: 'Mask (Partial Hide)' },
    { value: 'blackout', label: 'Blackout (██████)' },
];

interface FormState {
    label: string;
    pattern: string;
    action: RedactionAction;
    color: PresetColor;
    testInput: string;
}

const INITIAL_FORM: FormState = {
    label: '',
    pattern: '',
    action: 'replace',
    color: PRESET_COLORS[0],
    testInput: '',
};

/**
 * AddRuleDialog — Expandable inline form for creating a new custom regex rule.
 * Features real-time regex validation and a test-pattern preview.
 */
export function AddRuleDialog() {
    const { addCustomRule, customRules } = useDocumentStore();
    const [isOpen, setIsOpen] = useState(false);
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [showTest, setShowTest] = useState(false);

    const atLimit = customRules.length >= MAX_CUSTOM_RULES;
    const patternValid = isValidRegex(form.pattern);
    const canSave = form.label.trim() !== '' && patternValid;

    const update = useCallback(
        <K extends keyof FormState>(key: K, value: FormState[K]) =>
            setForm((prev) => ({ ...prev, [key]: value })),
        []
    );

    const handleSave = () => {
        if (!canSave) return;
        addCustomRule({
            label: form.label.trim(),
            pattern: form.pattern.trim(),
            action: form.action,
            color: form.color,
            isActive: true,
        });
        setForm(INITIAL_FORM);
        setShowTest(false);
        setIsOpen(false);
    };

    const handleCancel = () => {
        setForm(INITIAL_FORM);
        setShowTest(false);
        setIsOpen(false);
    };

    /** Highlight regex matches in the test input string. */
    const renderTestResult = () => {
        if (!form.testInput || !patternValid) return null;

        try {
            const regex = new RegExp(form.pattern, 'g');
            const parts: React.ReactNode[] = [];
            let lastIndex = 0;
            let match: RegExpExecArray | null;
            let key = 0;

            while ((match = regex.exec(form.testInput)) !== null) {
                if (match.index > lastIndex) {
                    parts.push(
                        <span key={key++} className="text-gray-400">
                            {form.testInput.slice(lastIndex, match.index)}
                        </span>
                    );
                }
                parts.push(
                    <span
                        key={key++}
                        className="bg-[#FFA500] text-black font-medium rounded-sm px-0.5"
                    >
                        {match[0]}
                    </span>
                );
                lastIndex = regex.lastIndex;
                // Prevent infinite loop on zero-width matches
                if (match[0].length === 0) regex.lastIndex++;
            }

            if (lastIndex < form.testInput.length) {
                parts.push(
                    <span key={key++} className="text-gray-400">
                        {form.testInput.slice(lastIndex)}
                    </span>
                );
            }

            const matchCount = form.testInput.match(new RegExp(form.pattern, 'g'))?.length ?? 0;

            return (
                <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                        {matchCount > 0 ? (
                            <span className="text-emerald-400">{matchCount} match{matchCount !== 1 ? 'es' : ''} found</span>
                        ) : (
                            <span className="text-yellow-400">No matches found</span>
                        )}
                    </p>
                    <div
                        className="p-3 rounded-lg bg-background border border-border text-sm font-mono break-all whitespace-pre-wrap"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                    >
                        {parts.length > 0 ? parts : <span className="text-gray-500">{form.testInput}</span>}
                    </div>
                </div>
            );
        } catch {
            return null;
        }
    };

    /* ── Collapsed state: just the "Add Rule" button ── */
    if (!isOpen) {
        return (
            <button
                id="btn-add-custom-rule"
                disabled={atLimit}
                onClick={() => setIsOpen(true)}
                className={`
                    w-full py-4 rounded-xl border-2 border-dashed
                    flex items-center justify-center gap-2 text-sm font-medium
                    transition-all duration-300
                    ${atLimit
                        ? 'border-border text-gray-600 cursor-not-allowed'
                        : 'border-[#FFA500]/30 text-[#FFA500] hover:border-[#FFA500] hover:bg-[#FFA500]/5 cursor-pointer'
                    }
                `}
            >
                <Plus className="w-4 h-4" />
                {atLimit ? `Rule limit reached (${MAX_CUSTOM_RULES})` : 'Add Custom Rule'}
            </button>
        );
    }

    /* ── Expanded state: the creation form ── */
    return (
        <div className="bg-card border border-[#FFA500]/30 rounded-xl p-6 shadow-lg shadow-[#FFA500]/5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Plus className="w-5 h-5 text-[#FFA500]" />
                    New Custom Rule
                </h3>
                <button
                    onClick={handleCancel}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-5">
                {/* Row 1: Label + Color */}
                <div className="grid grid-cols-[1fr_auto] gap-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            Rule Name
                        </label>
                        <input
                            type="text"
                            value={form.label}
                            onChange={(e) => update('label', e.target.value)}
                            placeholder="e.g. API Keys, Employee IDs…"
                            className="w-full rounded-lg px-4 py-2.5 text-sm bg-input text-white border border-border transition-all focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500] placeholder:text-gray-600"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            Color
                        </label>
                        <div className="flex items-center gap-1.5 h-[42px]">
                            {PRESET_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => update('color', color as PresetColor)}
                                    className={`
                                        w-6 h-6 rounded-full border-2 transition-all cursor-pointer hover:scale-110
                                        ${form.color === color ? 'border-white scale-110 shadow-lg' : 'border-transparent'}
                                    `}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Row 2: Regex Pattern */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        Regex Pattern
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={form.pattern}
                            onChange={(e) => update('pattern', e.target.value)}
                            placeholder="e.g. sk-[a-zA-Z0-9]{32}"
                            spellCheck={false}
                            className={`
                                w-full rounded-lg px-4 py-2.5 text-sm font-mono pr-20
                                border transition-all
                                focus:outline-none focus:ring-1
                                ${form.pattern.trim()
                                    ? patternValid
                                        ? 'bg-input text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500/50'
                                        : 'bg-input text-red-400 border-red-500/30 focus:border-red-500 focus:ring-red-500/50'
                                    : 'bg-input text-white border-border focus:border-[#FFA500] focus:ring-[#FFA500]'
                                }
                            `}
                            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                        />
                        <span className="absolute right-3 top-2.5 flex items-center gap-1.5">
                            {form.pattern.trim() && (
                                patternValid ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                )
                            )}
                            <span className="text-xs text-muted-foreground bg-input px-1">RegEx</span>
                        </span>
                    </div>
                    {form.pattern.trim() && !patternValid && (
                        <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Invalid regex syntax
                        </p>
                    )}
                </div>

                {/* Row 3: Action */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        Action
                    </label>
                    <select
                        value={form.action}
                        onChange={(e) => update('action', e.target.value as RedactionAction)}
                        className="w-full rounded-lg px-4 py-2.5 text-sm bg-input text-white border border-border appearance-none transition-all focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500] cursor-pointer"
                    >
                        {ACTIONS.map((a) => (
                            <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                    </select>
                </div>

                {/* Test Pattern Area */}
                <div>
                    <button
                        type="button"
                        onClick={() => setShowTest(!showTest)}
                        disabled={!patternValid}
                        className={`
                            flex items-center gap-2 text-xs font-medium transition-colors
                            ${patternValid
                                ? 'text-[#FFA500] hover:text-[#FFB733] cursor-pointer'
                                : 'text-gray-600 cursor-not-allowed'
                            }
                        `}
                    >
                        <FlaskConical className="w-3.5 h-3.5" />
                        {showTest ? 'Hide' : 'Test'} Pattern
                    </button>

                    {showTest && patternValid && (
                        <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                            <textarea
                                value={form.testInput}
                                onChange={(e) => update('testInput', e.target.value)}
                                placeholder="Paste sample text to test your regex…"
                                rows={3}
                                className="w-full rounded-lg px-4 py-2.5 text-sm bg-input text-white border border-border transition-all resize-none focus:outline-none focus:border-[#FFA500] focus:ring-1 focus:ring-[#FFA500] placeholder:text-gray-600 font-mono"
                                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                            />
                            {renderTestResult()}
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                    <button
                        onClick={handleCancel}
                        className="px-5 py-2 text-sm font-medium text-gray-400 hover:text-white border border-border rounded-lg hover:bg-card transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!canSave}
                        className={`
                            px-5 py-2 text-sm font-medium rounded-lg transition-all
                            ${canSave
                                ? 'bg-[#FFA500] text-black hover:bg-[#E69500] shadow-[0_0_15px_rgba(255,165,0,0.25)] cursor-pointer'
                                : 'bg-[#FFA500]/20 text-[#FFA500]/40 cursor-not-allowed'
                            }
                        `}
                    >
                        Add Rule
                    </button>
                </div>
            </div>
        </div>
    );
}
