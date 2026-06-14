"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AuthProvider } from "@/context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

// ── Keyboard easter egg (unchanged) ──────────────────────────────────────────
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
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:999999,background:'rgba(10,10,12,0.95)',backdropFilter:'blur(16px)',display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none',animation:'redactOverlay 1.2s cubic-bezier(0.16,1,0.3,1) forwards' }}>
            <style>{`@keyframes redactOverlay{0%{opacity:0;transform:scale(1.05)}10%{opacity:1;transform:scale(1)}80%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.02)}}`}</style>
            <div style={{ position:'absolute',top:0,left:0,right:0,height:'4px',background:'#4ade80',boxShadow:'0 0 20px 4px rgba(74,222,128,0.5)',animation:'scanDown 1.2s linear forwards' }} />
            <style>{`@keyframes scanDown{0%{top:0%;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}`}</style>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:'clamp(60px,8vw,120px)',color:'#fff',textTransform:'uppercase',letterSpacing:'0.15em',display:'flex',alignItems:'center',gap:'24px' }}>
                <div style={{ width:'20px',height:'20px',background:'#4ade80',borderRadius:'50%',boxShadow:'0 0 16px #4ade80',animation:'pulse 0.5s infinite alternate' }} />
                REDACTING
            </div>
            <style>{`@keyframes pulse{0%{opacity:0.5;transform:scale(0.8)}100%{opacity:1;transform:scale(1.2)}}`}</style>
        </div>
    );
}

// ── Global cursor (unchanged) ─────────────────────────────────────────────────
function GlobalCursor() {
    const cursorRef = useRef<HTMLDivElement>(null);
    const [cursorState, setCursorState] = useState<'default'|'text'|'button'>('default');
    const [visible, setVisible] = useState(false);
    const mousePos  = useRef({ x:-200, y:-200 });
    const cursorPos = useRef({ x:-200, y:-200 });
    const trail     = useRef(Array(6).fill(null).map(()=>({x:-200,y:-200})));
    const rafId     = useRef<number>(0);

    useEffect(() => {
        const animate = () => {
            cursorPos.current.x += (mousePos.current.x - cursorPos.current.x) * 0.12;
            cursorPos.current.y += (mousePos.current.y - cursorPos.current.y) * 0.12;
            if (cursorRef.current) cursorRef.current.style.transform = `translate3d(${cursorPos.current.x}px,${cursorPos.current.y}px,0) translate(-50%,-50%)`;
            let prevX=cursorPos.current.x, prevY=cursorPos.current.y;
            trail.current.forEach((dot,index)=>{
                const delay=0.35-(index*0.03);
                dot.x+=(prevX-dot.x)*delay; dot.y+=(prevY-dot.y)*delay;
                const el=document.getElementById(`cursor-trail-dot-${index}`);
                if(el) el.style.transform=`translate3d(${dot.x}px,${dot.y}px,0) translate(-50%,-50%)`;
                prevX=dot.x; prevY=dot.y;
            });
            rafId.current=requestAnimationFrame(animate);
        };
        rafId.current=requestAnimationFrame(animate);
        return()=>cancelAnimationFrame(rafId.current);
    },[]);

    useEffect(()=>{
        const onMove=(e:MouseEvent)=>{ if(!visible)setVisible(true); mousePos.current.x=e.clientX; mousePos.current.y=e.clientY; };
        const onOver=(e:MouseEvent)=>{
            const t=e.target as HTMLElement; if(!t) return;
            const isBtn=t.closest('button,a,input[type="submit"],input[type="button"],[role="button"]');
            const isText=!isBtn&&(t.tagName.match(/^(H[1-6]|P|SPAN|LI|CODE|LABEL|TD|TH)$/i)||(t.childNodes.length>0&&Array.from(t.childNodes).some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim())));
            if(isBtn) setCursorState('button'); else if(isText) setCursorState('text'); else setCursorState('default');
        };
        const onLeave=()=>setVisible(false);
        const onEnter=()=>setVisible(true);
        window.addEventListener('mousemove',onMove,{passive:true});
        window.addEventListener('mouseover',onOver,{passive:true});
        document.addEventListener('mouseleave',onLeave);
        document.addEventListener('mouseenter',onEnter);
        return()=>{ window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseover',onOver); document.removeEventListener('mouseleave',onLeave); document.removeEventListener('mouseenter',onEnter); };
    },[visible]);

    const isText=cursorState==='text', isBtn=cursorState==='button';
    return (
        <>
            <div ref={cursorRef} style={{ position:'fixed',top:0,left:0,width:isText?'80px':'16px',height:isText?'12px':'16px',border:'1px solid #F5C400',borderRadius:isText?'0':'50%',background:isBtn?'#F5C400':'transparent',pointerEvents:'none',zIndex:99999,opacity:visible?1:0,transform:'translate3d(-200px,-200px,0) translate(-50%,-50%)',transition:'width 0.15s ease,height 0.15s ease,background 0.15s ease,border-radius 0.15s ease,opacity 0.15s ease' }} />
            {trail.current.map((_,index)=>{
                const size=6-index;
                return <div key={index} id={`cursor-trail-dot-${index}`} style={{ position:'fixed',top:0,left:0,width:`${size}px`,height:`${size}px`,background:'#F5C400',borderRadius:'50%',pointerEvents:'none',zIndex:99998,opacity:visible?0.7-(index*0.08):0,transform:'translate3d(-200px,-200px,0) translate(-50%,-50%)',transition:'opacity 0.15s ease' }} />;
            })}
        </>
    );
}

