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
    // Parse both light and dark mode variables
    // Note: keep hsl() wrapper when setting CSS variables
    const lightMatch = /:root\s*{([^}]+)}/.exec(rawCss)
    const darkMatch = /\.dark\s*{([^}]+)}/.exec(rawCss)
    if (!lightMatch && !darkMatch) {
      throw new Error(
        "No valid theme definitions found. Please ensure your CSS includes both :root {...} and .dark {...} blocks."
      )
    }
    if (isDarkMode) {
      if (darkMatch) {
        const darkVariables = parseCSSVariables(darkMatch[1], false)
        setThemeVariables(darkVariables)
      }
    } else if (lightMatch) {
      const lightVariables = parseCSSVariables(lightMatch[1], false)
      setThemeVariables(lightVariables)
    }
  } catch (err) {}
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
