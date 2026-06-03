import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/dashboard", "/redact", "/batch", "/settings", "/account"];
const AUTH_ONLY = ["/login", "/register"]; // redirect away if already logged in

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const accessToken  = request.cookies.get("ciphera_access")?.value
                      || request.headers.get("x-ciphera-token");

    // Check localStorage-based auth via a cookie we set on login
    const authCookie = request.cookies.get("ciphera_authed")?.value;
    const isAuthed   = Boolean(authCookie);

    const isProtected = PROTECTED.some(p => pathname.startsWith(p));
    const isAuthOnly  = AUTH_ONLY.some(p => pathname.startsWith(p));

    if (isProtected && !isAuthed) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("from", pathname);
        return NextResponse.redirect(url);
    }

    if (isAuthOnly && isAuthed) {
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
