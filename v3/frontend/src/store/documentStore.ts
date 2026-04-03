import { create } from 'zustand';

/* ── Built-in rule types ── */
export type RuleType = 'email' | 'phone' | 'creditCard' | 'ssn' | 'names';
export type RedactionAction = 'mask' | 'blackout' | 'replace';

export interface RuleConfig {
    isActive: boolean;
    action: RedactionAction;
}

/* ── Custom regex rule ── */
export const PRESET_COLORS = [
    '#3B82F6', // blue
    '#10B981', // emerald
    '#8B5CF6', // violet
    '#F43F5E', // rose
    '#F59E0B', // amber
    '#06B6D4', // cyan
    '#EC4899', // pink
    '#6366F1', // indigo
] as const;

export type PresetColor = (typeof PRESET_COLORS)[number];

export interface CustomRule {
    id: string;
    label: string;
    pattern: string;
    action: RedactionAction;
    isActive: boolean;
    color: PresetColor;
}

export const MAX_CUSTOM_RULES = 20;

/* ── State shape ── */
export interface DocumentState {
    rawText: string;
    previewMode: 'original' | 'redacted';
    rules: Record<RuleType, RuleConfig>;
    customRules: CustomRule[];

    // File Metadata for multi-format support
    fileName: string;
    fileType: 'txt' | 'csv' | 'json' | 'md' | 'docx' | 'pdf' | 'image';
    originalFile: File | null;

    // Built-in rule actions
    setRawText: (text: string) => void;
    setFileMetadata: (name: string, type: DocumentState['fileType'], file?: File) => void;
    setPreviewMode: (mode: 'original' | 'redacted') => void;
    toggleRule: (rule: RuleType) => void;
    setRuleAction: (rule: RuleType, action: RedactionAction) => void;
    
    // Secure Wipe
    clearWorkspace: () => void;

    // Custom rule actions
    addCustomRule: (rule: Omit<CustomRule, 'id'>) => void;
    updateCustomRule: (id: string, updates: Partial<Omit<CustomRule, 'id'>>) => void;
    removeCustomRule: (id: string) => void;
    toggleCustomRule: (id: string) => void;
}

/* ── LocalStorage helpers ── */
const STORAGE_KEY = 'ciphera_custom_rules';

function loadCustomRules(): CustomRule[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveCustomRules(rules: CustomRule[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch {
        /* quota exceeded — silently fail */
    }
}

/* ── Default dummy text ── */
const DEFAULT_DUMMY_TEXT = `[SYSTEM LOG: INITIALIZING DATA PARSER...]
[TIMESTAMP: 2026-02-25T09:30:14Z]
BEGIN RECORD BATCH:

Employee_ID, First_Name, Last_Name, Email, Phone, Department, Salary, CC_OnFile
EMP-001, Sarah, Jenkins, s.jenkins@corp-domain.com, 555-0198-442, Engineering, $145,000, 4532-1111-2222-8912
EMP-002, Marcus, Chen, m.chen@corp-domain.com, 555-0122-991, Marketing, $92,500, 3782-3333-4444-1004
EMP-003, Elena, Rodriguez, e.rodriguez@corp-domain.com, 555-0177-334, Legal, $178,000, 5103-5555-6666-6671

[END OF BATCH PREVIEW]
[AWAITING REDACTION CONFIRMATION...]`;

/* ── Store ── */
export const useDocumentStore = create<DocumentState>((set, get) => ({
    rawText: DEFAULT_DUMMY_TEXT,
    fileName: 'Workspace.txt',
    fileType: 'txt',
    originalFile: null,
    previewMode: 'original',
    rules: {
        email: { isActive: true, action: 'replace' },
        phone: { isActive: true, action: 'replace' },
        creditCard: { isActive: true, action: 'replace' },
        ssn: { isActive: false, action: 'replace' },
        names: { isActive: false, action: 'replace' },
    },
    customRules: loadCustomRules(),

    setRawText: (text) => set({ rawText: text }),
    setFileMetadata: (name, type, file) => set({ fileName: name, fileType: type, originalFile: file || null }),
    setPreviewMode: (mode) => set({ previewMode: mode }),
    
    clearWorkspace: () => set({
        rawText: '',
        fileName: 'Workspace.txt',
        fileType: 'txt',
        originalFile: null,
        previewMode: 'original'
    }),

    toggleRule: (rule) => set((state) => ({
        rules: {
            ...state.rules,
            [rule]: { ...state.rules[rule], isActive: !state.rules[rule].isActive }
        }
    })),

    setRuleAction: (rule, action) => set((state) => ({
        rules: {
            ...state.rules,
            [rule]: { ...state.rules[rule], action }
        }
    })),

    /* ── Custom rule CRUD ── */
    addCustomRule: (rule) => set((state) => {
        if (state.customRules.length >= MAX_CUSTOM_RULES) return state;
        const newRule: CustomRule = { ...rule, id: crypto.randomUUID() };
        const updated = [...state.customRules, newRule];
        saveCustomRules(updated);
        return { customRules: updated };
    }),

    updateCustomRule: (id, updates) => set((state) => {
        const updated = state.customRules.map((r) =>
            r.id === id ? { ...r, ...updates } : r
        );
        saveCustomRules(updated);
        return { customRules: updated };
    }),

    removeCustomRule: (id) => set((state) => {
        const updated = state.customRules.filter((r) => r.id !== id);
        saveCustomRules(updated);
        return { customRules: updated };
    }),

    toggleCustomRule: (id) => set((state) => {
        const updated = state.customRules.map((r) =>
            r.id === id ? { ...r, isActive: !r.isActive } : r
        );
        saveCustomRules(updated);
        return { customRules: updated };
    }),
}));
