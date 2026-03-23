/**
 * @deprecated This store is deprecated. Use `useSpaceTheme` hook from `@/apps/web-app/hooks/use-space-theme` instead.
 *
 * Migration guide:
 * - `currentThemeName` → `useSpaceTheme().currentTheme`
 * - `customThemes` → `useSpaceTheme().themes`
 * - `applyTheme(name, css)` → `useSpaceTheme().installTheme(name, css)` then `useSpaceTheme().applyTheme(name)`
 * - `setCurrentThemeName(name)` → `useSpaceTheme().applyTheme(name)`
 *
 * Themes are now stored per-space in `~/.eidos/themes/` instead of global state.
 */

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { createBackendSyncStorage } from "@/lib/storage/backend-sync"

export interface CustomTheme {
  name: string
  css: string
}

interface ThemeState {
  currentThemeName: string
  customThemes: CustomTheme[]
  setCurrentThemeName: (name: string) => void
  addCustomTheme: (theme: CustomTheme) => void
  removeCustomTheme: (name: string) => void
  getCustomTheme: (name: string) => CustomTheme | undefined
  listThemes: () => CustomTheme[]
  setCustomTheme: (name: string, css: string) => void
  applyTheme: (name: string, css: string) => void
}

const defaultThemeState = {
  currentThemeName: "Default",
  customThemes: [],
}

const themeStorage = createBackendSyncStorage<ThemeState>({
  backendConfigKey: "theme",
  getBackendState: (state: ThemeState) => state,
  defaultBackendState: defaultThemeState,
})

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      ...defaultThemeState,
      setCurrentThemeName: (name: string) => {
        set({ currentThemeName: name })
      },
      addCustomTheme: (theme: CustomTheme) => {
        const { customThemes } = get()
        const existingIndex = customThemes.findIndex(
          (t) => t.name === theme.name
        )

        if (existingIndex !== -1) {
          // Update existing theme
          const updatedThemes = [...customThemes]
          updatedThemes[existingIndex] = theme
          set({ customThemes: updatedThemes })
        } else {
          // Add new theme
          set({ customThemes: [...customThemes, theme] })
        }
      },
      removeCustomTheme: (name: string) => {
        const { customThemes } = get()
        set({
          customThemes: customThemes.filter((theme) => theme.name !== name),
        })
      },
      getCustomTheme: (name: string) => {
        const { customThemes } = get()
        return customThemes.find((theme) => theme.name === name)
      },
      listThemes: () => {
        const { customThemes } = get()
        console.log("listThemes", customThemes)
        return customThemes
      },
      setCustomTheme: (name: string, css: string) => {
        const { customThemes } = get()
        const existingIndex = customThemes.findIndex((t) => t.name === name)
        if (existingIndex !== -1) {
          const updatedThemes = [...customThemes]
          updatedThemes[existingIndex] = { name, css }
          set({ customThemes: updatedThemes })
        } else {
          set({ customThemes: [...customThemes, { name, css }] })
        }
      },
      applyTheme: (name: string, css: string) => {
        get().setCustomTheme(name, css)
        get().setCurrentThemeName(name)
      },
    }),
    {
      name: "theme-storage",
      storage: createJSONStorage(() => themeStorage),
    }
  )
)
