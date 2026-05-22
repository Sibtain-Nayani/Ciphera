'use client'
import { useEffect, useState, useRef, useCallback } from 'react'

// ── Sample document lines for the live redaction demo ──
const DOC_LINES = [
  { text: 'Employee Name: ', pii: 'Priya Sharma', replacement: '[REDACTED]', type: 'NAME' },
  { text: 'Aadhaar No: ', pii: '4532 8812 9901', replacement: '[AADHAAR_1]', type: 'AADHAAR' },
  { text: 'PAN: ', pii: 'ABCPD1234E', replacement: '[PAN_1]', type: 'PAN' },
  { text: 'Email: ', pii: 'priya.s@corp.in', replacement: '[EMAIL_1]', type: 'EMAIL' },
  { text: 'Phone: ', pii: '+91 98765 43210', replacement: '[PHONE_1]', type: 'PHONE' },
  { text: 'GSTIN: ', pii: '27AADCB2230M1ZP', replacement: '[GSTIN_1]', type: 'GSTIN' },
  { text: 'Address: ', pii: '14 MG Road, Pune', replacement: '[ADDRESS_1]', type: 'ADDRESS' },
]

function RedactingLine({ line, delay, isActive }: {
  line: typeof DOC_LINES[0],
  delay: number,
  isActive: boolean
}) {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'found' | 'redacted'>('idle')

  useEffect(() => {
    if (!isActive) { setPhase('idle'); return }
    const t1 = setTimeout(() => setPhase('scanning'), delay)
    const t2 = setTimeout(() => setPhase('found'), delay + 600)
    const t3 = setTimeout(() => setPhase('redacted'), delay + 1200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [isActive, delay])

  const piiStyle: React.CSSProperties = {
    display: 'inline-block',
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    padding: '0 3px',
    borderRadius: '2px',
    position: 'relative',
    ...(phase === 'scanning' ? {
      background: 'rgba(74, 222, 128, 0.08)',
      color: 'rgba(255,255,255,0.7)',
      boxShadow: '0 0 8px rgba(74, 222, 128, 0.15)',
    } : phase === 'found' ? {
      background: 'rgba(245, 196, 0, 0.15)',
      color: '#F5C400',
      boxShadow: '0 0 12px rgba(245, 196, 0, 0.2)',
    } : phase === 'redacted' ? {
      background: 'rgba(255,255,255,0.06)',
      color: 'rgba(255,255,255,0.5)',
    } : {
      color: 'rgba(255,255,255,0.7)',
    })
  }

  const tagStyle: React.CSSProperties = {
    fontSize: '7px',
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: '0.08em',
    color: phase === 'found' ? '#F5C400' : 'rgba(255,255,255,0.25)',
    marginLeft: '6px',
    opacity: phase === 'found' || phase === 'redacted' ? 1 : 0,
    transition: 'opacity 0.3s ease',
    verticalAlign: 'middle',
  }

  return (
    <div style={{
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 'clamp(9px, 0.9vw, 13px)',
      lineHeight: 2.0,
      color: 'rgba(255,255,255,0.35)',
      display: 'flex',
      alignItems: 'center',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.2)', width: '60px', flexShrink: 0, fontSize: '0.85em' }}>{line.text}</span>
      <span style={piiStyle}>
        {phase === 'redacted' ? line.replacement : line.pii}
      </span>
      <span style={tagStyle}>
        {phase === 'found' ? `⚠ ${line.type}` : phase === 'redacted' ? `✓ ${line.type}` : ''}
      </span>
    </div>
  )
}

export default function HeroDocument({ scrollProgress }: { scrollProgress: number }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const rafRef = useRef(0)
  const posRef = useRef({ x: 0, y: 0 })
  const [redactCycle, setRedactCycle] = useState(0)
  const [isRedacting, setIsRedacting] = useState(false)

  // Smooth mouse tracking with spring-like interpolation
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      posRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      }
    }
    const tick = () => {
      setMousePos(prev => ({
        x: prev.x + (posRef.current.x - prev.x) * 0.05,
        y: prev.y + (posRef.current.y - prev.y) * 0.05,
      }))
      rafRef.current = requestAnimationFrame(tick)
    }
    window.addEventListener('mousemove', onMove)
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Cycle the redaction demo every 6 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setIsRedacting(false)
      setTimeout(() => {
        setRedactCycle(c => c + 1)
        setIsRedacting(true)
      }, 800)
    }, 7000)
    // Kick off immediately
    const init = setTimeout(() => setIsRedacting(true), 1500)
    return () => { clearInterval(interval); clearTimeout(init) }
  }, [])

  // Updated rotation: start at a fixed 15° tilt, no initial scroll‑driven change
  const startTilt = 15; // degrees, matches premium iPad angle
  const baseTiltX = startTilt; // start angle, remains constant
  // Subtle mouse parallax — cinematic feel
  const finalRotX = baseTiltX + (mousePos.y * -3);
  const finalRotY = (mousePos.x * 6);

  /* ── Entrance animation ── */
  const fadeIn = Math.min(1, scrollProgress / 0.06);
  const scale = 0.92 + (Math.min(1, scrollProgress / 0.15) * 0.08);

  return (
    <div style={{
      width: '100%', height: '100%',
      position: 'absolute', top: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      perspective: '1800px',
    }}>
      {/* Float wrapper with entrance transition */}
      <div style={{
        opacity: fadeIn,
        transform: `scale(${scale})`,
        transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        transformStyle: 'preserve-3d',
      }}>
        {/* 3D rotation wrapper */}
        <div style={{
          transform: `rotateX(${finalRotX}deg) rotateY(${finalRotY}deg)`,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          transition: 'transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          width: 'clamp(540px, 50vw, 900px)',
          aspectRatio: '1.43 / 1',
          position: 'relative'
        }}>
          {/* ═══════════ iPad Device Body ═══════════ */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(145deg, #1a1a1c 0%, #0a0a0b 100%)',
            borderRadius: 'clamp(18px, 3vw, 42px)',
            border: '1.5px solid rgba(255,255,255,0.08)',
            boxShadow:
              '0 40px 80px rgba(0,0,0,0.7), ' +
              '0 20px 40px rgba(0,0,0,0.5), ' +
              '0 2px 8px rgba(0,0,0,0.3), ' +
              'inset 0 1px 0 rgba(255,255,255,0.05), ' +
              'inset 0 0 0 10px #050506',
            transformStyle: 'preserve-3d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {/* ── Screen Content ── */}
            <div style={{
              width: 'calc(100% - 22px)',
              height: 'calc(100% - 22px)',
              background: '#000',
              borderRadius: 'clamp(14px, 2.5vw, 34px)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Premium dark ambient glow — not childish */}
              <div style={{
                position: 'absolute',
                inset: '-30%',
                background: 'radial-gradient(ellipse at 30% 20%, rgba(245,196,0,0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(74,222,128,0.03) 0%, transparent 50%)',
                pointerEvents: 'none',
              }} />

              {/* Subtle grid lines for depth */}
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                pointerEvents: 'none',
                opacity: 0.5,
              }} />

              {/* Glossy Reflection overlay — follows mouse */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(${110 + mousePos.x * 20}deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) ${35 + mousePos.x * 15}%, rgba(255,255,255,0) 100%)`,
                pointerEvents: 'none',
                zIndex: 10,
              }} />

              {/* ── Ciphera Interface on Screen ── */}
              <div style={{
                position: 'absolute',
                inset: 'clamp(12px, 1.5vw, 24px)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 2,
              }}>
                {/* Header Bar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  paddingBottom: 'clamp(8px, 1vw, 14px)',
                  marginBottom: 'clamp(10px, 1.2vw, 18px)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: '#F5C400',
                      boxShadow: '0 0 6px rgba(245,196,0,0.4)',
                    }} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                      fontSize: 'clamp(10px, 0.9vw, 14px)',
                      letterSpacing: '0.12em',
                      color: 'rgba(255,255,255,0.8)',
                      textTransform: 'uppercase',
                    }}>Ciphera</span>
                    <span style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 'clamp(7px, 0.55vw, 9px)',
                      color: 'rgba(255,255,255,0.2)',
                      letterSpacing: '0.1em',
                    }}>v3.0</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <span style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 'clamp(6px, 0.5vw, 8px)',
                      color: 'rgba(74,222,128,0.6)',
                      letterSpacing: '0.08em',
                    }}>● PROCESSING</span>
                    <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f56', opacity: 0.8 }} />
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffbd2e', opacity: 0.8 }} />
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f', opacity: 0.8 }} />
                    </div>
                  </div>
                </div>

                {/* Status Bar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 'clamp(8px, 1vw, 14px)',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 'clamp(6px, 0.5vw, 8px)',
                  color: 'rgba(255,255,255,0.2)',
                  letterSpacing: '0.08em',
                }}>
                  <span>DOC: employee_records.pdf</span>
                  <span>7 ENTITIES DETECTED</span>
                </div>

                {/* Scanning line */}
                <div style={{
                  position: 'absolute',
                  left: 'clamp(12px, 1.5vw, 24px)',
                  right: 'clamp(12px, 1.5vw, 24px)',
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent 0%, #4ade80 50%, transparent 100%)',
                  boxShadow: '0 0 12px rgba(74, 222, 128, 0.3)',
                  opacity: isRedacting ? 0.6 : 0,
                  animation: isRedacting ? 'heroScan 3s ease-in-out infinite' : 'none',
                  zIndex: 5,
                  pointerEvents: 'none',
                }} />

                {/* Live Redaction Document */}
                <div style={{
                  flex: 1,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '1px',
                }}>
                  {DOC_LINES.map((line, i) => (
                    <RedactingLine
                      key={`${redactCycle}-${i}`}
                      line={line}
                      delay={i * 350}
                      isActive={isRedacting}
                    />
                  ))}
                </div>

                {/* Bottom Status */}
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 'clamp(6px, 0.8vw, 12px)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 'clamp(6px, 0.5vw, 8px)',
                  color: 'rgba(255,255,255,0.15)',
                  letterSpacing: '0.08em',
                }}>
                  <span>LOCAL INFERENCE · 0 BYTES TRANSMITTED</span>
                  <span style={{ color: 'rgba(74,222,128,0.4)' }}>CONFIDENCE: ≥0.95</span>
                </div>
              </div>
            </div>

            {/* iPad Camera dot */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '9px',
              transform: 'translateY(-50%)',
              width: '5px', height: '5px',
              background: 'radial-gradient(circle, #1a1a1c 40%, #0a0a0b 100%)',
              borderRadius: '50%',
              boxShadow: 'inset 0 0 2px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.05)',
            }} />
          </div>

          {/* ── 3D Shadow beneath the device ── */}
          <div style={{
            position: 'absolute',
            bottom: '-30px',
            left: '10%',
            right: '10%',
            height: '40px',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 70%)',
            filter: 'blur(20px)',
            transform: 'translateZ(-60px)',
            pointerEvents: 'none',
          }} />
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes heroScan {
          0% { top: 15%; opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { top: 85%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
