"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useEffect, useRef, useState } from "react";

function KeyboardEasterEgg() {
    const [active, setActive] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'r' || e.key === 'R') {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
                setActive(true);
                setTimeout(() => setActive(false), 1200);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!active) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 999999,
            background: '#B91C1C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            mixBlendMode: 'difference',
            animation: 'redactOverlay 1.2s ease-out forwards',
        }}>
            <style>{`
                @keyframes redactOverlay {
                    0% { opacity: 0; }
                    5% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `}</style>
            <div style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 900,
                fontSize: '120px',
                color: '#080808',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                REDACTING...
            </div>
        </div>
    );
}

function GlobalCursor() {
    const cursorRef = useRef<HTMLDivElement>(null);
    const [cursorState, setCursorState] = useState<'default' | 'text' | 'button'>('default');
    const [visible, setVisible] = useState(false);

    // RAF lerp-based smooth cursor tracking
    const mousePos = useRef({ x: -200, y: -200 });
    const cursorPos = useRef({ x: -200, y: -200 });
    const trail = useRef(Array(6).fill(null).map(() => ({ x: -200, y: -200 })));
    const rafId = useRef<number>(0);

    useEffect(() => {
        const LERP_FACTOR = 0.12;

        const animate = () => {
            cursorPos.current.x += (mousePos.current.x - cursorPos.current.x) * LERP_FACTOR;
            cursorPos.current.y += (mousePos.current.y - cursorPos.current.y) * LERP_FACTOR;

            if (cursorRef.current) {
                cursorRef.current.style.transform = `translate3d(${cursorPos.current.x}px, ${cursorPos.current.y}px, 0) translate(-50%, -50%)`;
            }

            // Update lagging dots
            let prevX = cursorPos.current.x;
            let prevY = cursorPos.current.y;
            trail.current.forEach((dot, index) => {
                const delay = 0.35 - (index * 0.03); // Lag increases down the tail
                dot.x += (prevX - dot.x) * delay;
                dot.y += (prevY - dot.y) * delay;

                const element = document.getElementById(`cursor-trail-dot-${index}`);
                if (element) {
                    element.style.transform = `translate3d(${dot.x}px, ${dot.y}px, 0) translate(-50%, -50%)`;
                }
                prevX = dot.x;
                prevY = dot.y;
            });

            rafId.current = requestAnimationFrame(animate);
        };

        rafId.current = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(rafId.current);
    }, []);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!visible) setVisible(true);
            mousePos.current.x = e.clientX;
            mousePos.current.y = e.clientY;
        };

        const onMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target) return;

            const isButton = target.closest('button, a, input[type="submit"], input[type="button"], [role="button"]');
            
            const isText = !isButton && (
                target.tagName.match(/^(H[1-6]|P|SPAN|LI|CODE|LABEL|TD|TH)$/i) ||
                (target.childNodes.length > 0 && Array.from(target.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()))
            );

            if (isButton) {
                setCursorState('button');
            } else if (isText) {
                setCursorState('text');
            } else {
                setCursorState('default');
            }
        };

        const onLeave = () => setVisible(false);
        const onEnter = () => setVisible(true);

        window.addEventListener('mousemove', onMove, { passive: true });
        window.addEventListener('mouseover', onMouseOver, { passive: true });
        document.addEventListener('mouseleave', onLeave);
        document.addEventListener('mouseenter', onEnter);

        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseover', onMouseOver);
            document.removeEventListener('mouseleave', onLeave);
            document.removeEventListener('mouseenter', onEnter);
        };
    }, [visible]);

    let width = '16px';
    let height = '16px';
    let borderRadius = '50%';
    let background = 'transparent';
    let mixBlendMode: React.CSSProperties['mixBlendMode'] = 'normal';

    if (cursorState === 'text') {
        width = '80px';
        height = '12px';
        borderRadius = '0px';
    } else if (cursorState === 'button') {
        width = '16px';
        height = '16px';
        borderRadius = '50%';
        background = '#F5C400';
    }

    return (
        <>
            <div
                ref={cursorRef}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: width,
                    height: height,
                    border: '1px solid #F5C400',
                    borderRadius: borderRadius,
                    background: background,
                    pointerEvents: 'none',
                    zIndex: 99999,
                    opacity: visible ? 1 : 0,
                    transform: 'translate3d(-200px, -200px, 0) translate(-50%, -50%)',
                    transition: 'width 0.15s ease, height 0.15s ease, background 0.15s ease, border-radius 0.15s ease, opacity 0.15s ease',
                    mixBlendMode: mixBlendMode,
                }}
            />
            {trail.current.map((_, index) => {
                const size = 6 - index; // 6px to 1px
                return (
                    <div
                        key={index}
                        id={`cursor-trail-dot-${index}`}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: `${size}px`,
                            height: `${size}px`,
                            background: '#F5C400',
                            borderRadius: '50%',
                            pointerEvents: 'none',
                            zIndex: 99998,
                            opacity: visible ? 0.7 - (index * 0.08) : 0,
                            transform: 'translate3d(-200px, -200px, 0) translate(-50%, -50%)',
                            transition: 'opacity 0.15s ease',
                        }}
                    />
                );
            })}
        </>
    );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname  = usePathname();
    const isLanding = pathname === "/";
    const mainRef = useRef<HTMLDivElement>(null);
    const [scrollPercent, setScrollPercent] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            const el = mainRef.current;
            if (!el) return;
            const total = el.scrollHeight - el.clientHeight;
            if (total <= 0) {
                setScrollPercent(0);
                return;
            }
            const pct = (el.scrollTop / total) * 100;
            setScrollPercent(pct);
        };
        
        const el = mainRef.current;
        if (el) {
            el.addEventListener('scroll', handleScroll, { passive: true });
            // Initial check
            handleScroll();
        }
        
        const t = setTimeout(handleScroll, 200);

        return () => {
            if (el) el.removeEventListener('scroll', handleScroll);
            clearTimeout(t);
        };
    }, [pathname]);

    const scrollPercentFormatted = String(Math.round(scrollPercent)).padStart(3, '0') + '%';

    return (
        <>
            <GlobalCursor />
            <KeyboardEasterEgg />

            {/* Document Progress Indicator */}
            {isLanding && (
                <div style={{
                    position: 'fixed',
                    right: '12px',
                    top: '40px',
                    bottom: '40px',
                    width: '32px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    pointerEvents: 'none',
                    zIndex: 9999,
                }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#F5C400', letterSpacing: '0.18em', fontWeight: 'bold' }}>▲</span>
                    <div style={{
                        width: '2px',
                        background: 'rgba(239, 239, 239, 0.05)',
                        flexGrow: 1,
                        margin: '12px 0',
                        position: 'relative',
                        borderRadius: '1px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${scrollPercent}%`,
                            background: '#F5C400',
                            transition: 'height 0.08s ease-out',
                        }} />
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#F5C400', letterSpacing: '0.18em', fontWeight: 'bold' }}>
                        {scrollPercentFormatted}
                    </span>
                </div>
            )}

            <div className="flex h-screen overflow-hidden">
                {!isLanding && <AppSidebar />}
                <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
                    {children}
                </main>
            </div>
        </>
    );
}