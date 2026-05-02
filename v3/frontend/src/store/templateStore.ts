/**
 * templateStore.ts
 * =================
 * Manages named redaction presets (templates).
 * Each template saves the full rules configuration + a name + description.
 *
 * Place at: v3/frontend/src/store/templateStore.ts
 *
 * Built-in templates ship with the product.
 * User templates persist to localStorage via zustand persist.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RuleType, RuleConfig, RedactionAction } from './documentStore';

export interface RedactionTemplate {
    id:          string;
    name:        string;
    description: string;
    icon:        string;           // emoji
    isBuiltIn:   boolean;
    rules:       Record<RuleType, RuleConfig>;
    createdAt:   string;
}

// ── Built-in templates ────────────────────────────────────────────────────────

const replace = (isActive: boolean): RuleConfig => ({ isActive, action: 'replace' });
const blackout = (isActive: boolean): RuleConfig => ({ isActive, action: 'blackout' });

const BASE_RULES: Record<RuleType, RuleConfig> = {
    email:      replace(false), phone:      replace(false),
    creditCard: replace(false), ssn:        replace(false),
    names:      replace(false), dob:        replace(false),
    date:       replace(false), url:        replace(false),
    ip:         replace(false), aadhaar:    replace(false),
    pan:        replace(false), gst:        replace(false),
    ifsc:       replace(false), voterId:    replace(false),
    passport:   replace(false), vehicleReg: replace(false),
};

export const BUILT_IN_TEMPLATES: RedactionTemplate[] = [
    {
        id: 'builtin_kyc', name: 'KYC Document', description: 'Full redaction for Know Your Customer forms — Aadhaar, PAN, DOB, phone, address.',
        icon: '🪪', isBuiltIn: true, createdAt: '',
        rules: { ...BASE_RULES, names: replace(true), email: replace(true), phone: replace(true), dob: blackout(true), aadhaar: blackout(true), pan: blackout(true), voterId: replace(true), passport: replace(true) },
    },
    {
        id: 'builtin_medical', name: 'Medical Record', description: 'Patient identity, DOB, contact, and any ID numbers.',
        icon: '🏥', isBuiltIn: true, createdAt: '',
        rules: { ...BASE_RULES, names: blackout(true), email: replace(true), phone: replace(true), dob: blackout(true), aadhaar: blackout(true), pan: replace(true) },
    },
    {
        id: 'builtin_financial', name: 'Financial Statement', description: 'Bank details, credit cards, IFSC, PAN, GST for invoice/statement sharing.',
        icon: '💳', isBuiltIn: true, createdAt: '',
        rules: { ...BASE_RULES, names: replace(true), creditCard: blackout(true), ssn: blackout(true), pan: blackout(true), gst: replace(true), ifsc: blackout(true), aadhaar: blackout(true) },
    },
    {
        id: 'builtin_hr', name: 'HR / Resume', description: 'Personal contact info only — preserves skills, education, and work history.',
        icon: '👤', isBuiltIn: true, createdAt: '',
        rules: { ...BASE_RULES, names: replace(true), email: replace(true), phone: replace(true), dob: replace(true), aadhaar: replace(true), pan: replace(true) },
    },
    {
        id: 'builtin_legal', name: 'Legal Document', description: 'Party names, IDs, and contact info for contract sharing.',
        icon: '⚖️', isBuiltIn: true, createdAt: '',
        rules: { ...BASE_RULES, names: blackout(true), email: replace(true), phone: replace(true), aadhaar: blackout(true), pan: blackout(true), dob: replace(true) },
    },
    {
        id: 'builtin_minimal', name: 'Minimal (IDs Only)', description: 'Only hard identifiers — Aadhaar, PAN, credit card. Everything else passes through.',
        icon: '🔒', isBuiltIn: true, createdAt: '',
        rules: { ...BASE_RULES, aadhaar: blackout(true), pan: blackout(true), creditCard: blackout(true), ssn: blackout(true) },
    },
    {
        id: 'builtin_full', name: 'Maximum Redaction', description: 'All entity types enabled with blackout. Use before public disclosure.',
        icon: '🛡️', isBuiltIn: true, createdAt: '',
        rules: Object.fromEntries(
            Object.keys(BASE_RULES).map(k => [k, blackout(true)])
        ) as Record<RuleType, RuleConfig>,
    },
];

// ── Store ─────────────────────────────────────────────────────────────────────

interface TemplateState {
    userTemplates:   RedactionTemplate[];
    saveTemplate:    (name: string, description: string, icon: string, rules: Record<RuleType, RuleConfig>) => void;
    deleteTemplate:  (id: string) => void;
    getAllTemplates:  () => RedactionTemplate[];
}

export const useTemplateStore = create<TemplateState>()(
    persist(
        (set, get) => ({
            userTemplates: [],

            saveTemplate: (name, description, icon, rules) => {
                const template: RedactionTemplate = {
                    id:        `user_${Date.now()}`,
                    name,
                    description,
                    icon,
                    isBuiltIn: false,
                    rules,
                    createdAt: new Date().toLocaleString(),
                };
                set(state => ({ userTemplates: [...state.userTemplates, template] }));
            },

            deleteTemplate: (id) => {
                set(state => ({
                    userTemplates: state.userTemplates.filter(t => t.id !== id),
                }));
            },

            getAllTemplates: () => [
                ...BUILT_IN_TEMPLATES,
                ...get().userTemplates,
            ],
        }),
        { name: 'ciphera-templates' }
    )
);