/** Theme plugins can override semantic host roles, never selectors or arbitrary CSS. */
export const THEME_TOKEN_PROPERTIES = {
  "--theme-surface": "color",
  "--theme-ink": "color",
  "--theme-accent": "color",
  "--theme-success": "color",
  "--theme-warning": "color",
  "--theme-danger": "color",
  "--theme-neutral": "color",
  "--canvas": "color",
  "--lite-sidebar": "color",
  "--sidebar-strong": "color",
  "--surface-hover": "color",
  "--surface-active": "color",
  "--surface-selected": "color",
  "--ink": "color",
  "--ink-muted": "color",
  "--ink-faint": "color",
  "--line": "color",
  "--hairline": "color",
  "--lite-accent": "color",
  "--accent-strong": "color",
  "--accent-contrast": "color",
  "--primary-action-hover": "color",
  "--focus": "color",
  "--control-fill": "color",
  "--control-border": "color",
  "--font-ui": "font-family",
  "--font-code": "font-family",
  "--font-editorial": "font-family",
  "--font-size-ui": "font-size",
  "--font-size-code": "font-size",
  "--chrome-header-height": "height",
  "--control-radius": "border-radius",
} as const

export function validThemeToken(key: string, value: unknown): value is string {
  const property =
    THEME_TOKEN_PROPERTIES[key as keyof typeof THEME_TOKEN_PROPERTIES]
  if (
    !property ||
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 256 ||
    /[;{}<>\\\u0000-\u001f\u007f]|url\s*\(|var\s*\(|!important|@/i.test(value)
  )
    return false
  if (property === "color") return /^[#A-Za-z0-9.,%()/+ -]+$/.test(value)
  if (property === "font-family") return /^[A-Za-z0-9 ,"'-]+$/.test(value)
  const match = /^(\d+(?:\.\d+)?)(px|rem|em)$/.exec(value)
  if (!match) return false
  const number = Number(match[1])
  const pixels = match[2] === "px" ? number : number * 16
  if (key === "--control-radius") return pixels <= 16
  if (key === "--chrome-header-height") return pixels >= 30 && pixels <= 64
  return pixels >= 10 && pixels <= 24
}

export function themeFontData(source: string): boolean {
  const match =
    /^data:font\/(woff2?|ttf|otf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source)
  if (!match || source.length > 3 * 1024 * 1024) return false
  const bytes = Buffer.from(match[2], "base64")
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) return false
  const magic = bytes.subarray(0, 4).toString("latin1")
  return (
    (match[1] === "woff2" && magic === "wOF2") ||
    (match[1] === "woff" && magic === "wOFF") ||
    (match[1] === "otf" && magic === "OTTO") ||
    (match[1] === "ttf" &&
      bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])))
  )
}
