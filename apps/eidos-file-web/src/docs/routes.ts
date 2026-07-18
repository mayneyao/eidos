import type { Locale } from "../i18n"

export interface EidosFileDocsRoute {
  locale: Locale
  slug: string
}

export function eidosFileDocsPath(slug: string, locale: Locale): string {
  const prefix = locale === "zh" ? "/zh" : ""
  return slug === "overview"
    ? `${prefix}/docs/`
    : `${prefix}/docs/${encodeURIComponent(slug)}/`
}

export function eidosFileDocsRouteFromPathname(
  pathname: string
): EidosFileDocsRoute | null {
  const match = /^\/(?:(zh)\/)?docs(?:\/([^/?#]+))?\/?$/.exec(pathname)
  if (!match) return null

  try {
    return {
      locale: match[1] === "zh" ? "zh" : "en",
      slug: decodeURIComponent(match[2] ?? "overview"),
    }
  } catch {
    return null
  }
}

export function legacyEidosFileDocsSlugFromHash(hash: string): string | null {
  const match = /^#\/docs(?:\/([^#?]+))?/.exec(hash)
  if (!match) return null

  try {
    return decodeURIComponent(match[1] ?? "overview")
  } catch {
    return null
  }
}
