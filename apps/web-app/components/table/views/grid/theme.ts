import { useCurrentTheme } from "@/apps/web-app/hooks/use-all-themes"
import { useThemeStore } from "@/apps/web-app/store/theme-store"
import { getThemeVariables } from "@/lib/web/theme"
import type { Theme } from "@glideapps/glide-data-grid"
import { useCallback, useMemo } from "react"

const commonTheme: Partial<Theme> = {
  cellHorizontalPadding: 8,
  cellVerticalPadding: 3,

  headerIconSize: 18,

  headerFontStyle: "500 14px",
  baseFontStyle: "13px",
  fontFamily:
    "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
  editorFontSize: "13px",
  lineHeight: 1.4, //unitless scaler depends on your font
}

export const useDynamicTheme = (theme: string) => {
  const { currentThemeName } = useThemeStore()
  const currentTheme = useCurrentTheme()
  const getCSSVariable = useCallback(
    (key: string) => {
      const variables = getThemeVariables(
        currentTheme?.css || "",
        theme === "dark"
      )
      return variables?.[key] || ""
    },
    [currentTheme, theme]
  )

  return useMemo(() => {
    return {
      ...commonTheme,
      accentColor: `hsl(${getCSSVariable("primary")})`,
      accentFg: `hsl(${getCSSVariable("primary-foreground")})`,
      accentLight: `hsl(${getCSSVariable("secondary")})`,
      textDark: `hsl(${getCSSVariable("foreground")})`,
      textMedium: `hsl(${getCSSVariable("muted-foreground")})`,
      textLight: `hsl(${getCSSVariable("muted-foreground")})`,
      textBubble: `hsl(${getCSSVariable("foreground")})`,
      bgIconHeader: `hsl(${getCSSVariable("muted-foreground")})`,
      fgIconHeader: `hsl(${getCSSVariable("primary-foreground")})`,
      textHeader: `hsl(${getCSSVariable("foreground")})`,
      textGroupHeader: `hsl(${getCSSVariable("foreground")})`,
      textHeaderSelected: `hsl(${getCSSVariable("primary-foreground")})`,
      bgCell: `hsl(${getCSSVariable("background")})`,
      bgCellMedium: `hsl(${getCSSVariable("secondary")})`,
      bgHeader: `hsl(${getCSSVariable("background")})`,
      bgHeaderHasFocus: `hsl(${getCSSVariable("border")})`,
      bgHeaderHovered: `hsl(${getCSSVariable("muted")})`,
      bgBubble: `hsl(${getCSSVariable("muted")})`,
      bgBubbleSelected: `hsl(${getCSSVariable("background")})`,
      bgSearchResult: `hsl(${getCSSVariable("muted")})`,
      borderColor: `hsl(${getCSSVariable("border")})`,
      drilldownBorder: `hsl(${getCSSVariable("border")})`,
      linkColor: `hsl(${getCSSVariable("primary")})`,
      name: theme,
    }
  }, [currentThemeName, getCSSVariable, theme])
}
