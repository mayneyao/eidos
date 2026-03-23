import { getCSSVariable } from "@/lib/web/theme"
import type { Theme } from "@glideapps/glide-data-grid"
import { useMemo } from "react"

const commonTheme: Partial<Theme> = {
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,
  headerIconSize: 18,
  headerFontStyle: "500 14px",
  baseFontStyle: "13px",
  fontFamily:
    "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
  editorFontSize: "13px",
  lineHeight: 1.4,
}

/**
 * Get theme color from CSS variables (applied by space-based theme system)
 * CSS variables are in format: --key: hsl(h s% l%) or --key: h s% l%
 */
const getThemeColor = (key: string): string => {
  const value = getCSSVariable(key)
  if (!value) return ""
  // If value already has hsl(), use it directly
  // Otherwise wrap it with hsl()
  if (value.startsWith("hsl(")) {
    return value
  }
  return `hsl(${value})`
}

export const useDynamicTheme = (theme: string) => {
  return useMemo(() => {
    return {
      ...commonTheme,
      accentColor: getThemeColor("primary"),
      accentFg: getThemeColor("primary-foreground"),
      accentLight: getThemeColor("secondary"),
      textDark: getThemeColor("foreground"),
      textMedium: getThemeColor("muted-foreground"),
      textLight: getThemeColor("muted-foreground"),
      textBubble: getThemeColor("foreground"),
      bgIconHeader: getThemeColor("muted-foreground"),
      fgIconHeader: getThemeColor("primary-foreground"),
      textHeader: getThemeColor("foreground"),
      textGroupHeader: getThemeColor("foreground"),
      textHeaderSelected: getThemeColor("primary-foreground"),
      bgCell: getThemeColor("background"),
      bgCellMedium: getThemeColor("secondary"),
      bgHeader: getThemeColor("background"),
      bgHeaderHasFocus: getThemeColor("border"),
      bgHeaderHovered: getThemeColor("muted"),
      bgBubble: getThemeColor("muted"),
      bgBubbleSelected: getThemeColor("background"),
      bgSearchResult: getThemeColor("muted"),
      borderColor: getThemeColor("border"),
      drilldownBorder: getThemeColor("border"),
      linkColor: getThemeColor("primary"),
      name: theme,
    }
  }, [theme])
}
