'use client'
import { useEffect, useState, useRef } from 'react'

const FIELDS = [
  { label: 'SUBJECT',  barW: 55 },
  { label: 'AADHAAR',  barW: 68 },
  { label: 'PAN',      barW: 42 },
  { label: 'PHONE',    barW: 50 },
  { label: 'EMAIL',    barW: 58 },
  { label: 'DOB',      barW: 32 },
  { label: 'BANK A/C', barW: 55 },
  { label: 'ADDRESS',  barW: 78 },
]

export default function HeroDocument({ scrollProgress }: { scrollProgress: number }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const rafRef = useRef(0)
  const posRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      posRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      }
    }
    const tick = () => {
      setMousePos(prev => ({
        x: prev.x + (posRef.current.x - prev.x) * 0.08,
        y: prev.y + (posRef.current.y - prev.y) * 0.08,
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

  /* ── Scroll-driven 3D rotation ── */
  let rotY: number, rotX: number
  if (scrollProgress < 0.15) {
    rotY = -14; rotX = 5
  } else if (scrollProgress < 0.65) {
    const p = (scrollProgress - 0.15) / 0.50
    rotY = -14 + 14 * p
    rotX = 5 - 5 * p
  } else {
    rotY = 0; rotX = 0
  }
  // Mouse parallax on top
  rotY += mousePos.x * 6
  rotX += mousePos.y * -4

  /* ── Phase logic ── */
  const isDeclassified = scrollProgress > 0.70
  const showStamp      = scrollProgress > 0.72
  const stampOpacity   = showStamp ? Math.min(1, (scrollProgress - 0.72) / 0.10) : 0

  /* ── Yellow scan line (phases 1–2) ── */
  const showScan = scrollProgress >= 0.12 && scrollProgress <= 0.65
  const scanY    = showScan ? ((scrollProgress - 0.12) / 0.53) * 100 : -10

  /* ── Fade in / out ── */
  const fadeIn  = Math.min(1, scrollProgress / 0.08)
  const fadeOut = scrollProgress > 0.85 ? 1 - (scrollProgress - 0.85) / 0.15 : 1
  const opacity = fadeIn * fadeOut

  return (
    <div style={{
      width: '100%', height: '100%',
      position: 'absolute', top: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      perspective: '1400px',
    }}>
      <style>{`
        @keyframes heroDocFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
      `}</style>

      {/* Float wrapper */}
      <div style={{
        animation: 'heroDocFloat 5s ease-in-out infinite',
        opacity,
        transition: 'opacity 0.3s',
      }}>
        {/* 3D rotation wrapper */}
        <div style={{
          transform: `rotateY(${rotY}deg) rotateX(${rotX}deg)`,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}>
          {/* ═══════════ THE PAPER ═══════════ */}
          <div style={{
            width: 'clamp(280px, 22vw, 360px)',
            aspectRatio: '210 / 297',
            background: 'linear-gradient(170deg, #f2ede4 0%, #ebe5da 45%, #e8e0d2 100%)',
            position: 'relative',
            fontFamily: "'IBM Plex Mono', monospace",
            overflow: 'hidden',
            boxShadow:
              '4px 8px 24px rgba(0,0,0,0.45), ' +
              '10px 20px 60px rgba(0,0,0,0.35), ' +
              'inset 0 0 80px rgba(0,0,0,0.03)',
          }}>

            {/* ── Paper grain texture ── */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
              backgroundSize: '128px 128px',
              pointerEvents: 'none',
              zIndex: 1,
              mixBlendMode: 'multiply',
            }} />

            {/* ── Red margin line ── */}
            <div style={{
              position: 'absolute', left: '11.5%', top: 0, bottom: 0,
              width: '1px',
              background: 'rgba(185,28,28,0.28)',
              zIndex: 2,
            }} />

            {/* ── Corner fold (top-right) ── */}
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: '22px', height: '22px',
              background: 'linear-gradient(225deg, #111 50%, #d5cec4 50%)',
              zIndex: 12,
              boxShadow: '-1px 1px 3px rgba(0,0,0,0.12)',
            }} />

            {/* ═══ CLASSIFICATION BADGE ═══ */}
            <div style={{
              margin: '5% 5% 0 14%',
              padding: '3% 4%',
              border: `1.5px solid ${isDeclassified ? 'rgba(34,197,94,0.6)' : 'rgba(185,28,28,0.5)'}`,
              position: 'relative',
              zIndex: 3,
              transition: 'border-color 0.6s',
            }}>
              <div style={{
                fontSize: 'clamp(7px, 0.65vw, 9px)',
                fontWeight: 700,
                letterSpacing: '0.16em',
                color: isDeclassified ? '#15803d' : '#b91c1c',
                transition: 'color 0.6s',
                lineHeight: 1.4,
              }}>
                CLASSIFICATION:
              </div>
              <div style={{
                fontSize: 'clamp(9px, 0.85vw, 12px)',
                fontWeight: 700,
                letterSpacing: '0.10em',
                color: isDeclassified ? '#15803d' : '#b91c1c',
                transition: 'color 0.6s',
              }}>
                {isDeclassified ? 'DECLASSIFIED' : 'RESTRICTED'}
              </div>

              {/* Ref number */}
              <div style={{
                position: 'absolute', top: '12%', right: '5%',
                fontSize: 'clamp(5px, 0.5vw, 7px)',
                color: 'rgba(0,0,0,0.28)',
                letterSpacing: '0.08em',
                textAlign: 'right',
                lineHeight: 1.5,
              }}>
                REF: CPH-2025-<br />0001
              </div>
            </div>

            {/* Separator */}
            <div style={{
              margin: '3.5% 5% 0 14%',
              height: '1px',
              background: 'rgba(0,0,0,0.08)',
              zIndex: 3,
              position: 'relative',
            }} />

            {/* ═══ FIELD ROWS ═══ */}
            <div style={{
              margin: '2.5% 0 0 0',
              position: 'relative',
              zIndex: 3,
            }}>
              {FIELDS.map((field, i) => {
                const revealStart = 0.40 + i * 0.028
                const barProg = Math.max(0, Math.min(1, (scrollProgress - revealStart) / 0.06))
                const barW = field.barW * (1 - barProg)
                const showLabel = barProg > 0.65

                return (
                  <div key={i} style={{
                    display: 'grid',
                    gridTemplateColumns: '11.5% 1fr',
                    padding: '1.2% 6% 1.2% 0',
                  }}>
                    {/* Line number */}
                    <div style={{
                      fontSize: 'clamp(6px, 0.5vw, 8px)',
                      color: 'rgba(0,0,0,0.18)',
                      textAlign: 'right',
                      paddingRight: '8%',
                      alignSelf: 'center',
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>

                    {/* Label + bar */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6%',
                      paddingLeft: '8%',
                    }}>
                      {/* Field label */}
                      <div style={{
                        fontSize: 'clamp(7px, 0.65vw, 10px)',
                        fontWeight: 600,
                        color: 'rgba(0,0,0,0.50)',
                        letterSpacing: '0.06em',
                        whiteSpace: 'nowrap',
                        minWidth: 'clamp(45px, 4.5vw, 65px)',
                        flexShrink: 0,
                      }}>
                        {field.label}
                      </div>

                      {/* Dark redaction bar / [REDACTED] label */}
                      <div style={{ position: 'relative', height: 'clamp(10px, 1vw, 14px)', flex: 1 }}>
                        <div style={{
                          width: `${barW}%`,
                          height: '100%',
                          background: '#1a1a1a',
                          borderRadius: '1px',
                        }} />
                        {showLabel && (
                          <div style={{
                            position: 'absolute',
                            top: '50%', left: 0,
                            transform: 'translateY(-50%)',
                            fontSize: 'clamp(5px, 0.48vw, 7px)',
                            fontWeight: 700,
                            color: '#b91c1c',
                            letterSpacing: '0.12em',
                            opacity: Math.min(1, (barProg - 0.65) / 0.35),
                          }}>
                            [REDACTED]
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ═══ DECLASSIFIED STAMP ═══ */}
            {showStamp && (
              <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%) rotate(-16deg)',
                fontSize: 'clamp(18px, 1.8vw, 28px)',
                fontWeight: 900,
                color: 'transparent',
                letterSpacing: '0.08em',
                border: '3px solid rgba(185,28,28,0.45)',
                padding: '2% 5%',
                opacity: stampOpacity,
                zIndex: 8,
                pointerEvents: 'none',
                WebkitTextStroke: '1.5px rgba(185,28,28,0.45)',
              }}>
                DECLASSIFIED
              </div>
            )}

            {/* ═══ YELLOW SCAN LINE ═══ */}
            {showScan && (
              <div style={{
                position: 'absolute',
                left: 0, right: 0,
                top: `${scanY}%`,
                height: '2px',
                background: 'linear-gradient(to right, transparent 5%, rgba(245,196,0,0.55) 25%, rgba(245,196,0,0.55) 75%, transparent 95%)',
                boxShadow: '0 0 10px rgba(245,196,0,0.25)',
                pointerEvents: 'none',
                zIndex: 6,
              }} />
            )}

            {/* ═══ FOOTER ═══ */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              padding: '3% 5% 3.5% 14%',
              borderTop: '1px solid rgba(0,0,0,0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 3,
            }}>
              <div style={{
                fontSize: 'clamp(6px, 0.55vw, 8px)',
                fontWeight: 600,
                color: isDeclassified ? '#15803d' : 'rgba(0,0,0,0.35)',
                letterSpacing: '0.10em',
                transition: 'color 0.6s',
              }}>
                STATUS: {isDeclassified ? 'DECLASSIFIED' : 'AWAITING REDACTION'}
              </div>
              <div style={{
                fontSize: 'clamp(5px, 0.45vw, 7px)',
                color: 'rgba(0,0,0,0.22)',
                letterSpacing: '0.08em',
              }}>
                PAGE 1 OF 1
              </div>
            </div>

            {/* Yellow accent line at bottom edge */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: '2px',
              background: 'linear-gradient(to right, transparent, #F5C400, transparent)',
              opacity: 0.35,
              zIndex: 4,
            }} />

          </div>
          {/* ═══════════ END PAPER ═══════════ */}
        </div>
      </div>
    </div>
  )
}
