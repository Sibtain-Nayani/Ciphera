import { create } from 'zustand';

interface UiState {
    isMobileMenuOpen: boolean;
    toggleMobileMenu: () => void;
    setMobileMenu: (isOpen: boolean) => void;
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
    isMobileMenuOpen: false,
    toggleMobileMenu: () => set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),
    setMobileMenu: (isOpen) => set({ isMobileMenuOpen: isOpen }),

    isSidebarCollapsed: false,
    toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
}));
