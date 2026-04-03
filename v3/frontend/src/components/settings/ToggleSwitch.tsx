"use client";

import React from 'react';

interface ToggleSwitchProps {
    /** Unique id for accessibility and testing */
    id: string;
    /** Current on/off state */
    checked: boolean;
    /** Called when the user toggles */
    onChange: () => void;
    /** If true, renders in disabled style and ignores clicks */
    disabled?: boolean;
}

/**
 * ToggleSwitch — iOS-style toggle with smooth cubic-bezier animation.
 * Uses the Ciphera amber accent when ON and a muted charcoal when OFF.
 */
export function ToggleSwitch({ id, checked, onChange, disabled }: ToggleSwitchProps) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label="Toggle"
            onClick={disabled ? undefined : onChange}
            className={`
                relative w-12 h-6 rounded-full transition-colors duration-300 shrink-0
                ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                ${checked ? 'bg-[#FFA500]' : 'bg-[#3B3B3B]'}
            `}
        >
            <span
                className={`
                    absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full
                    transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
                    ${checked ? 'translate-x-6 shadow-sm' : 'translate-x-0'}
                `}
            />
        </button>
    );
}
