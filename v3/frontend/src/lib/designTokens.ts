export const designTokens = {
    colors: {
        background: '#212121',
        surface: '#1E1E1E',
        surfaceOverlay: '#141414',
        accent: '#FFA500',
        accentHover: '#E69500',
        primaryText: '#FFFFFF',
        secondaryText: '#8F9098',
        mutedText: '#71727A',
        border: '#3B3B3B',
        borderLight: 'rgba(212, 214, 221, 0.1)'
    },
    animations: {
        transitionSpring: {
            type: 'spring' as const,
            stiffness: 300,
            damping: 30,
        },
        drawerSpring: {
            type: 'spring' as const,
            stiffness: 400,
            damping: 40,
        }
    },
    layout: {
        sidebarWidth: '260px',
        topBarHeight: '64px'
    }
};
