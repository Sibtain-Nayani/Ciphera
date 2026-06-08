/**
 * Ciphera — lib/api.ts
 * ====================
 * Single source of truth for the backend API URL.
 *
 * In development:  reads NEXT_PUBLIC_API_URL from .env.local
 *                  falls back to http://127.0.0.1:8000
 * In production:   reads NEXT_PUBLIC_API_URL baked in at Docker build time
 *
 * Usage — replace every hardcoded fetch('http://127.0.0.1:8000/...') with:
 *   import { api } from '@/lib/api';
 *   fetch(api('/api/v3/analyze'), { ... })
 *
 * Or use the pre-built helpers:
 *   import { apiFetch, apiUrl } from '@/lib/api';
 */

// The env var is baked in at build time via Next.js NEXT_PUBLIC_ convention.
// Falls back to localhost for local dev without an .env.local file.
export const API_BASE =
    (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

/**
 * Build a full API URL from a path.
 * @example api('/api/v3/analyze') → 'https://api.ciphera.in/api/v3/analyze'
 */
export function api(path: string): string {
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Authenticated fetch wrapper — auto-refreshes JWT on 401.
 * Drop-in replacement for the authFetch in lib/auth.ts but uses API_BASE.
 */
export async function apiFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    const { getAccessToken, refreshTokens } = await import('@/lib/auth');

    const token = getAccessToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };

    let res = await fetch(api(path), { ...options, headers });

    // Auto-refresh on 401
    if (res.status === 401) {
        const ok = await refreshTokens();
        if (ok) {
            const newToken = getAccessToken();
            res = await fetch(api(path), {
                ...options,
                headers: { ...headers, Authorization: `Bearer ${newToken}` },
            });
        }
    }

    return res;
}

/**
 * Plain unauthenticated fetch — for public endpoints (health, detect-language, etc.)
 */
export async function publicFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    return fetch(api(path), {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
    });
}