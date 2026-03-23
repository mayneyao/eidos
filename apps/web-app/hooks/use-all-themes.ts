/**
 * @deprecated These hooks are deprecated. Use `useSpaceTheme` from `@/apps/web-app/hooks/use-space-theme` instead.
 *
 * Themes are now managed per-space. See theme-store.ts for migration guide.
 */

import { useMemo } from "react"
import { useThemeStore } from "@/apps/web-app/store/theme-store"
import { presetThemes } from "./use-apply-theme-by-name"

export const useAllThemes = () => {
  const { customThemes } = useThemeStore()
  return useMemo(() => {
    return [...presetThemes, ...(customThemes || [])]
  }, [customThemes])
}

export const useCurrentTheme = () => {
  const { currentThemeName } = useThemeStore()
  const allThemes = useAllThemes()
  return useMemo(() => {
    return allThemes.find((t) => t.name === currentThemeName)
  }, [currentThemeName, allThemes])
}
