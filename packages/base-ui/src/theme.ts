import { useLayoutEffect, useMemo, useState } from "react"
import { getDefaultTheme, type Theme } from "@glideapps/glide-data-grid"

import type { BaseUIThemeName } from "./context"

const commonTheme = {
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,
  headerIconSize: 18,
  headerFontStyle: "500 14px",
  baseFontStyle: "13px",
  markerFontStyle: "12px",
  fontFamily:
    "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
  editorFontSize: "13px",
  lineHeight: 1.4,
}

const fallback = {
  light: {
    background: "#ffffff",
    foreground: "#37352f",
    muted: "#f1f1ef",
    mutedForeground: "#787774",
    border: "#e9e9e7",
    primary: "#37352f",
    primaryForeground: "#ffffff",
  },
  dark: {
    background: "#191919",
    foreground: "#ebebeb",
    muted: "#2b2b2b",
    mutedForeground: "#9b9b9b",
    border: "#333333",
    primary: "#ebebeb",
    primaryForeground: "#191919",
  },
} as const

function cssColor(name: string, fallbackValue: string): string {
  if (typeof document === "undefined") return fallbackValue
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim()
  if (!raw) return fallbackValue
  if (/^(?:#|rgb|hsl|oklch|color\()/i.test(raw)) return raw
  return `hsl(${raw})`
}

export function useBaseGridTheme(themeName: BaseUIThemeName): Theme {
  const [revision, setRevision] = useState(0)
  useLayoutEffect(() => {
    setRevision((current) => current + 1)
  }, [themeName])

  return useMemo(() => {
    const colors = fallback[themeName]
    const background = cssColor("background", colors.background)
    const foreground = cssColor("foreground", colors.foreground)
    const muted = cssColor("muted", colors.muted)
    const mutedForeground = cssColor("muted-foreground", colors.mutedForeground)
    const border = cssColor("border", colors.border)
    const primary = cssColor("primary", colors.primary)
    const primaryForeground = cssColor(
      "primary-foreground",
      colors.primaryForeground
    )
    return {
      ...getDefaultTheme(),
      ...commonTheme,
      accentColor: primary,
      accentFg: primaryForeground,
      accentLight: cssColor("secondary", muted),
      textDark: foreground,
      textMedium: mutedForeground,
      textLight: mutedForeground,
      textBubble: foreground,
      bgIconHeader: mutedForeground,
      fgIconHeader: primaryForeground,
      textHeader: foreground,
      textGroupHeader: foreground,
      textHeaderSelected: primaryForeground,
      bgCell: background,
      bgCellMedium: muted,
      bgHeader: background,
      bgHeaderHasFocus: border,
      bgHeaderHovered: muted,
      bgBubble: muted,
      bgBubbleSelected: background,
      bgSearchResult: muted,
      borderColor: border,
      drilldownBorder: border,
      linkColor: primary,
      name: themeName,
    } satisfies Theme & { name: BaseUIThemeName }
  }, [revision, themeName])
}
