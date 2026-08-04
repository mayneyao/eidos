import { useLayoutEffect, useMemo, useState, type RefObject } from "react"
import { getDefaultTheme, type Theme } from "@glideapps/glide-data-grid"

import type { EidosFileUIThemeName } from "./context"

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
    background: "oklch(0.982 0.006 255)",
    foreground: "oklch(0.25 0.018 255)",
    muted: "oklch(0.95 0.009 255)",
    mutedForeground: "oklch(0.52 0.02 255)",
    accent: "oklch(0.92 0.022 255)",
    border: "oklch(0.88 0.012 255)",
    primary: "oklch(0.43 0.09 255)",
    primaryForeground: "oklch(0.985 0.005 255)",
  },
  dark: {
    background: "oklch(0.21 0.014 255)",
    foreground: "oklch(0.92 0.01 255)",
    muted: "oklch(0.275 0.016 255)",
    mutedForeground: "oklch(0.69 0.02 255)",
    accent: "oklch(0.31 0.025 255)",
    border: "oklch(0.34 0.017 255)",
    primary: "oklch(0.76 0.08 255)",
    primaryForeground: "oklch(0.2 0.018 255)",
  },
} as const

function matchingParen(value: string, openIndex: number): number {
  let depth = 0
  for (let index = openIndex; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1
    if (value[index] === ")") {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1
    if (value[index] === ")") depth -= 1
    if (value[index] === "," && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts
}

function resolveFunction(
  value: string,
  functionName: "var" | "light-dark",
  replacement: (body: string) => string
): string {
  const marker = `${functionName}(`
  let resolved = ""
  let cursor = 0
  while (cursor < value.length) {
    const functionIndex = value.indexOf(marker, cursor)
    if (functionIndex < 0) return resolved + value.slice(cursor)
    const openIndex = functionIndex + functionName.length
    const closeIndex = matchingParen(value, openIndex)
    if (closeIndex < 0) return resolved + value.slice(cursor)
    resolved += value.slice(cursor, functionIndex)
    resolved += replacement(value.slice(openIndex + 1, closeIndex))
    cursor = closeIndex + 1
  }
  return resolved
}

function resolveCssValue(
  styles: CSSStyleDeclaration,
  value: string,
  themeName: EidosFileUIThemeName,
  seen: ReadonlySet<string> = new Set()
): string {
  const variablesResolved = resolveFunction(value, "var", (body) => {
    const [variableName, fallbackValue = ""] = splitTopLevel(body)
    if (!variableName?.startsWith("--") || seen.has(variableName)) {
      return fallbackValue
        ? resolveCssValue(styles, fallbackValue, themeName, seen)
        : ""
    }
    const variableValue = styles.getPropertyValue(variableName).trim()
    if (!variableValue) {
      return fallbackValue
        ? resolveCssValue(styles, fallbackValue, themeName, seen)
        : ""
    }
    const nextSeen = new Set(seen)
    nextSeen.add(variableName)
    return resolveCssValue(styles, variableValue, themeName, nextSeen)
  })
  return resolveFunction(variablesResolved, "light-dark", (body) => {
    const [lightValue = "", darkValue = lightValue] = splitTopLevel(body)
    return resolveCssValue(
      styles,
      themeName === "dark" ? darkValue : lightValue,
      themeName,
      seen
    )
  }).trim()
}

function cssColor(
  styles: CSSStyleDeclaration | null,
  name: string,
  fallbackValue: string,
  themeName: EidosFileUIThemeName
): string {
  if (!styles) return fallbackValue
  const raw = styles.getPropertyValue(`--${name}`).trim()
  if (!raw) return fallbackValue
  const resolved = resolveCssValue(styles, raw, themeName)
  if (!resolved) return fallbackValue
  if (
    /^(?:#|[a-z]+$|(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color|color-mix)\()/i.test(
      resolved
    )
  ) {
    return resolved
  }
  return `hsl(${resolved})`
}

function themeSource(
  elementRef?: RefObject<HTMLElement | null>
): HTMLElement | null {
  if (typeof document === "undefined") return null
  const element = elementRef?.current
  return (
    element?.closest<HTMLElement>("[data-eidos-file-root]") ??
    document.documentElement
  )
}

export function resolveEidosFileGridTheme(
  themeName: EidosFileUIThemeName,
  source: HTMLElement | null = typeof document === "undefined"
    ? null
    : document.documentElement
): Theme & { name: EidosFileUIThemeName } {
  const colors = fallback[themeName]
  const styles = source ? getComputedStyle(source) : null
  const background = cssColor(
    styles,
    "background",
    colors.background,
    themeName
  )
  const foreground = cssColor(
    styles,
    "foreground",
    colors.foreground,
    themeName
  )
  const muted = cssColor(styles, "muted", colors.muted, themeName)
  const mutedForeground = cssColor(
    styles,
    "muted-foreground",
    colors.mutedForeground,
    themeName
  )
  const accent = cssColor(styles, "accent", colors.accent, themeName)
  const border = cssColor(styles, "border", colors.border, themeName)
  const primary = cssColor(styles, "primary", colors.primary, themeName)
  const primaryForeground = cssColor(
    styles,
    "primary-foreground",
    colors.primaryForeground,
    themeName
  )
  return {
    ...getDefaultTheme(),
    ...commonTheme,
    accentColor: primary,
    accentFg: primaryForeground,
    accentLight: accent,
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
    bgHeaderHasFocus: accent,
    bgHeaderHovered: muted,
    bgBubble: muted,
    bgBubbleSelected: background,
    bgSearchResult: accent,
    borderColor: border,
    drilldownBorder: border,
    linkColor: primary,
    name: themeName,
  } satisfies Theme & { name: EidosFileUIThemeName }
}

export function useEidosFileGridThemeForElement(
  themeName: EidosFileUIThemeName,
  elementRef?: RefObject<HTMLElement | null>
): Theme & { name: EidosFileUIThemeName } {
  const [revision, setRevision] = useState(0)
  useLayoutEffect(() => {
    const source = themeSource(elementRef)
    setRevision((current) => current + 1)
    if (typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(() =>
      setRevision((current) => current + 1)
    )
    if (source) {
      observer.observe(source, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      })
    }
    if (document.documentElement !== source) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      })
    }
    return () => observer.disconnect()
  }, [elementRef, themeName])

  return useMemo(
    () => resolveEidosFileGridTheme(themeName, themeSource(elementRef)),
    [elementRef, revision, themeName]
  )
}
