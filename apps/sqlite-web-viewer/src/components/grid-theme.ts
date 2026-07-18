import { useLayoutEffect, useMemo, useState } from "react"
import { getDefaultTheme, type Theme } from "@glideapps/glide-data-grid"

function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim()
  if (!value) return fallback
  return /^(?:#|rgb|hsl|oklch|color\()/i.test(value) ? value : `hsl(${value})`
}

export function useViewerGridTheme(themeName: "light" | "dark"): Theme {
  const [revision, setRevision] = useState(0)
  useLayoutEffect(() => setRevision((current) => current + 1), [themeName])

  return useMemo(() => {
    const dark = themeName === "dark"
    const background = cssColor("background", dark ? "#191b20" : "#ffffff")
    const foreground = cssColor("foreground", dark ? "#f2f4f8" : "#111827")
    const muted = cssColor("muted", dark ? "#272a31" : "#f4f5f7")
    const mutedForeground = cssColor(
      "muted-foreground",
      dark ? "#9098a6" : "#667085"
    )
    const border = cssColor("border", dark ? "#343842" : "#e4e7ec")
    const primary = cssColor("primary", dark ? "#f2f4f8" : "#182230")
    const primaryForeground = cssColor(
      "primary-foreground",
      dark ? "#182230" : "#f8fafc"
    )
    return {
      ...getDefaultTheme(),
      accentColor: primary,
      accentFg: primaryForeground,
      accentLight: muted,
      baseFontStyle: "13px",
      bgBubble: muted,
      bgBubbleSelected: background,
      bgCell: background,
      bgCellMedium: muted,
      bgHeader: background,
      bgHeaderHasFocus: border,
      bgHeaderHovered: muted,
      borderColor: border,
      cellHorizontalPadding: 9,
      cellVerticalPadding: 3,
      drilldownBorder: border,
      editorFontSize: "13px",
      fgIconHeader: primaryForeground,
      fontFamily:
        '"Avenir Next", Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      headerFontStyle: "600 12px",
      headerIconSize: 16,
      lineHeight: 1.45,
      linkColor: primary,
      markerFontStyle: "11px",
      textBubble: foreground,
      textDark: foreground,
      textGroupHeader: foreground,
      textHeader: foreground,
      textHeaderSelected: primaryForeground,
      textLight: mutedForeground,
      textMedium: mutedForeground,
    }
  }, [revision, themeName])
}
