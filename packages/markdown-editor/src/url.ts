const SAFE_NAVIGATION_SCHEMES = new Set(["http", "https", "mailto", "tel"])

/** Restricts rendered navigation without preventing the host from inspecting raw targets. */
export function sanitizeMarkdownHref(href: string): string {
  const value = href.trim()
  if (!value || /[\u0000-\u001F\u007F]/.test(value)) return "about:blank"
  if (value.startsWith("//") || value.startsWith("\\\\")) {
    return "about:blank"
  }

  const scheme = value.match(/^([A-Za-z][A-Za-z\d+.-]*):/)?.[1]?.toLowerCase()
  if (scheme && !SAFE_NAVIGATION_SCHEMES.has(scheme)) return "about:blank"
  return value
}
