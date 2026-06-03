"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
    CipheraUser, getStoredUser, isLoggedIn,
    loginApi, registerApi, logoutApi, refreshTokens, authFetch,
} from "@/lib/auth";

interface AuthContextValue {
    user:       CipheraUser | null;
    loading:    boolean;
    login:      (email: string, password: string) => Promise<void>;
    register:   (email: string, password: string, fullName: string) => Promise<void>;
    logout:     () => Promise<void>;
    refresh:    () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user,    setUser]    = useState<CipheraUser | null>(null);
    const [loading, setLoading] = useState(true);

    // On mount — restore user from localStorage, validate token
    useEffect(() => {
        const stored = getStoredUser();
        if (stored) {
            setUser(stored);
            // Silently refresh in background to get fresh token
            refreshTokens().then(ok => {
                if (!ok) setUser(null);
                else {
                    const updated = getStoredUser();
                    if (updated) setUser(updated);
                }
            });
        }
        setLoading(false);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const data = await loginApi(email, password);
        setUser(data.user);
    }, []);

    const register = useCallback(async (email: string, password: string, fullName: string) => {
        const data = await registerApi(email, password, fullName);
        setUser(data.user);
    }, []);

    const logout = useCallback(async () => {
        await logoutApi();
        setUser(null);
    }, []);

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
        <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
