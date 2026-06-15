"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Loader2, AlertCircle } from "lucide-react";
import { saveTokens, clearGuestSession } from "@/lib/auth";
import { useSessionStore } from "@/store/sessionStore";

/**
 * /auth/callback
 * Google OAuth redirects here after login.
 * Reads tokens from URL fragment (#access_token=...&refresh_token=...)
 * Saves them, sets 7-day auth cookie, inits session store, redirects to dashboard.
 * Fragment is never sent to the server — tokens stay client-side only.
 *
 * Changes over v1:
 *   - Cookie max-age corrected to 604800 (7 days) matching loginApi()
 *   - Calls useSessionStore.initForUser() so Google OAuth users get
 *     their own namespaced session counts (same as email login)
 *   - Calls clearGuestSession() to clean up any existing guest cookie
 */
export default function AuthCallbackPage() {
    const router = useRouter();
    const [error, setError] = useState("");

    useEffect(() => {
        const fragment = window.location.hash.slice(1);
        if (!fragment) {
            setError("No authentication data received.");
            return;
        }

        const params        = new URLSearchParams(fragment);
        const access_token  = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const user_id       = params.get("user_id");
        const email         = params.get("email");
        const full_name     = params.get("full_name");
        const plan          = params.get("plan") || "free";

        if (!access_token || !refresh_token || !email) {
            setError("Incomplete authentication data. Please try again.");
            return;
        }

        const user = {
            user_id:   user_id || "",
            email:     decodeURIComponent(email),
            full_name: decodeURIComponent(full_name || email.split("@")[0]),
            plan,
        };

        // Save tokens — same format as password login
        saveTokens({ access_token, refresh_token, token_type: "bearer", expires_in: 900, user });

        // 7-day cookie — matches loginApi() in lib/auth.ts
        document.cookie = "ciphera_authed=1; path=/; max-age=604800; SameSite=Lax";

        // Clear any leftover guest session
        clearGuestSession();

        // Init session store for this user so counts are namespaced correctly
        // (new Google user = starts at 0, returning user = restores their counts)
        useSessionStore.getState().initForUser(user.user_id);

        // Clear fragment from URL (security — don't leave tokens in browser history)
        window.history.replaceState(null, "", window.location.pathname);

        router.replace("/dashboard");
    }, []);

    return (
        <div style={{
            minHeight: "100vh", background: "#080808",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: "20px", cursor: "none",
        }}>
            <div style={{ background: "#F5C400", padding: "10px", display: "flex" }}>
                <Shield style={{ width: 20, height: 20, color: "#080808" }} />
            </div>

            {error ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", background: "rgba(185,28,28,0.1)", border: "1px solid rgba(185,28,28,0.3)" }}>
                        <AlertCircle style={{ width: 14, height: 14, color: "#B91C1C" }} />
                        <span style={{ fontFamily: "Barlow, sans-serif", fontSize: "13px", color: "#fca5a5" }}>{error}</span>
                    </div>
                    <button onClick={() => router.replace("/login")}
                        style={{ background: "#F5C400", color: "#080808", border: "none", padding: "10px 24px", fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}>
                        Back to Login →
                    </button>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    <Loader2 style={{ width: 20, height: 20, color: "#F5C400", animation: "spin 1s linear infinite" }} />
                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)" }}>
                        Authenticating…
                    </span>
                </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}