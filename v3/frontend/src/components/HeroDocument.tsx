'use client'
import { useEffect, useState, useRef, useCallback } from 'react'

const FIELDS = [
  { label: 'SUBJECT',  barW: 55 },
  { label: 'AADHAAR',  barW: 68 },
  { label: 'PAN',      barW: 42 },
  { label: 'PHONE',    barW: 50 },
  { label: 'EMAIL',    barW: 58 },
  { label: 'DOB',      barW: 32 },
  { label: 'BANK A/C', barW: 55 },
  { label: 'ADDRESS 1',barW: 78 },
  { label: 'ADDRESS 2',barW: 60 },
  { label: 'CITY',     barW: 40 },
  { label: 'STATE',    barW: 45 },
  { label: 'PINCODE',  barW: 30 },
  { label: 'COUNTRY',  barW: 35 },
  { label: 'RELIGION', barW: 45 },
  { label: 'CASTE',    barW: 50 },
]

const WORD = 'CIPHERA';
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?';
const rg = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

function DecryptCiphera({ trigger }: { trigger: boolean }) {
    const [letters, setLetters] = useState<string[]>(Array(7).fill(''));
    const [colors, setColors] = useState<string[]>(Array(7).fill('transparent'));

    useEffect(() => {
        if (!trigger) {
            setLetters(Array(7).fill(''));
            setColors(Array(7).fill('transparent'));
            return;
        }

        let aborted = false;
        const run = async () => {
            const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
            for (let i = 0; i < 7; i++) {
                if (aborted) return;
                for (let s = 0; s < 3; s++) {
                    if (aborted) return;
                    setLetters(prev => { const n = [...prev]; n[i] = rg(); return n; });
                    setColors(prev => { const n = [...prev]; n[i] = 'rgba(255,255,255,0.35)'; return n; });
                    await sleep(45);
                }
                setLetters(prev => { const n = [...prev]; n[i] = WORD[i]; return n; });
                setColors(prev => { const n = [...prev]; n[i] = 'rgba(255,255,255,0.92)'; return n; });
                await sleep(85 + Math.random() * 35);
            }
        };
        run();
        return () => { aborted = true; };
    }, [trigger]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1px',
            fontFamily: "'Arial Black', 'Helvetica', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(48px, 6vw, 72px)',
            letterSpacing: '0.01em',
            transform: 'scaleY(1.15)', // Give it that slightly tall, impactful look
        }}>
            {letters.map((ch, i) => (
                <span key={i} className="ciphera-decrypt-letter" style={{ color: colors[i] }}>
                    {ch || '\u00A0'}
                </span>
            ))}
        </div>
    );
}

