import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface UiState {
    isSidebarCollapsed: boolean;
    isMobileMenuOpen: boolean;
    isCommandPaletteOpen: boolean;
    toasts: Toast[];

    toggleSidebar: () => void;
    setMobileMenu: (open: boolean) => void;
    toggleMobileMenu: () => void;
    setCommandPalette: (open: boolean) => void;
    
    addToast: (message: string, type?: ToastType) => void;
    removeToast: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
    isSidebarCollapsed: false,
    isMobileMenuOpen: false,
    isCommandPaletteOpen: false,
    toasts: [],

    toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    setMobileMenu: (open) => set({ isMobileMenuOpen: open }),
    toggleMobileMenu: () => set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),
    setCommandPalette: (open) => set({ isCommandPaletteOpen: open }),

    addToast: (message, type = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        set((state) => ({
            toasts: [...state.toasts, { id, message, type }]
        }));
        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter((t) => t.id !== id)
            }));
        }, 4000);
    },
    removeToast: (id) => set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
    })),
}));
