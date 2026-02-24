import { create } from 'zustand';

export type RuleType = 'email' | 'phone' | 'creditCard' | 'ssn' | 'names';

interface DocumentState {
    rawText: string;
    previewMode: 'original' | 'redacted';
    rules: Record<RuleType, boolean>;

    // Actions
    setRawText: (text: string) => void;
    setPreviewMode: (mode: 'original' | 'redacted') => void;
    toggleRule: (rule: RuleType) => void;
}

const DEFAULT_DUMMY_TEXT = `[SYSTEM LOG: INITIALIZING DATA PARSER...]
[TIMESTAMP: 2026-02-25T09:30:14Z]
BEGIN RECORD BATCH:

Employee_ID, First_Name, Last_Name, Email, Phone, Department, Salary, CC_OnFile
EMP-001, Sarah, Jenkins, s.jenkins@corp-domain.com, 555-0198-442, Engineering, $145,000, 4532-1111-2222-8912
EMP-002, Marcus, Chen, m.chen@corp-domain.com, 555-0122-991, Marketing, $92,500, 3782-3333-4444-1004
EMP-003, Elena, Rodriguez, e.rodriguez@corp-domain.com, 555-0177-334, Legal, $178,000, 5103-5555-6666-6671

[END OF BATCH PREVIEW]
[AWAITING REDACTION CONFIRMATION...]`;

export const useDocumentStore = create<DocumentState>((set) => ({
    rawText: DEFAULT_DUMMY_TEXT,
    previewMode: 'redacted',
    rules: {
        email: true,
        phone: true,
        creditCard: true,
        ssn: false,
        names: false,
    },

    setRawText: (text) => set({ rawText: text }),
    setPreviewMode: (mode) => set({ previewMode: mode }),
    toggleRule: (rule) => set((state) => ({
        rules: { ...state.rules, [rule]: !state.rules[rule] }
    })),
}));
