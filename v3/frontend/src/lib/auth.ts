/**
 * Ciphera — lib/auth.ts
 * =====================
 * Token storage, refresh, user helpers.
 * All tokens stored in localStorage. Access token is short-lived (15 min).
 * On expiry, refresh token is used automatically to get a new one.
 */

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const KEYS = {
    access:  "ciphera_access_token",
    refresh: "ciphera_refresh_token",
    user:    "ciphera_user",
} as const;

export interface CipheraUser {
    user_id:   string;
    email:     string;
    full_name: string;
    plan:      string;
    org_id?:   string | null;
    role?:     string;
}

export interface AuthTokens {
    access_token:  string;
    refresh_token: string;
    token_type:    string;
    expires_in:    number;
    user:          CipheraUser;
}

// ── Storage helpers ───────────────────────────────────────────────────────────
export function saveTokens(data: AuthTokens) {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEYS.access,  data.access_token);
    localStorage.setItem(KEYS.refresh, data.refresh_token);
    localStorage.setItem(KEYS.user,    JSON.stringify(data.user));
}

export function clearTokens() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEYS.access);
    localStorage.removeItem(KEYS.refresh);
    localStorage.removeItem(KEYS.user);
    document.cookie = "ciphera_authed=; path=/; max-age=0; SameSite=Lax";
}

export function getStoredUser(): CipheraUser | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(KEYS.user);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(KEYS.access);
}

export function getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(KEYS.refresh);
}

export function isLoggedIn(): boolean {
    return Boolean(getStoredUser() && getAccessToken());
}

// ── API calls ─────────────────────────────────────────────────────────────────
export async function loginApi(email: string, password: string): Promise<AuthTokens> {
    const res = await fetch(`${API}/api/v3/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Login failed");
    }
    const data: AuthTokens = await res.json();
    saveTokens(data);
    return data;
}

export async function registerApi(
    email: string, password: string, full_name: string
): Promise<AuthTokens> {
    const res = await fetch(`${API}/api/v3/auth/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password, full_name }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Registration failed");
    }
    const data: AuthTokens = await res.json();
    saveTokens(data);
    return data;
}

export async function refreshTokens(): Promise<boolean> {
    const refresh = getRefreshToken();
    if (!refresh) return false;
    try {
        const res = await fetch(`${API}/api/v3/auth/refresh`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) { clearTokens(); return false; }
        const data: AuthTokens = await res.json();
        saveTokens(data);
        document.cookie = "ciphera_authed=1; path=/; max-age=2592000; SameSite=Lax";
        return true;
    } catch { clearTokens(); return false; }
}

export async function logoutApi(): Promise<void> {
    const refresh = getRefreshToken();
    const access  = getAccessToken();
    if (refresh && access) {
        await fetch(`${API}/api/v3/auth/logout`, {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
            body:    JSON.stringify({ refresh_token: refresh }),
        }).catch(() => {});
    }
    clearTokens();
}

// ── Authenticated fetch — auto-refreshes on 401 ───────────────────────────────
export async function authFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const token = getAccessToken();
    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };

    let res = await fetch(`${API}${url}`, { ...options, headers });

    // If 401, try refreshing once
    if (res.status === 401) {
        const ok = await refreshTokens();
        if (ok) {
            const newToken = getAccessToken();
            res = await fetch(`${API}${url}`, {
                ...options,
                headers: { ...headers, Authorization: `Bearer ${newToken}` },
            });
        }
    }

    return res;
}
