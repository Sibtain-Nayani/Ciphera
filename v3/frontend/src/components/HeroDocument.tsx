'use client'
import { useEffect, useState, useRef } from 'react'

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

function getLinePhase(index: number, progress: number): 'idle' | 'scanning' | 'found' | 'redacted' {
  // Starts at 0.16, ends at 0.90. Range is 0.74.
  // Each index gets 0.105 progress range.
  const start = 0.16 + index * 0.105;
  const scanDuration = 0.035;
  const foundDuration = 0.035;
  
  if (progress < start) return 'idle';
  if (progress < start + scanDuration) return 'scanning';
  if (progress < start + scanDuration + foundDuration) return 'found';
  return 'redacted';
}

function RedactingRow({ line, phase }: {
  line: typeof DOC_LINES[0],
  phase: 'idle' | 'scanning' | 'found' | 'redacted'
}) {
  const isScanning = phase === 'scanning';
  const isFound = phase === 'found';
  const isRedacted = phase === 'redacted';

  const textSharpness: React.CSSProperties = {
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    textRendering: 'optimizeLegibility',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 'clamp(10px, 0.75vw, 12px)',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.45)',
    width: '120px',
    flexShrink: 0,
    letterSpacing: '0.05em',
    ...textSharpness,
  };

  const valueStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: 'clamp(11px, 0.8vw, 13px)',
    fontFamily: isRedacted ? "'IBM Plex Mono', monospace" : "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontWeight: 500,
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'relative',
    ...textSharpness,
    ...(isScanning ? {
      background: 'rgba(52, 211, 153, 0.08)',
      color: '#34d399',
      border: '1px solid rgba(52, 211, 153, 0.3)',
      boxShadow: '0 0 12px rgba(52, 211, 153, 0.1)',
    } : isFound ? {
      background: 'rgba(245, 158, 11, 0.1)',
      color: '#f59e0b',
      border: '1px solid rgba(245, 158, 11, 0.4)',
      boxShadow: '0 0 12px rgba(245, 158, 11, 0.15)',
    } : isRedacted ? {
      background: 'rgba(255, 255, 255, 0.04)',
      color: '#34d399',
      border: '1px dashed rgba(52, 211, 153, 0.25)',
      padding: '4px 12px',
    } : {
      color: 'rgba(255, 255, 255, 0.9)',
      border: '1px solid transparent',
    })
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: 'clamp(10px, 0.8vw, 15px) 16px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      position: 'relative',
    }}>
      <span style={labelStyle}>{line.text}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        <span style={valueStyle}>
          {isRedacted ? `✓ DECLASSIFIED` : line.pii}
        </span>
        {isFound && (
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '9px',
            fontWeight: 600,
            color: '#f59e0b',
            background: 'rgba(245, 158, 11, 0.15)',
            padding: '2px 6px',
            borderRadius: '3px',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            ...textSharpness,
          }}>
            ⚠️ {line.type} MATCH
          </span>
        )}
        {isRedacted && (
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '9px',
            fontWeight: 600,
            color: '#34d399',
            background: 'rgba(52, 211, 153, 0.1)',
            padding: '2px 6px',
            borderRadius: '3px',
            border: '1px solid rgba(52, 211, 153, 0.2)',
            ...textSharpness,
          }}>
            [SECURED]
          </span>
        )}
      </div>
    </div>
  )
}