export default function HeroDocument({ scrollProgress }: { scrollProgress: number }) {
  const groupRef = useRef<HTMLDivElement>(null);
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
    canvas.width = 1024
    canvas.height = 1424
    const ctx = canvas.getContext('2d')
    if (ctx) {
      // Base paper color (dark greyish)
      ctx.fillStyle = '#141414'
      ctx.fillRect(0, 0, 1024, 1424)

      // Paper grain — random dots
      for (let i = 0; i < 24000; i++) {
        const x = Math.random() * 1024
        const y = Math.random() * 1424
        const opacity = Math.random() * 0.04
        ctx.fillStyle = `rgba(255,255,255,${opacity})`
        ctx.fillRect(x, y, 1, 1)
      }

      // Slight vignette edges
      const gradient = ctx.createRadialGradient(512, 712, 400, 512, 712, 760)
      gradient.addColorStop(0, 'rgba(0,0,0,0)')
      gradient.addColorStop(1, 'rgba(0,0,0,0.3)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 1024, 1424)

      // Printed text lines — barely visible
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'
      ctx.lineWidth = 1
      for (let y = 160; y < 1360; y += 56) {
        ctx.beginPath()
        ctx.moveTo(96, y)
        ctx.lineTo(928, y)
        ctx.stroke()
      }

      setPaperTexture(canvas.toDataURL())
    }
  }, [])

  /* ── Scroll-driven 3D rotation ── */
  // Smooth, completely stable single-axis rotation across the entire page
  const rotY = scrollProgress * 180;
  const rotX = 0;
  const rotZ = 0;

  // Mouse parallax on top
  const finalRotY = rotY + (mousePos.x * 6)
  const finalRotX = rotX + (mousePos.y * -4)

  /* ── Phase logic ── */
  const isDeclassified = scrollProgress > 0.70
  const showStamp      = scrollProgress > 0.72
  const stampOpacity   = showStamp ? Math.min(1, (scrollProgress - 0.72) / 0.10) : 0

  /* ── Yellow scan line (phases 1–2) ── */
  const showScan = scrollProgress >= 0.12 && scrollProgress <= 0.65
  const scanY    = showScan ? ((scrollProgress - 0.12) / 0.53) * 100 : -10

  /* ── Fade in / out ── */
  const fadeIn  = Math.min(1, scrollProgress / 0.08)
  const fadeOut = 1;
  const opacity = fadeIn * fadeOut;

  const extraTransform = `rotateZ(${rotZ}deg)`

  // Fades classification overlay hologram as clearance is granted
  const holoOpacity = 0;

  return (
    <div style={{
      width: '100%', height: '100%',
      position: 'absolute', top: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      perspective: '1600px',
    }}>
      <style>{`
        .ciphera-decrypt-letter {
           display: inline-block;
           width: 0.8em;
           text-align: center;
        }
      `}</style>

      {/* Float wrapper */}
      <div style={{
        opacity,
        transition: 'opacity 0.3s',
        transformStyle: 'preserve-3d',
        WebkitFontSmoothing: 'antialiased', // Sharpen text rendering
        MozOsxFontSmoothing: 'grayscale',
      }}>
        {/* 3D rotation wrapper */}
        <div ref={groupRef} style={{
          transform: `rotateX(${finalRotX}deg) rotateY(${finalRotY}deg) ${extraTransform}`,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          width: 'clamp(380px, 30vw, 480px)', // 23% larger dimension
          aspectRatio: '210 / 297',
        }}>
          {/* ═══════════ THE PAPER ═══════════ */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: paperTexture ? `url(${paperTexture})` : '#141414',
            backgroundSize: '100% 100%',
            fontFamily: "'IBM Plex Mono', monospace",
            transformStyle: 'preserve-3d', // Enable nested 3D elements (preserve-3d)
            backfaceVisibility: 'hidden',
            boxShadow:
              '6px 12px 32px rgba(0,0,0,0.5), ' +
              '14px 28px 80px rgba(0,0,0,0.4), ' +
              'inset 0 0 80px rgba(0,0,0,0.5)',
          }}>

            {/* Layer 1 (specular light catch overlay) */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at ${50 + mousePos.x * 30}% ${50 + mousePos.y * 30}%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 60%)`,
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
                border: `1.5px solid ${isDeclassified ? 'rgba(34,197,94,0.6)' : 'rgba(245,196,0,0.5)'}`,
                position: 'relative',
                transition: 'border-color 0.6s',
              }}>
                <div style={{
                  fontSize: 'clamp(7px, 0.65vw, 9px)',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  color: isDeclassified ? '#4ade80' : '#F5C400',
                  transition: 'color 0.6s',
                  lineHeight: 1.4,
                }}>
                  CLASSIFICATION:
                </div>
                <div style={{
                  fontSize: 'clamp(9px, 0.85vw, 12px)',
                  fontWeight: 700,
                  letterSpacing: '0.10em',
                  color: isDeclassified ? '#4ade80' : '#F5C400',
                  transition: 'color 0.6s',
                }}>
                  {isDeclassified ? 'DECLASSIFIED' : 'RESTRICTED'}
                </div>

                {/* Ref number */}
                <div style={{
                  position: 'absolute', top: '12%', right: '5%',
                  fontSize: 'clamp(5px, 0.5vw, 7px)',
                  color: 'rgba(255,255,255,0.28)',
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
                background: 'rgba(255,255,255,0.08)',
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
                        color: 'rgba(255,255,255,0.18)',
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
                          color: 'rgba(255,255,255,0.60)',
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
                              background: '#F5C400', // Yellow tape
                              borderRadius: '1px',
                              transform: 'translateZ(8px)', // Floats 8px higher than text (16px total from paper!)
                              boxShadow: '0 2px 5px rgba(0, 0, 0, 0.65)', // Shadow under redaction tape
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
                              color: '#F5C400',
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
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{
                  fontSize: 'clamp(6px, 0.55vw, 8px)',
                  fontWeight: 600,
                  color: isDeclassified ? '#4ade80' : 'rgba(255,255,255,0.35)',
                  letterSpacing: '0.10em',
                  transition: 'color 0.6s',
                }}>
                  STATUS: {isDeclassified ? 'DECLASSIFIED' : 'AWAITING REDACTION'}
                </div>
                <div style={{
                  fontSize: 'clamp(5px, 0.45vw, 7px)',
                  color: 'rgba(255,255,255,0.22)',
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
                border: '3px solid rgba(74,222,128,0.45)',
                padding: '2% 5%',
                opacity: stampOpacity,
                zIndex: 8,
                pointerEvents: 'none',
                WebkitTextStroke: '1.5px rgba(74,222,128,0.45)',
                boxShadow: '0 4px 10px rgba(0,0,0,0.5)', // Shadow cast onto lower layers
              }}>
                DECLASSIFIED
              </div>
            )}

          </div>
          {/* ═══════════ END FRONT PAPER ═══════════ */}

          {/* ═══════════ THE BACK PAPER ═══════════ */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: paperTexture ? `url(${paperTexture})` : '#141414', // Texture applied to back too
            backgroundSize: '100% 100%',
            border: '1px solid rgba(255,255,255,0.05)',
            transform: 'rotateY(180deg)',
            backfaceVisibility: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow:
              '-6px 12px 32px rgba(0,0,0,0.5), ' +
              '-14px 28px 80px rgba(0,0,0,0.4)',
          }}>
            <DecryptCiphera trigger={scrollProgress > 0.50} />
          </div>

        </div>
      </div>
    </div>
  )
}
