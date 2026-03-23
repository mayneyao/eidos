/**
 * @deprecated This hook is deprecated. Use `useSpaceTheme` from `@/apps/web-app/hooks/use-space-theme` instead.
 * Themes are now managed per-space. See theme-store.ts for migration guide.
 */

import { parseCSSVariables, setThemeVariables } from "@/lib/web/theme"

/**
 * Apply theme CSS to DOM
 * @param rawCss Theme CSS content
 * @param isDarkMode Whether to apply dark mode variables
 */
export const handleApplyTheme = (rawCss: string, isDarkMode: boolean) => {
  try {
    const lightMatch = /:root\s*{([^}]+)}/.exec(rawCss)
    const darkMatch = /\.dark\s*{([^}]+)}/.exec(rawCss)

    if (isDarkMode) {
      if (darkMatch) {
        setThemeVariables(parseCSSVariables(darkMatch[1], false))
      }
    } else if (lightMatch) {
      setThemeVariables(parseCSSVariables(lightMatch[1], false))
    }
  } catch (err) {
    console.error("Failed to apply theme variables:", err)
  }
}

/**
 * @deprecated Use `useSpaceTheme` instead
 */
export const useApplyThemeByName = () => {
  console.warn("useApplyThemeByName is deprecated. Use useSpaceTheme instead.")
  return {
    applyTheme: () => {},
    applyDarkModeSwitch: () => {},
  }
}
