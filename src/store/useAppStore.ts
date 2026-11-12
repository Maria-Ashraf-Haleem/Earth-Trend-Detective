import { config } from '@/config'
import type { ThemeMode, UserMode } from '@/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  theme: ThemeMode
  mode: UserMode
  demoBannerDismissed: boolean
  commandOpen: boolean
  mobileNavOpen: boolean
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setMode: (mode: UserMode) => void
  setCommandOpen: (open: boolean) => void
  setMobileNavOpen: (open: boolean) => void
  dismissBanner: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      mode: 'explorer',
      demoBannerDismissed: false,
      commandOpen: false,
      mobileNavOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
      setMode: (mode) => set({ mode }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      dismissBanner: () => set({ demoBannerDismissed: true }),
    }),
    {
      name: `${config.persistenceKey}.app`,
      partialize: (state) => ({
        theme: state.theme,
        mode: state.mode,
        demoBannerDismissed: state.demoBannerDismissed,
      }),
    },
  ),
)
