import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuditLogEntry {
    id: string; // e.g. DOC-1234
    name: string;
    size: string; // e.g. "1.2 MB"
    date: string; // e.g. "2026-02-25 08:14"
    status: 'Completed' | 'Processing' | 'Failed';
    entitiesDiscovered: number;
    rulesApplied: string[];
}

interface SessionState {
    auditLogs: AuditLogEntry[];
    totalDocumentsSecured: number;
    totalEntitiesMasked: number;
    addAuditLog: (entry: AuditLogEntry) => void;
    updateAuditLogStatus: (id: string, status: AuditLogEntry['status'], extra?: Partial<AuditLogEntry>) => void;
    incrementMetrics: (docs: number, entities: number) => void;
    clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
    persist(
        (set) => ({
            auditLogs: [],
            totalDocumentsSecured: 0,
            totalEntitiesMasked: 0,

            addAuditLog: (entry) =>
                set((state) => ({
                    auditLogs: [entry, ...state.auditLogs].slice(0, 50), // keep last 50
                })),

            updateAuditLogStatus: (id, status, extra) =>
                set((state) => ({
                    auditLogs: state.auditLogs.map((log) =>
                        log.id === id ? { ...log, status, ...extra } : log
                    ),
                })),

            incrementMetrics: (docs, entities) =>
                set((state) => ({
                    totalDocumentsSecured: state.totalDocumentsSecured + docs,
                    totalEntitiesMasked: state.totalEntitiesMasked + entities,
                })),

            clearSession: () =>
                set({
                    auditLogs: [],
                    totalDocumentsSecured: 0,
                    totalEntitiesMasked: 0,
                }),
        }),
        {
            name: 'ciphera-session-storage',
        }
    )
);
