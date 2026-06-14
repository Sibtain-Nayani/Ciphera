import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/dashboard", "/redact", "/batch", "/settings", "/account"];
const AUTH_ONLY = ["/login", "/register"];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const authCookie  = request.cookies.get("ciphera_authed")?.value;
    const guestCookie = request.cookies.get("ciphera_guest")?.value;

    const isProtected = PROTECTED.some(p => pathname.startsWith(p));
    const isAuthOnly  = AUTH_ONLY.some(p => pathname.startsWith(p));

    if (isProtected) {
        // No session at all -> redirect
        if (!authCookie && !guestCookie) {
            const url = request.nextUrl.clone();
            url.pathname = "/login";
            url.searchParams.set("from", pathname);
            return NextResponse.redirect(url);
        }

        // Guest session but accessing non-guest route -> redirect
        const isGuestAllowed = ["/dashboard", "/redact"].some(p => pathname.startsWith(p));
        if (guestCookie && !authCookie && !isGuestAllowed) {
            const url = request.nextUrl.clone();
            url.pathname = "/login";
            url.searchParams.set("from", pathname);
            return NextResponse.redirect(url);
        }
    }

    // Only redirect away from login/register if REAL account (not guest)
    // — guest users might want to upgrade to a real account
    if (isAuthOnly && authCookie) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/redact/:path*",
        "/batch/:path*",
        "/settings/:path*",
        "/account/:path*",
        "/login",
        "/register",
    ],
};