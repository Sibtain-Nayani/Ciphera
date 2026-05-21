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
  const [paperTexture, setPaperTexture] = useState<string>('')
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

  /* ── Generate Canvas Paper Texture ── */
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 712
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Base paper color
      ctx.fillStyle = '#ebe4d8'
      ctx.fillRect(0, 0, 512, 712)

      // Paper grain — random dots
      for (let i = 0; i < 12000; i++) {
        const x = Math.random() * 512
        const y = Math.random() * 712
        const opacity = Math.random() * 0.05
        ctx.fillStyle = `rgba(0,0,0,${opacity})`
        ctx.fillRect(x, y, 1, 1)
      }

      // Slight vignette edges
      const gradient = ctx.createRadialGradient(256, 356, 200, 256, 356, 380)
      gradient.addColorStop(0, 'rgba(0,0,0,0)')
      gradient.addColorStop(1, 'rgba(0,0,0,0.08)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 512, 712)

      // Printed text lines — barely visible
      ctx.strokeStyle = 'rgba(0,0,0,0.05)'
      ctx.lineWidth = 0.5
      for (let y = 80; y < 680; y += 28) {
        ctx.beginPath()
        ctx.moveTo(48, y)
        ctx.lineTo(464, y)
        ctx.stroke()
      }

      setPaperTexture(canvas.toDataURL())
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

  // Fades classification overlay hologram as clearance is granted
  const holoOpacity = Math.max(0, 1 - (scrollProgress / 0.70))

  return (
    <div style={{
      width: '100%', height: '100%',
      position: 'absolute', top: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      perspective: '1600px',
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
        transformStyle: 'preserve-3d',
      }}>
        {/* 3D rotation wrapper */}
        <div style={{
          transform: `rotateY(${rotY}deg) rotateX(${rotX}deg)`,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}>
          {/* ═══════════ THE PAPER ═══════════ */}
          <div style={{
            width: 'clamp(344px, 27vw, 442px)', // 23% larger dimension
            aspectRatio: '210 / 297',
            background: paperTexture ? `url(${paperTexture})` : 'linear-gradient(170deg, #f2ede4 0%, #ebe5da 45%, #e8e0d2 100%)',
            backgroundSize: '100% 100%',
            position: 'relative',
            fontFamily: "'IBM Plex Mono', monospace",
            transformStyle: 'preserve-3d', // Enable nested 3D elements (preserve-3d)
            boxShadow:
              '6px 12px 32px rgba(0,0,0,0.5), ' +
              '14px 28px 80px rgba(0,0,0,0.4), ' +
              'inset 0 0 80px rgba(0,0,0,0.03)',
          }}>

            {/* Layer 1 (specular light catch overlay) */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at ${50 + mousePos.x * 30}% ${50 + mousePos.y * 30}%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%)`,
              pointerEvents: 'none',
              zIndex: 9,
              mixBlendMode: 'overlay',
              transform: 'translateZ(1px)', // catches light just above base paper
            }} />

            {/* Red margin line - Layer 1 */}
            <div style={{
              position: 'absolute', left: '11.5%', top: 0, bottom: 0,
              width: '1px',
              background: 'rgba(185,28,28,0.28)',
              transform: 'translateZ(1px)',
              zIndex: 2,
            }} />

            {/* Corner fold (top-right) - Layer 1 */}
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: '22px', height: '22px',
              background: 'linear-gradient(225deg, #111 50%, #d5cec4 50%)',
              transform: 'translateZ(2px)',
              zIndex: 12,
              boxShadow: '-1px 1px 3px rgba(0,0,0,0.12)',
            }} />

            {/* Layer 2: Main Text Content & Layout Grid */}
            <div style={{
              position: 'absolute',
              inset: 0,
              transform: 'translateZ(8px)', // Float all labels and textual content 8px above paper
              transformStyle: 'preserve-3d',
              zIndex: 5,
            }}>
              
              {/* CLASSIFICATION BADGE */}
              <div style={{
                margin: '5% 5% 0 14%',
                padding: '3% 4%',
                border: `1.5px solid ${isDeclassified ? 'rgba(34,197,94,0.6)' : 'rgba(185,28,28,0.5)'}`,
                position: 'relative',
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
              }} />

              {/* FIELD ROWS */}
              <div style={{
                margin: '2.5% 0 0 0',
                transformStyle: 'preserve-3d',
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
                      transformStyle: 'preserve-3d',
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

                      {/* Label + bar container */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6%',
                        paddingLeft: '8%',
                        transformStyle: 'preserve-3d',
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
                        <div style={{ 
                          position: 'relative', 
                          height: 'clamp(10px, 1vw, 14px)', 
                          flex: 1,
                          transformStyle: 'preserve-3d',
                        }}>
                          
                          {/* Layer 3: Solid Black Redaction Bar with translateZ and shadow */}
                          {barW > 0 && (
                            <div style={{
                              width: `${barW}%`,
                              height: '100%',
                              background: '#1a1a1a',
                              borderRadius: '1px',
                              transform: 'translateZ(8px)', // Floats 8px higher than text (16px total from paper!)
                              boxShadow: '0 2px 5px rgba(0, 0, 0, 0.35)', // Shadow under redaction tape
                              transition: 'width 0.1s ease',
                            }} />
                          )}
                          
                          {showLabel && (
                            <div style={{
                              position: 'absolute',
                              top: '50%', left: 0,
                              transform: 'translateY(-50%) translateZ(4px)',
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

              {/* FOOTER */}
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                padding: '3% 5% 3.5% 14%',
                borderTop: '1px solid rgba(0,0,0,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
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
            </div>

            {/* Layer 4: DECLASSIFIED STAMP (floats high) */}
            {showStamp && (
              <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                // Placed at translateZ(22px) to float above redaction tapes!
                transform: 'translate(-50%, -50%) rotate(-16deg) translateZ(22px)',
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
                boxShadow: '0 4px 10px rgba(0,0,0,0.15)', // Shadow cast onto lower layers
              }}>
                DECLASSIFIED
              </div>
            )}

            {/* Layer 4: semi-transparent holographic classification overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              // Iridescent holographic sheen
              background: 'linear-gradient(135deg, rgba(185, 28, 28, 0.08) 0%, rgba(255, 154, 0, 0.05) 20%, rgba(208, 222, 33, 0.04) 40%, rgba(79, 220, 74, 0.04) 60%, rgba(63, 218, 216, 0.05) 80%, rgba(185, 28, 28, 0.08) 100%)',
              mixBlendMode: 'color-burn',
              pointerEvents: 'none',
              zIndex: 10,
              transform: 'translateZ(28px)', // Floats at the very front like an acetate/plastic security sleeve
              opacity: holoOpacity,
              transition: 'opacity 0.6s ease',
              border: '1px solid rgba(185,28,28,0.15)',
              boxShadow: 'inset 0 0 24px rgba(255, 255, 255, 0.06)',
            }} />

            {/* ─── YELLOW SCAN LINE ─── */}
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
                transform: 'translateZ(18px)', // sits above redaction bars
              }} />
            )}

            {/* Yellow accent line at bottom edge */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: '2px',
              background: 'linear-gradient(to right, transparent, #F5C400, transparent)',
              opacity: 0.35,
              zIndex: 4,
              transform: 'translateZ(1px)',
            }} />

          </div>
          {/* ═══════════ END PAPER ═══════════ */}
        </div>
      </div>
    </div>
  )
}
