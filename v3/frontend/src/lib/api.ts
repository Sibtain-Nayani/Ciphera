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

import { authFetch } from '@/lib/auth';

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
 * Authenticated fetch wrapper. Refresh and retry behavior lives in auth.ts.
 */
export async function apiFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    return authFetch(api(path), options);
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
