"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useEffect, useRef, useState } from "react";

// ── Global custom cursor ──────────────────────────────────────────────────────
// Renders on ALL pages — landing + app pages
// Dot: sharp, instant, #F5C400, mixBlendMode difference
// Ring: hollow square, lags 12% per frame for smooth elastic follow
function GlobalCursor() {
    const dotRef  = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const posRef  = useRef({ x: -200, y: -200 });
    const ringPos = useRef({ x: -200, y: -200 });
    const rafRef  = useRef<number>(0);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            posRef.current = { x: e.clientX, y: e.clientY };
            if (!visible) setVisible(true);
            // Dot is instant — no lag
            if (dotRef.current) {
                dotRef.current.style.left = `${e.clientX - 4}px`;
                dotRef.current.style.top  = `${e.clientY - 4}px`;
            }
        };

        const animate = () => {
            // Ring elastic follow
            ringPos.current.x += (posRef.current.x - ringPos.current.x) * 0.10;
            ringPos.current.y += (posRef.current.y - ringPos.current.y) * 0.10;
            if (ringRef.current) {
                ringRef.current.style.left = `${ringPos.current.x - 16}px`;
                ringRef.current.style.top  = `${ringPos.current.y - 16}px`;
            }
            rafRef.current = requestAnimationFrame(animate);
        };

        const onLeave = () => setVisible(false);
        const onEnter = () => setVisible(true);

        window.addEventListener('mousemove', onMove, { passive: true });
        document.addEventListener('mouseleave', onLeave);
        document.addEventListener('mouseenter', onEnter);
        rafRef.current = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseleave', onLeave);
            document.removeEventListener('mouseenter', onEnter);
            cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return (
        <>
            {/* Dot — 8px square, #F5C400, instant */}
            <div
                ref={dotRef}
                style={{
                    position:      'fixed',
                    width:         '8px',
                    height:        '8px',
                    background:    '#F5C400',
                    pointerEvents: 'none',
                    zIndex:        99999,
                    opacity:       visible ? 1 : 0,
                    transition:    'opacity 0.15s ease',
                    mixBlendMode:  'difference',
                    top:           '-200px',
                    left:          '-200px',
                }}
            />
            {/* Ring — 32px hollow square, lags behind */}
            <div
                ref={ringRef}
                style={{
                    position:      'fixed',
                    width:         '32px',
                    height:        '32px',
                    border:        '1px solid rgba(245,196,0,0.45)',
                    pointerEvents: 'none',
                    zIndex:        99998,
                    opacity:       visible ? 1 : 0,
                    transition:    'opacity 0.15s ease',
                    top:           '-200px',
                    left:          '-200px',
                }}
            />
        </>
    );
}

// ── Client layout — sidebar + cursor ─────────────────────────────────────────
export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname  = usePathname();
    const isLanding = pathname === "/";

    return (
        <>
            <GlobalCursor />
            <div className="flex h-screen overflow-hidden">
                {!isLanding && <AppSidebar />}
                <main className="flex-1 overflow-y-auto min-w-0">
                    {children}
                </main>
            </div>
        </>
    );
}