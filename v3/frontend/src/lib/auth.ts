/**
 * Ciphera — lib/auth.ts  (v2)
 * ============================
 * Changes:
 *   - loginApi / registerApi now set ciphera_authed cookie with max-age=604800
 *     (7 days) so the session survives tab/browser close.
 *   - clearTokens() clears both ciphera_authed and ciphera_guest cookies.
 *   - setGuestCookie() helper for guest mode.
 *   - All backend calls use NEXT_PUBLIC_API_URL env var (no more hardcoded URL).
 */

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

// All API clients share this promise so simultaneous 401 responses rotate a
// refresh credential once instead of racing one another.
let refreshInFlight: Promise<boolean> | null = null;

// 7 days in seconds
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const KEYS = {
    access:  'ciphera_access_token',
    refresh: 'ciphera_refresh_token',
    user:    'ciphera_user',
} as const;

export interface CipheraUser {
    user_id:    string;
    email:      string;
    full_name:  string;
    plan:       string;
    org_id?:    string | null;
    role?:      string;
    created_at?: string;
    is_guest?:  boolean;
}

export interface AuthTokens {
    access_token:  string;
    refresh_token: string;
    token_type:    string;
    expires_in:    number;
    user:          CipheraUser;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────
function setAuthCookie() {
    document.cookie = `ciphera_authed=1; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearAuthCookie() {
    document.cookie = 'ciphera_authed=; path=/; max-age=0; SameSite=Lax';
    document.cookie = 'ciphera_guest=; path=/; max-age=0; SameSite=Lax';
}

function notifyAuthExpired() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('ciphera:auth-expired'));
    }
}

export function setGuestCookie() {
    document.cookie = `ciphera_guest=1; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

// ── Storage helpers ───────────────────────────────────────────────────────────
export function saveTokens(data: AuthTokens) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(KEYS.access,  data.access_token);
    localStorage.setItem(KEYS.refresh, data.refresh_token);
    localStorage.setItem(KEYS.user,    JSON.stringify(data.user));
}

export function clearTokens() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(KEYS.access);
    localStorage.removeItem(KEYS.refresh);
    localStorage.removeItem(KEYS.user);
    clearAuthCookie();
}

export function getStoredUser(): CipheraUser | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(KEYS.user);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(KEYS.access);
}

export function getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(KEYS.refresh);
}

export function isLoggedIn(): boolean {
    return Boolean(getStoredUser() && getAccessToken());
}

// ── Guest user helpers ────────────────────────────────────────────────────────
const GUEST_USER_KEY = 'ciphera_guest_user';

export function getGuestUser(): CipheraUser | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(GUEST_USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function createGuestSession(): CipheraUser {
    const guest: CipheraUser = {
        user_id:   `guest_${Date.now()}`,
        email:     'guest@ciphera.local',
        full_name: 'Guest',
        plan:      'guest',
        is_guest:  true,
    };
    if (typeof window !== 'undefined') {
        localStorage.setItem(GUEST_USER_KEY, JSON.stringify(guest));
    }
    setGuestCookie();
    return guest;
}

export function clearGuestSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(GUEST_USER_KEY);
    document.cookie = 'ciphera_guest=; path=/; max-age=0; SameSite=Lax';
}

// ── API calls ─────────────────────────────────────────────────────────────────
export async function loginApi(email: string, password: string): Promise<AuthTokens> {
    const res = await fetch(`${API}/api/v3/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Login failed');
    }
    const data: AuthTokens = await res.json();
    saveTokens(data);
    // ← KEY FIX: set persistent cookie with max-age on every login
    setAuthCookie();
    // Clear any leftover guest session
    clearGuestSession();
    return data;
}

export async function registerApi(
    email: string, password: string, full_name: string
): Promise<AuthTokens> {
    const res = await fetch(`${API}/api/v3/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, full_name }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Registration failed');
    }
    const data: AuthTokens = await res.json();
    saveTokens(data);
    // ← KEY FIX: set persistent cookie on register too
    setAuthCookie();
    clearGuestSession();
    return data;
}

export async function refreshTokens(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight;

    const refresh = getRefreshToken();
    if (!refresh) {
        if (getAccessToken() || getStoredUser()) {
            clearTokens();
            notifyAuthExpired();
        }
        return false;
    }
    const userId = getStoredUser()?.user_id ?? null;

    const runRefresh = async (): Promise<boolean> => {
        // Other tabs can rotate the same localStorage token. Web Locks makes
        // them wait; after acquiring the lock, reuse the new credentials if
        // the same user already completed the rotation.
        const latestRefresh = getRefreshToken();
        if (latestRefresh !== refresh) {
            return Boolean(
                getAccessToken() && userId && getStoredUser()?.user_id === userId
            );
        }

        try {
            const res = await fetch(`${API}/api/v3/auth/refresh`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ refresh_token: refresh }),
            });
            if (!res.ok) {
                // A different account may have logged in while this request was
                // in flight; never clear that newer account's credentials.
                if (getRefreshToken() === refresh) {
                    clearTokens();
                    notifyAuthExpired();
                }
                return false;
            }

            const data: AuthTokens = await res.json();
            if (getRefreshToken() !== refresh) return false;
            saveTokens(data);
            setAuthCookie();
            return true;
        } catch {
            if (getRefreshToken() === refresh) {
                clearTokens();
                notifyAuthExpired();
            }
            return false;
        }
    };

    const operation: Promise<boolean> = (async () => {
        if (typeof navigator !== 'undefined' && navigator.locks) {
            return navigator.locks.request('ciphera-auth-refresh', runRefresh);
        }
        return runRefresh();
    })();

    refreshInFlight = operation;
    try {
        return await operation;
    } finally {
        if (refreshInFlight === operation) refreshInFlight = null;
    }
}

export async function logoutApi(): Promise<void> {
    const refresh = getRefreshToken();
    const access  = getAccessToken();
    if (refresh && access) {
        await fetch(`${API}/api/v3/auth/logout`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
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
    const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
    const apiOrigin = new URL(API).origin;
    const requestOrigin = new URL(fullUrl, API).origin;
    const userId = getStoredUser()?.user_id ?? null;
    const send = () => {
        const headers = new Headers(options.headers);
        const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
        if (!headers.has('Content-Type') && !isFormData) {
            headers.set('Content-Type', 'application/json');
        }
        const token = requestOrigin === apiOrigin ? getAccessToken() : null;
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return fetch(fullUrl, { ...options, headers });
    };

    let res = await send();

    if (res.status === 401 && requestOrigin === apiOrigin) {
        // Never retry a request made for one account with another account's token.
        if (!userId || getStoredUser()?.user_id !== userId) return res;
        const ok = await refreshTokens();
        if (ok && getStoredUser()?.user_id === userId) {
            res = await send();
        }
    }
    return res;
}
