import { getCSSVariable, getThemeVariables } from "@/lib/web/theme"
import defaultThemeCss from "@/styles/themes/default.css?raw"
import type { Theme } from "@glideapps/glide-data-grid"
import { useLayoutEffect, useMemo, useState } from "react"

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

export const useDynamicTheme = (theme: string, themeCss?: string | null) => {
  const isDarkMode = theme === "dark"
  const [lastResolvedTheme, setLastResolvedTheme] = useState(theme)

  // Use layout effect to trigger a re-render after the DOM has updated (class changes)
  // This ensures that getCSSVariable calls inside the renderer will get the correct values
  useLayoutEffect(() => {
    setLastResolvedTheme(theme)
  }, [theme])

  const themeVars = useMemo(() => {
    // If we have custom theme CSS, use it
    if (themeCss) {
      return getThemeVariables(themeCss, isDarkMode)
    }
    // Otherwise, parse the default theme CSS to get variables for the current mode immediately
    return getThemeVariables(defaultThemeCss, isDarkMode)
  }, [themeCss, isDarkMode])

  return useMemo(() => {
    const getThemeColor = (key: string): string => {
      // 1. Try parsed theme variables (instant)
      // 2. Fallback to reading from CSS variables in DOM (accurate after DOM updates)
      const value = (themeVars && themeVars[key]) || getCSSVariable(key)
      if (!value) return ""
      // If value already has hsl(), use it directly
      // Otherwise wrap it with hsl()
      if (value.startsWith("hsl(")) {
        return value
      }
      return `hsl(${value})`
    }

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
  }, [theme, themeVars, lastResolvedTheme])
}
