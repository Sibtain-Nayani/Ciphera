"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RuleType, RedactionAction } from '@/store/documentStore';
import { redactionEngine, Token } from '@/lib/redactionEngine';

// Characters used for the "scramble" effect
const SCRAMBLE_CHARS = '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

interface AnimatedTokenProps {
    token: Token;
    isRedacted: boolean;
    action: RedactionAction;
}

/**
 * AnimatedToken renders a single entity token with a matrix-style scramble
 * effect when transitioning between original and redacted states.
 */
export function AnimatedToken({ token, isRedacted, action }: AnimatedTokenProps) {
    const replacementText = redactionEngine.getRedactionReplacement(token.type as RuleType, token.value, action);
    const targetText = isRedacted ? replacementText : token.value;

    const [displayText, setDisplayText] = useState(targetText);
    const [isScrambling, setIsScrambling] = useState(false);

    useEffect(() => {
        // When the mode changes, begin the scramble animation
        setIsScrambling(true);

        const totalDuration = 400; // ms
        const frameInterval = 30; // ms per frame
        const totalFrames = Math.floor(totalDuration / frameInterval);
        let frame = 0;

        const interval = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;

            // Progressively reveal characters from left to right
            const revealed = Math.floor(progress * targetText.length);
            const scrambled = targetText
                .split('')
                .map((char, i) => {
                    if (i < revealed) return targetText[i];
                    // Keep spaces as spaces
                    if (char === ' ') return ' ';
                    return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
                })
                .join('');

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
        <motion.span
            layout
            className={`inline px-1 rounded mx-0.5 font-mono ${isRedacted
                ? 'bg-[#FFA500] text-black font-semibold shadow-[0_0_5px_rgba(255,165,0,0.4)]'
                : 'bg-white/10 text-transparent border border-[#3B3B3B]'
                }`}
            initial={false}
            animate={{
                opacity: 1,
                scale: 1,
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
        >
            {/* Glow pulse on mode switch */}
            <AnimatePresence>
                {isScrambling && isRedacted && (
                    <motion.span
                        className="absolute inset-0 rounded bg-[#FFA500]/30"
                        initial={{ opacity: 0.8 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                    />
                )}
            </AnimatePresence>
            {displayText}
        </motion.span>
    );
}

/**
 * Renders a plain text token that smoothly fades in.
 */
export function PlainTextToken({ token, isRedacted }: { token: Token; isRedacted: boolean }) {
    return (
        <span className={isRedacted ? "text-gray-400" : "text-transparent"}>
            {token.value}
        </span>
    );
}
