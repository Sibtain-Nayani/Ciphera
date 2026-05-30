"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RuleType, RedactionAction } from '@/store/documentStore';
import { redactionEngine, Token } from '@/lib/redactionEngine';

const SCRAMBLE_CHARS = '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

interface AnimatedTokenProps {
    token:       Token;
    isRedacted:  boolean;
    action:      RedactionAction;
    accentColor?: string;
    // Per-entity action override from EntityReviewModal
    actionOverride?: RedactionAction;
}

export function AnimatedToken({ token, isRedacted, action, accentColor, actionOverride }: AnimatedTokenProps) {
    const effectiveAction  = actionOverride || action;
    const replacementText  = redactionEngine.getRedactionReplacement(token.type as RuleType, token.value, effectiveAction);
    const targetText       = isRedacted ? replacementText : token.value;

    const [displayText,   setDisplayText]   = useState(targetText);
    const [isScrambling,  setIsScrambling]  = useState(false);
    const [showTooltip,   setShowTooltip]   = useState(false);

    const color    = accentColor || '#FFA500';
    const isHindi  = token.language === 'hi';
    const score    = token.score ?? 0;
    const scoreStr = `${(score * 100).toFixed(0)}%`;

    useEffect(() => {
        setIsScrambling(true);
        const totalDuration = 400;
        const frameInterval = 30;
        const totalFrames   = Math.floor(totalDuration / frameInterval);
        let frame = 0;

        const interval = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            const revealed = Math.floor(progress * targetText.length);
            const scrambled = targetText.split('').map((char, i) => {
                if (i < revealed) return targetText[i];
                if (char === ' ')  return ' ';
                return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
            }).join('');

            setDisplayText(scrambled);
            if (frame >= totalFrames) {
                clearInterval(interval);
                setDisplayText(targetText);
                setIsScrambling(false);
            }
        }, frameInterval);

        return () => clearInterval(interval);
    }, [isRedacted, targetText]);

    return (
        <span
            className="relative inline"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <motion.span
                layout
                className="inline font-mono rounded-sm cursor-default"
                style={
                    isRedacted
                        ? { backgroundColor: color, color: '#1E1E1E', fontWeight: 500, boxShadow: `0 0 5px ${color}66` }
                        : { backgroundColor: `${color}40`, color: 'transparent' }
                }
                initial={false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
            >
                <AnimatePresence>
                    {isScrambling && isRedacted && (
                        <motion.span
                            className="absolute inset-0 rounded"
                            style={{ backgroundColor: `${color}4D` }}
                            initial={{ opacity: 0.8 }}
                            animate={{ opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.5 }}
                        />
                    )}
                </AnimatePresence>
                {displayText}

                {/* Hindi badge — tiny indicator on Hindi-detected entities */}
                {isHindi && (
                    <span style={{
                        position:      'relative',
                        top:           '-4px',
                        marginLeft:    '2px',
                        fontSize:      '7px',
                        fontFamily:    'sans-serif',
                        color:         isRedacted ? '#1E1E1E' : color,
                        opacity:       0.7,
                        verticalAlign: 'super',
                        letterSpacing: 0,
                    }}>हि</span>
                )}
            </motion.span>

            {/* Confidence tooltip — appears on hover */}
            {showTooltip && token.score !== undefined && (
                <span style={{
                    position:        'absolute',
                    bottom:          'calc(100% + 6px)',
                    left:            '50%',
                    transform:       'translateX(-50%)',
                    zIndex:          9999,
                    background:      '#111',
                    border:          '1px solid #2A2A2A',
                    borderRadius:    '8px',
                    padding:         '6px 10px',
                    minWidth:        '140px',
                    pointerEvents:   'none',
                    whiteSpace:      'nowrap',
                }}>
                    {/* Score bar */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{
                            display:      'block',
                            height:       '3px',
                            width:        '64px',
                            background:   '#2A2A2A',
                            borderRadius: '2px',
                            overflow:     'hidden',
                        }}>
                            <span style={{
                                display:      'block',
                                height:       '100%',
                                width:        `${score * 100}%`,
                                background:   score >= 0.85 ? '#22c55e' : score >= 0.65 ? '#FFA500' : '#ef4444',
                                borderRadius: '2px',
                                transition:   'width 0.3s',
                            }} />
                        </span>
                        <span style={{
                            fontFamily:    'Courier New, monospace',
                            fontSize:      '9px',
                            color:         score >= 0.85 ? '#22c55e' : score >= 0.65 ? '#FFA500' : '#ef4444',
                            fontWeight:    700,
                        }}>{scoreStr}</span>
                    </span>

                    {/* Entity type + source + language */}
                    <span style={{ display: 'block', fontFamily: 'Courier New, monospace', fontSize: '8px', color: '#6B7280', letterSpacing: '0.08em' }}>
                        {token.entityType || token.type}
                    </span>
                    {token.source && (
                        <span style={{ display: 'block', fontFamily: 'Courier New, monospace', fontSize: '8px', color: '#4B5563', marginTop: '1px' }}>
                            via {token.source}{isHindi ? ' · हिंदी' : ''}
                        </span>
                    )}
                    {token.mlReasoning && (
                        <span style={{
                            display:      'block',
                            fontFamily:   'Barlow, sans-serif',
                            fontSize:     '9px',
                            color:        '#6B7280',
                            marginTop:    '4px',
                            borderTop:    '1px solid #1E1E1E',
                            paddingTop:   '4px',
                            maxWidth:     '180px',
                            whiteSpace:   'normal',
                            lineHeight:   1.4,
                        }}>
                            {token.mlReasoning}
                        </span>
                    )}

                    {/* Tooltip arrow */}
                    <span style={{
                        position:   'absolute',
                        bottom:     '-5px',
                        left:       '50%',
                        transform:  'translateX(-50%)',
                        width:      0,
                        height:     0,
                        borderLeft: '5px solid transparent',
                        borderRight:'5px solid transparent',
                        borderTop:  '5px solid #2A2A2A',
                    }} />
                </span>
            )}
        </span>
    );
}

export function PlainTextToken({ token, isRedacted }: { token: Token; isRedacted: boolean }) {
    return (
        <span className={isRedacted ? "text-gray-400" : "text-transparent"}>
            {token.value}
        </span>
    );
}