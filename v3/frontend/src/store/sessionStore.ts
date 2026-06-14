/**
 * Ciphera — store/sessionStore.ts  (v2)
 * =======================================
 * Changes:
 *   - Store key is now namespaced by user_id so each account starts at 0.
 *   - initForUser(userId) called on login — switches the persisted store to
 *     that user's namespace. New user = fresh 0 counts. Returning user =
 *     their previous session data.
 *   - clearSession() resets counts to 0 but keeps the namespace (called on
 *     explicit "clear" actions).
 *   - resetForUser() wipes the namespace entirely (called on logout so the
 *     next login always starts clean for a new user).
 */

import { create, StoreApi, UseBoundStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuditLogEntry {
    id:                 string;
    name:               string;
    size:               string;
    date:               string;
    status:             'Completed' | 'Processing' | 'Failed';
    entitiesDiscovered: number;
    rulesApplied:       string[];
}

interface SessionState {
    auditLogs:             AuditLogEntry[];
    totalDocumentsSecured: number;
    totalEntitiesMasked:   number;
    _userId:               string;   // tracks which user owns this data

    addAuditLog:         (entry: AuditLogEntry) => void;
    updateAuditLogStatus:(id: string, status: AuditLogEntry['status'], extra?: Partial<AuditLogEntry>) => void;
    incrementMetrics:    (docs: number, entities: number) => void;
    clearSession:        () => void;

    /**
     * Call on login. Switches the zustand-persist storage key to
     * `ciphera-session-{userId}` so each account has its own isolated counts.
     * If it's a new user, localStorage has no data for that key → starts at 0.
     * If it's a returning user, their previous data is restored.
     */
    initForUser: (userId: string) => void;

    /**
     * Call on logout. Clears in-memory state and removes the persisted data
     * for the current user so the next login starts fresh.
     */
    resetForUser: () => void;
}

// Base state used for resets
const EMPTY_STATE = {
    auditLogs:             [] as AuditLogEntry[],
    totalDocumentsSecured: 0,
    totalEntitiesMasked:   0,
    _userId:               '',
};

export const useSessionStore: UseBoundStore<StoreApi<SessionState>> = create<SessionState>()(
    persist(
        (set, get) => ({
            ...EMPTY_STATE,

            addAuditLog: (entry) =>
                set((state) => ({
                    auditLogs: [entry, ...state.auditLogs].slice(0, 50),
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
                    totalEntitiesMasked:   state.totalEntitiesMasked   + entities,
                })),

            clearSession: () => set({ ...EMPTY_STATE, _userId: get()._userId }),

            initForUser: (userId) => {
                if (!userId) return;

                // If same user already loaded, do nothing
                if (get()._userId === userId) return;

                // Load that user's persisted data from localStorage (if any)
                const storageKey = `ciphera-session-${userId}`;
                let restored = { ...EMPTY_STATE, _userId: userId };
                try {
                    const raw = localStorage.getItem(storageKey);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        restored = {
                            auditLogs:             parsed.state?.auditLogs             ?? [],
                            totalDocumentsSecured: parsed.state?.totalDocumentsSecured ?? 0,
                            totalEntitiesMasked:   parsed.state?.totalEntitiesMasked   ?? 0,
                            _userId:               userId,
                        };
                    }
                } catch { /* fresh start */ }

                set(restored);

                // Rebind the persist middleware to the new storage key
                // by updating the storage name in the persist options.
                // Zustand v4 exposes this via persist.setOptions (undocumented)
                // so we just write directly to localStorage on each change.
                // The manual approach below is simpler and fully compatible.
            },

            resetForUser: () => {
                const userId = get()._userId;
                if (userId) {
                    try { localStorage.removeItem(`ciphera-session-${userId}`); } catch {}
                }
                set({ ...EMPTY_STATE });
            },
        }),
        {
            name:    'ciphera-session-default', // fallback for guests
            storage: createJSONStorage(() => ({
                // Custom storage that writes to the user-namespaced key
                getItem: (name: string) => {
                    // name is the persist key — we override based on current _userId
                    try {
                        const storeState = useSessionStore.getState();
                        const userId     = storeState._userId;
                        const key        = userId ? `ciphera-session-${userId}` : name;
                        return localStorage.getItem(key);
                    } catch { return null; }
                },
                setItem: (name: string, value: string) => {
                    try {
                        const storeState = useSessionStore.getState();
                        const userId     = storeState._userId;
                        const key        = userId ? `ciphera-session-${userId}` : name;
                        localStorage.setItem(key, value);
                    } catch {}
                },
                removeItem: (name: string) => {
                    try {
                        const storeState = useSessionStore.getState();
                        const userId     = storeState._userId;
                        const key        = userId ? `ciphera-session-${userId}` : name;
                        localStorage.removeItem(key);
                    } catch {}
                },
            })),
        }
    )
);