export type SiteLocale = "en" | "zh"

export function parseSitePath(pathname: string) {
  const path = pathname.replace(/\/+$/u, "") || "/"
  const locale: SiteLocale = /^\/zh(?:\/|$)/u.test(path) ? "zh" : "en"
  return { locale, route: locale === "zh" ? path.slice(3) || "/" : path }
}

export function localizedPath(route: string, locale: SiteLocale) {
  return locale === "zh" ? `/zh${route === "/" ? "" : route}` : route
}
