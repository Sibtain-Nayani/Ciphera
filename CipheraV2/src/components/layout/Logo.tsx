import React from 'react';

export const Logo = ({ className = 'w-8 h-8' }: { className?: string }) => {
    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 100 100" 
            fill="none" 
            className={className}
        >
            <defs>
                <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFA500" />
                    <stop offset="100%" stopColor="#FF5500" />
                </linearGradient>
            </defs>
            
            {/* Outer Shield */}
            <path 
                d="M50 5 L10 22.5 V45 C10 70 30 85 50 95 C70 85 90 70 90 45 V22.5 L50 5 Z" 
                stroke="url(#shieldGrad)" 
                strokeWidth="8" 
                strokeLinejoin="round" 
            />
                  
            {/* Inner Hollow Accent */}
            <path 
                d="M50 22 L25 32 V45 C25 62 38 75 50 80 C62 75 75 62 75 45 V32 L50 22 Z" 
                stroke="#FFA500" 
                strokeWidth="3" 
                strokeLinecap="round"
                strokeLinejoin="round" 
                strokeOpacity="0.6" 
            />
                  
        </svg>
    );
};