function EngineLogsConsole({ progress }: { progress: number }) {
  const textSharpness: React.CSSProperties = {
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    textRendering: 'optimizeLegibility',
  };

  let activePhaseText = 'AWAITING DECLASSIFICATION';
  let activePhaseColor = 'rgba(255,255,255,0.4)';
  
  if (progress >= 0.85) {
    activePhaseText = 'EXPORT INTEGRITY SECURED';
    activePhaseColor = '#34d399';
  } else if (progress >= 0.70) {
    activePhaseText = 'SYNTHETIC DE-IDENTIFICATION';
    activePhaseColor = '#60a5fa';
  } else if (progress >= 0.45) {
    activePhaseText = 'DEEP SCANS & ENSEMBLE VOTING';
    activePhaseColor = '#f59e0b';
  } else if (progress >= 0.16) {
    activePhaseText = 'PII SEGMENTATION ACTIVE';
    activePhaseColor = '#34d399';
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      paddingRight: '16px',
      gap: '12px',
      overflow: 'hidden',
    }}>
      <div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '9px',
          fontWeight: 700,
          color: 'rgba(255, 255, 255, 0.3)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '4px',
          ...textSharpness,
        }}>
          // AI ENGINE DECLASSIFICATION CORE
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '11px',
          fontWeight: 600,
          color: activePhaseColor,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          transition: 'color 0.3s ease',
          ...textSharpness,
        }}>
          ● {activePhaseText}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px',
        padding: '8px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: '6px',
      }}>
        {[
          { name: 'spaCy NER', active: progress >= 0.16 },
          { name: 'Presidio Core', active: progress >= 0.16 },
          { name: 'Regex Checksum', active: progress >= 0.16 },
          { name: 'Local Sandbox', active: true, locked: true },
        ].map((det, index) => (
          <div key={index} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '9px',
            color: det.active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
            ...textSharpness,
          }}>
            <div style={{
              width: '4px', height: '4px', borderRadius: '50%',
              background: det.locked ? '#60a5fa' : det.active ? '#34d399' : 'rgba(255,255,255,0.2)',
              boxShadow: det.active ? `0 0 6px ${det.locked ? '#60a5fa' : '#34d399'}` : 'none',
              transition: 'all 0.3s ease',
            }} />
            <span>{det.name}</span>
          </div>
        ))}
      </div>

      <div style={{
        flex: 1,
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '6px',
        padding: '10px',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 'clamp(9px, 0.7vw, 11px)',
        lineHeight: 1.6,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginBottom: '4px' }}>
          TERMINAL CORE SHIELD v3.0
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {DOC_LINES.map((line, i) => {
            const phase = getLinePhase(i, progress);
            let logText = ``;
            let logColor = 'rgba(255,255,255,0.15)';

            if (phase === 'idle') {
              logText = `[WAIT] ${line.type} scanner queued...`;
            } else if (phase === 'scanning') {
              logText = `[SCAN] Checking token: ${line.type}...`;
              logColor = 'rgba(255, 255, 255, 0.7)';
            } else if (phase === 'found') {
              logText = `[WARN] Match detected for ${line.type}!`;
              logColor = '#f59e0b';
            } else if (phase === 'redacted') {
              logText = `[OK] ${line.type} secure redaction applied`;
              logColor = '#34d399';
            }

            return (
              <div key={i} style={{
                color: logColor,
                transition: 'color 0.3s ease',
                ...textSharpness,
              }}>
                {logText}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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

  // 1. Blueprint wireframe bezel opacity based on initial scrolls
  let wireframeOpacity = 0;
  if (scrollProgress < 0.04) {
    wireframeOpacity = scrollProgress / 0.04;
  } else if (scrollProgress < 0.08) {
    wireframeOpacity = 1;
  } else if (scrollProgress < 0.12) {
    wireframeOpacity = 1 - (scrollProgress - 0.08) / 0.04;
  }

  // Corner tech blueprint labels opacity
  const techLabelsOpacity = 1 - Math.min(1, Math.max(0, (scrollProgress - 0.04) / 0.04));

  // 2. Holographic laser reveal logic
  const revealProgress = Math.min(1, Math.max(0, (scrollProgress - 0.04) / 0.06));
  const revealPercent = revealProgress * 50; // 0% (fully closed center line) to 50% (fully open)

  // Bezel premium metallic device opacity (bootup fade-in)
  const premiumBezelOpacity = Math.min(1, Math.max(0, (scrollProgress - 0.06) / 0.06));

  // Bezel visual scale (starts slightly smaller, pops into place smoothly)
  const scale = 0.95 + Math.min(0.05, (scrollProgress / 0.10) * 0.05);
  const fadeIn = Math.min(1, scrollProgress / 0.04);

  // 3. Secure boot degaussing ripple animation
  const rippleActive = scrollProgress >= 0.10 && scrollProgress <= 0.14;
  const rippleProgress = rippleActive ? (scrollProgress - 0.10) / 0.04 : 0;
  const rippleScale = 0.5 + rippleProgress * 2.5;
  const rippleOpacity = 1 - rippleProgress;

  // 4. Scanner laser coordinates mapping for right side declassification preview
  const activeProgress = Math.min(1, Math.max(0, (scrollProgress - 0.16) / 0.74));
  const laserTop = 12 + activeProgress * 76;
  const isScanningActive = scrollProgress >= 0.14 && scrollProgress <= 0.93;

  const textSharpness: React.CSSProperties = {
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    textRendering: 'optimizeLegibility',
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      position: 'absolute', top: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      perspective: '1800px',
    }}>
      {/* Scale & Fade wrapper */}
      <div style={{
        opacity: fadeIn,
        transform: `scale(${scale})`,
        transition: 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        transformStyle: 'preserve-3d',
        position: 'relative',
      }}>
        {/* ────────────────── Holographic Bezel Wireframe ────────────────── */}
        {wireframeOpacity > 0 && (
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'clamp(18px, 3vw, 42px)',
            border: '1px solid #34d399',
            boxShadow: '0 0 15px rgba(52, 211, 153, 0.4), inset 0 0 15px rgba(52, 211, 153, 0.2)',
            opacity: wireframeOpacity,
            pointerEvents: 'none',
            zIndex: 15,
            transition: 'opacity 0.1s linear',
          }}>
            {/* Sci-Fi Blueprint Coordinates Ticks */}
            {techLabelsOpacity > 0 && (
              <div style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                opacity: techLabelsOpacity,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '8px',
                fontWeight: 600,
                color: '#34d399',
                letterSpacing: '0.05em',
                pointerEvents: 'none',
                transition: 'opacity 0.1s ease',
              }}>
                <div style={{ position: 'absolute', top: '-25px', left: '10px' }}>
                  ┌ SYS_INIT // SECURE_LOCK
                </div>
                <div style={{ position: 'absolute', top: '-25px', right: '10px' }}>
                  COORD_X: 45.92 ┐
                </div>
                <div style={{ position: 'absolute', bottom: '-25px', left: '10px' }}>
                  └ LOCAL_CORE: ACT
                </div>
                <div style={{ position: 'absolute', bottom: '-25px', right: '10px' }}>
                  STAGE_1: MAP_SYS ┘
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────────────── Split Laser revealing lines ────────────────── */}
        {revealProgress > 0 && revealProgress < 1 && (
          <>
            <div style={{
              position: 'absolute',
              left: '11px',
              right: '11px',
              top: `calc(${50 - revealPercent}% + 11px)`,
              height: '2.5px',
              background: 'linear-gradient(90deg, transparent, #34d399 40%, #34d399 60%, transparent)',
              boxShadow: '0 0 14px #34d399, 0 0 5px #34d399',
              zIndex: 16,
              pointerEvents: 'none',
              transition: 'top 0.1s ease-out',
            }} />
            <div style={{
              position: 'absolute',
              left: '11px',
              right: '11px',
              top: `calc(${50 + revealPercent}% + 11px)`,
              height: '2.5px',
              background: 'linear-gradient(90deg, transparent, #34d399 40%, #34d399 60%, transparent)',
              boxShadow: '0 0 14px #34d399, 0 0 5px #34d399',
              zIndex: 16,
              pointerEvents: 'none',
              transition: 'top 0.1s ease-out',
            }} />
          </>
        )}

        {/* ────────────────── Premium iPad Device Body ────────────────── */}
        <div style={{
          width: 'clamp(540px, 50vw, 900px)',
          aspectRatio: '1.43 / 1',
          position: 'relative',
          background: 'linear-gradient(145deg, #1e1f22 0%, #0d0e10 100%)',
          borderRadius: 'clamp(18px, 3vw, 42px)',
          border: '1.5px solid rgba(255,255,255,0.08)',
          boxShadow:
            '0 40px 80px rgba(0,0,0,0.65), ' +
            '0 20px 40px rgba(0,0,0,0.45), ' +
            '0 2px 8px rgba(0,0,0,0.25), ' +
            'inset 0 1px 0 rgba(255,255,255,0.05), ' +
            'inset 0 0 0 10px #08090b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: premiumBezelOpacity,
          transition: 'opacity 0.2s linear',
        }}>
          {/* Bezel inner mask with laser sweep reveal clipPath */}
          <div style={{
            width: 'calc(100% - 22px)',
            height: 'calc(100% - 22px)',
            background: '#040506',
            borderRadius: 'clamp(14px, 2.5vw, 34px)',
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.03)',
            clipPath: `polygon(0% ${50 - revealPercent}%, 100% ${50 - revealPercent}%, 100% ${50 + revealPercent}%, 0% ${50 + revealPercent}%)`,
            transition: 'clip-path 0.1s ease-out',
          }}>
            {/* Degaussing electrostatic bootup ripple */}
            {rippleActive && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle, rgba(52,211,153,0.18) 0%, rgba(255,255,255,0.08) 40%, transparent 70%)',
                transform: `scale(${rippleScale})`,
                opacity: rippleOpacity,
                pointerEvents: 'none',
                zIndex: 20,
              }} />
            )}

            {/* Premium dark ambient glow — greyish cool silver gradients */}
            <div style={{
              position: 'absolute',
              inset: '-30%',
              background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.03) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(148,163,184,0.02) 0%, transparent 50%)',
              pointerEvents: 'none',
            }} />

            {/* Subtle grid lines for depth */}
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              pointerEvents: 'none',
              opacity: 0.5,
            }} />

            {/* Glossy Reflection overlay — follows mouse */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(${110 + mousePos.x * 20}deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) ${35 + mousePos.x * 15}%, rgba(255,255,255,0) 100%)`,
              pointerEvents: 'none',
              zIndex: 10,
            }} />

            {/* Ciphera Interface on Screen */}
            <div style={{
              position: 'absolute',
              inset: 'clamp(12px, 1.5vw, 24px)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 2,
              height: 'calc(100% - clamp(24px, 3vw, 48px))',
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
                    background: '#34d399',
                    boxShadow: '0 0 6px rgba(52,211,153,0.5)',
                  }} />
                  <span style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: 'clamp(10px, 0.9vw, 14px)',
                    letterSpacing: '0.12em',
                    color: 'rgba(255,255,255,0.85)',
                    textTransform: 'uppercase',
                    ...textSharpness,
                  }}>Ciphera</span>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 'clamp(7px, 0.55vw, 9px)',
                    color: 'rgba(255,255,255,0.3)',
                    letterSpacing: '0.1em',
                    ...textSharpness,
                  }}>v3.0</span>
                </div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 'clamp(6px, 0.5vw, 8px)',
                    color: '#34d399',
                    letterSpacing: '0.08em',
                    ...textSharpness,
                  }}>● PROCESSING CORE</span>
                  <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f56', opacity: 0.8 }} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffbd2e', opacity: 0.8 }} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f', opacity: 0.8 }} />
                  </div>
                </div>
              </div>

              {/* Main Grid: Left Side Console Logs & Right Side Document View */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '35% 65%',
                gap: '16px',
                flex: 1,
                overflow: 'hidden',
              }}>
                {/* Left Panel: Engine Logs Console */}
                <EngineLogsConsole progress={scrollProgress} />

                {/* Right Panel: Secure Document Viewer */}
                <div style={{
                  background: 'rgba(255,255,255,0.01)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Document Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(255,255,255,0.02)',
                  }}>
                    <span style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '9px',
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.4)',
                      letterSpacing: '0.05em',
                      ...textSharpness,
                    }}>
                      DOC: employee_records.pdf
                    </span>
                    <span style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '9px',
                      color: 'rgba(255,255,255,0.3)',
                      ...textSharpness,
                    }}>
                      CONFIDENTIAL · CLASSIFIED
                    </span>
                  </div>

                  {/* Interactive Scan Laser Beam */}
                  {isScanningActive && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: `${laserTop}%`,
                      height: '2px',
                      background: 'linear-gradient(90deg, transparent, #34d399 30%, #34d399 70%, transparent)',
                      boxShadow: '0 0 10px rgba(52, 211, 153, 0.8), 0 0 4px rgba(52, 211, 153, 0.4)',
                      transition: 'top 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      pointerEvents: 'none',
                      zIndex: 10,
                    }} />
                  )}

                  {/* Document Rows */}
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}>
                    {DOC_LINES.map((line, i) => (
                      <RedactingRow
                        key={i}
                        line={line}
                        phase={getLinePhase(i, scrollProgress)}
                      />
                    ))}
                  </div>
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
        </div>
      </div>
    </div>
  )
}