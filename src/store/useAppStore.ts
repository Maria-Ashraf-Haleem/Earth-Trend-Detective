import { config } from '@/config'
import type { ThemeMode } from '@/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  theme: ThemeMode
  demoBannerDismissed: boolean
  commandOpen: boolean
  mobileNavOpen: boolean
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setCommandOpen: (open: boolean) => void
  setMobileNavOpen: (open: boolean) => void
  dismissBanner: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      demoBannerDismissed: false,
      commandOpen: false,
      mobileNavOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      dismissBanner: () => set({ demoBannerDismissed: true }),
    }),
    {
      name: `${config.persistenceKey}.app`,
      partialize: (state) => ({
        theme: state.theme,
        demoBannerDismissed: state.demoBannerDismissed,
      }),
    },
  ),
)
