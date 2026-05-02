"use client";

/**
 * TemplateSelector.tsx
 * =====================
 * Dropdown component that lets the user pick a redaction template.
 * Applies the template's rule configuration to the document store immediately.
 * Also lets users save the current configuration as a new template.
 *
 * Place at: v3/frontend/src/components/redact/TemplateSelector.tsx
 *
 * Add to redact/page.tsx sidebar, just above the rule groups:
 *   import { TemplateSelector } from '@/components/redact/TemplateSelector';
 *   // inside configPanelContent, before the RULE_GROUPS.map(...):
 *   <TemplateSelector />
 */

import React, { useState } from 'react';
import { Layers, ChevronDown, Plus, Trash2, Check, Save } from 'lucide-react';
import { useDocumentStore, RuleType } from '@/store/documentStore';
import { useTemplateStore, RedactionTemplate } from '@/store/templateStore';

export const TemplateSelector: React.FC = () => {
    const { rules, toggleRule, setRuleAction } = useDocumentStore();
    const { getAllTemplates, saveTemplate, deleteTemplate, userTemplates } = useTemplateStore();

    const [isOpen,        setIsOpen]        = useState(false);
    const [appliedId,     setAppliedId]     = useState<string | null>(null);
    const [showSaveForm,  setShowSaveForm]  = useState(false);
    const [saveName,      setSaveName]      = useState('');
    const [saveDesc,      setSaveDesc]      = useState('');
    const [saveIcon,      setSaveIcon]      = useState('📄');

    const allTemplates = getAllTemplates();

    const ICONS = ['📄', '🪪', '🏥', '💳', '👤', '⚖️', '🔒', '🛡️', '📋', '🗂️'];

    const applyTemplate = (template: RedactionTemplate) => {
        // Apply each rule from the template to the store
        const templateRules = template.rules;
        const currentRules  = useDocumentStore.getState().rules;

        (Object.keys(templateRules) as RuleType[]).forEach(ruleId => {
            const templateRule = templateRules[ruleId];
            const currentRule  = currentRules[ruleId];

            // Toggle if active state differs
            if (templateRule.isActive !== currentRule.isActive) {
                toggleRule(ruleId);
            }
            // Set action
            if (templateRule.action !== currentRule.action) {
                setRuleAction(ruleId, templateRule.action);
            }
        });

        setAppliedId(template.id);
        setIsOpen(false);
    };

    const handleSave = () => {
        if (!saveName.trim()) return;
        saveTemplate(saveName.trim(), saveDesc.trim(), saveIcon, rules);
        setSaveName(''); setSaveDesc(''); setSaveIcon('📄');
        setShowSaveForm(false);
    };

    const appliedTemplate = allTemplates.find(t => t.id === appliedId);

    return (
        <div className="mb-2">
            {/* Trigger button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#2A2A2A] bg-[#181818] hover:bg-[#1E1E1E] transition-colors cursor-pointer group"
            >
                <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-[#FFA500]/10 border border-[#FFA500]/20">
                        <Layers className="w-3.5 h-3.5 text-[#FFA500]" />
                    </div>
                    <div className="text-left">
                        <p className="text-xs font-semibold text-white">
                            {appliedTemplate ? appliedTemplate.name : 'Redaction Template'}
                        </p>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                            {appliedTemplate ? appliedTemplate.description.slice(0, 40) + '…' : 'Apply a preset rule configuration'}
                        </p>
                    </div>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="mt-1.5 rounded-xl border border-[#2A2A2A] bg-[#141414] overflow-hidden shadow-2xl">

                    {/* Template list */}
                    <div className="max-h-[280px] overflow-y-auto p-1.5 space-y-0.5">
                        {allTemplates.map(template => (
                            <div key={template.id}
                                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all group/item ${appliedId === template.id ? 'bg-[#FFA500]/10 border border-[#FFA500]/20' : 'hover:bg-[#1E1E1E]'}`}
                                onClick={() => applyTemplate(template)}
                            >
                                <span className="text-base shrink-0">{template.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs font-semibold text-white truncate">{template.name}</p>
                                        {template.isBuiltIn && (
                                            <span className="text-[8px] px-1 py-0.5 rounded bg-[#FFA500]/10 text-[#FFA500] border border-[#FFA500]/20 font-mono shrink-0">BUILT-IN</span>
                                        )}
                                        {appliedId === template.id && (
                                            <Check className="w-3 h-3 text-[#FFA500] shrink-0" />
                                        )}
                                    </div>
                                    <p className="text-[9px] text-gray-500 truncate mt-0.5">{template.description}</p>
                                </div>

                                {/* Delete button for user templates */}
                                {!template.isBuiltIn && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteTemplate(template.id); if (appliedId === template.id) setAppliedId(null); }}
                                        className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-all rounded cursor-pointer shrink-0"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Save current as template */}
                    <div className="border-t border-[#2A2A2A] p-2">
                        {showSaveForm ? (
                            <div className="space-y-2 p-1">
                                {/* Icon picker */}
                                <div className="flex gap-1.5 flex-wrap">
                                    {ICONS.map(icon => (
                                        <button key={icon} onClick={() => setSaveIcon(icon)}
                                            className={`w-7 h-7 rounded-lg text-base flex items-center justify-center transition-all cursor-pointer ${saveIcon === icon ? 'bg-[#FFA500]/20 ring-1 ring-[#FFA500]' : 'hover:bg-[#2A2A2A]'}`}>
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text" placeholder="Template name" value={saveName}
                                    onChange={e => setSaveName(e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] text-xs text-white rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none"
                                />
                                <input
                                    type="text" placeholder="Short description (optional)" value={saveDesc}
                                    onChange={e => setSaveDesc(e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] text-xs text-white rounded-lg placeholder:text-gray-600 focus:border-[#FFA500]/50 focus:outline-none"
                                />
                                <div className="flex gap-2">
                                    <button onClick={handleSave} disabled={!saveName.trim()}
                                        className="flex-1 py-1.5 bg-[#FFA500] text-black text-xs font-semibold rounded-lg disabled:opacity-40 cursor-pointer hover:bg-[#ffb733] transition-colors">
                                        Save Template
                                    </button>
                                    <button onClick={() => setShowSaveForm(false)}
                                        className="px-3 py-1.5 bg-[#2A2A2A] text-gray-400 text-xs rounded-lg cursor-pointer hover:text-white transition-colors">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setShowSaveForm(true)}
                                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-white hover:bg-[#1E1E1E] rounded-lg transition-colors cursor-pointer">
                                <Save className="w-3 h-3" />
                                Save current config as template
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};