// ── Root wrapper ──────────────────────────────────────────────────────────────
export function ClientLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <ClientLayoutInner>{children}</ClientLayoutInner>
        </AuthProvider>
    );
}

const PROTECTED_ROUTES = ["/dashboard", "/redact", "/batch", "/settings", "/account"];

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLanding = pathname === "/";
    const isAuth    = pathname === "/login" || pathname === "/register";
    const mainRef   = useRef<HTMLDivElement>(null);
    const [scrollPercent, setScrollPercent] = useState(0);
    const { user, loading, isGuest } = useAuth();

    // ── Client-side protection ────────────────────────────────────────────────
    // Guests are valid sessions, but they are restricted to /dashboard and /redact
    useEffect(() => {
        if (!loading) {
            const onProtected = PROTECTED_ROUTES.some(p => pathname.startsWith(p));
            if (onProtected) {
                if (!user && !isGuest) {
                    document.cookie = "ciphera_authed=; path=/; max-age=0; SameSite=Lax";
                    document.cookie = "ciphera_guest=; path=/; max-age=0; SameSite=Lax";
                    window.location.href = "/login?from=" + encodeURIComponent(pathname);
                } else if (isGuest) {
                    const isGuestAllowedRoute = ["/dashboard", "/redact"].some(p => pathname.startsWith(p));
                    if (!isGuestAllowedRoute) {
                        window.location.href = "/login?from=" + encodeURIComponent(pathname);
                    }
                }
            }
        }
    }, [user, loading, isGuest, pathname]);

    // ── Scroll progress (landing only) ────────────────────────────────────────
    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;
        const handler = () => {
            const total = el.scrollHeight - el.clientHeight;
            setScrollPercent(total > 0 ? (el.scrollTop / total) * 100 : 0);
        };
        el.addEventListener('scroll', handler, { passive: true });
        setTimeout(handler, 200);
        return () => el.removeEventListener('scroll', handler);
    }, [pathname]);

    return (
        <>
            <GlobalCursor />
            <KeyboardEasterEgg />

            {/* Scroll progress — landing only */}
            {isLanding && (
                <div style={{ position:'fixed',right:'12px',top:'40px',bottom:'40px',width:'32px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'space-between',pointerEvents:'none',zIndex:9999 }}>
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',color:'#F5C400',letterSpacing:'0.18em',fontWeight:'bold' }}>▲</span>
                    <div style={{ width:'2px',background:'rgba(239,239,239,0.05)',flexGrow:1,margin:'12px 0',position:'relative',borderRadius:'1px',overflow:'hidden' }}>
                        <div style={{ position:'absolute',top:0,left:0,width:'100%',height:`${scrollPercent}%`,background:'#F5C400',transition:'height 0.08s ease-out' }} />
                    </div>
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',color:'#F5C400',letterSpacing:'0.18em',fontWeight:'bold' }}>
                        {String(Math.round(scrollPercent)).padStart(3,'0')}%
                    </span>
                </div>
            )}

            <div className="flex h-screen overflow-hidden">
                {!isLanding && !isAuth && <AppSidebar />}
                <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
                    {children}
                </main>
            </div>
        </>
    );
}