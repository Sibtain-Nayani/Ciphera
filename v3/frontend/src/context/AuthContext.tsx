"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
    CipheraUser, getStoredUser, isLoggedIn,
    loginApi, registerApi, logoutApi, refreshTokens,
    getGuestUser, createGuestSession, clearGuestSession,
} from "@/lib/auth";
import { useSessionStore } from "@/store/sessionStore";

interface AuthContextValue {
    user:          CipheraUser | null;
    loading:       boolean;
    isGuest:       boolean;
    login:         (email: string, password: string) => Promise<void>;
    register:      (email: string, password: string, fullName: string) => Promise<void>;
    logout:        () => Promise<void>;
    loginAsGuest:  () => void;
    refresh:       () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user,    setUser]    = useState<CipheraUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [isGuest, setIsGuest] = useState(false);

    // ── On mount — restore session ──────────────────────────────────────────
    useEffect(() => {
        const stored = getStoredUser();
        if (stored) {
            setUser(stored);
            setIsGuest(false);
            // Initialise session store for this user (loads their persisted counts)
            useSessionStore.getState().initForUser(stored.user_id);
            // Silently refresh token in background
            refreshTokens().then(ok => {
                if (!ok) { setUser(null); }
                else {
                    const updated = getStoredUser();
                    if (updated) setUser(updated);
                }
            });
        } else {
            // Check for guest session
            const guest = getGuestUser();
            if (guest) {
                setUser(guest);
                setIsGuest(true);
                useSessionStore.getState().initForUser(guest.user_id);
            }
        }
        setLoading(false);
    }, []);

    // ── Login ─────────────────────────────────────────────────────────────────
    const login = useCallback(async (email: string, password: string) => {
        // If switching from a different account, wipe the old session store first
        const prevUser = getStoredUser();
        const data     = await loginApi(email, password);

        // If the account changed, reset the old session data
        if (prevUser && prevUser.user_id !== data.user.user_id) {
            useSessionStore.getState().resetForUser();
        }

        // Clear any guest session
        clearGuestSession();
        setIsGuest(false);

        // Load this user's session data (starts at 0 if new, restores if returning)
        useSessionStore.getState().initForUser(data.user.user_id);

        setUser(data.user);
    }, []);

    // ── Register ──────────────────────────────────────────────────────────────
    const register = useCallback(async (email: string, password: string, fullName: string) => {
        const data = await registerApi(email, password, fullName);

        // New account — always starts at 0
        useSessionStore.getState().resetForUser();
        useSessionStore.getState().initForUser(data.user.user_id);

        clearGuestSession();
        setIsGuest(false);
        setUser(data.user);
    }, []);

    // ── Logout ────────────────────────────────────────────────────────────────
    const logout = useCallback(async () => {
        // Don't wipe their data on logout — they might log back in.
        // Just clear auth tokens and cookie.
        await logoutApi();
        clearGuestSession();
        // Reset in-memory state to 0 so the UI doesn't show stale data
        // but the persisted localStorage key stays intact for next login.
        useSessionStore.getState().clearSession();
        setIsGuest(false);
        setUser(null);
    }, []);

    // ── Guest login ───────────────────────────────────────────────────────────
    const loginAsGuest = useCallback(() => {
        const guest = createGuestSession();
        // Guest gets a fresh isolated session
        useSessionStore.getState().initForUser(guest.user_id);
        setIsGuest(true);
        setUser(guest);
    }, []);

    // ── Token refresh ─────────────────────────────────────────────────────────
    const refresh = useCallback(async () => {
        const ok = await refreshTokens();
        if (ok) {
            const updated = getStoredUser();
            if (updated) setUser(updated);
        } else {
            setUser(null);
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, isGuest, login, register, logout, loginAsGuest, refresh }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}