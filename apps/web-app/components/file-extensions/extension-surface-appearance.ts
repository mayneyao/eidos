import type { ExtensionSurfaceAppearance } from "@eidos.space/extension-surface-protocol"

function cssColor(
  style: CSSStyleDeclaration,
  variable: string,
  fallback: string
): string {
  const value = style.getPropertyValue(variable).trim()
  if (!value) return fallback
  if (/^(?:#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|color\()/i.test(value)) {
    return value
  }
  return `hsl(${value})`
}

export function readExtensionSurfaceAppearance(
  colorScheme: "light" | "dark"
): ExtensionSurfaceAppearance {
  const rootStyle = getComputedStyle(document.documentElement)
  const bodyStyle = getComputedStyle(document.body)
  return {
    colorScheme,
    locale: document.documentElement.lang || navigator.language || "en",
    theme: {
      background: cssColor(rootStyle, "--background", "#ffffff"),
      foreground: cssColor(rootStyle, "--foreground", "#111827"),
      mutedBackground: cssColor(rootStyle, "--muted", "#f3f4f6"),
      mutedForeground: cssColor(rootStyle, "--muted-foreground", "#6b7280"),
      border: cssColor(rootStyle, "--border", "#e5e7eb"),
      accent: cssColor(rootStyle, "--accent", "#f3f4f6"),
      accentForeground: cssColor(rootStyle, "--accent-foreground", "#111827"),
      destructive: cssColor(rootStyle, "--destructive", "#dc2626"),
      destructiveForeground: cssColor(
        rootStyle,
        "--destructive-foreground",
        "#ffffff"
      ),
      focusRing: cssColor(rootStyle, "--ring", "#2563eb"),
      fontFamily: bodyStyle.fontFamily || "system-ui, sans-serif",
      monoFontFamily:
        rootStyle.getPropertyValue("--font-mono").trim() ||
        "ui-monospace, SFMono-Regular, monospace",
    },
  }
}
