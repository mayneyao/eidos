import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { localizedPath, parseSitePath, type SiteLocale } from "./routes"

const LocaleContext = createContext({
  locale: "en" as SiteLocale,
  route: "/",
  t: (en: string, _zh: string) => en,
  href: (route: string) => route,
  toggleLanguage: () => {},
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(() =>
    parseSitePath(window.location.pathname)
  )
  useEffect(() => {
    const update = () => setLocation(parseSitePath(window.location.pathname))
    window.addEventListener("popstate", update)
    return () => window.removeEventListener("popstate", update)
  }, [])
  useEffect(() => {
    document.documentElement.lang = location.locale === "zh" ? "zh-CN" : "en"
  }, [location.locale])
  function toggleLanguage() {
    const locale = location.locale === "en" ? "zh" : "en"
    // Keep mounted editors and their unsaved drafts. Translated headings have
    // different IDs, so do not carry an obsolete fragment into the other language.
    window.history.pushState(
      null,
      "",
      localizedPath(location.route, locale) + window.location.search
    )
    setLocation({ ...location, locale })
  }
  return (
    <LocaleContext.Provider
      value={{
        ...location,
        t: (en, zh) => (location.locale === "zh" ? zh : en),
        href: (route) => localizedPath(route, location.locale),
        toggleLanguage,
      }}
    >
      {children}
    </LocaleContext.Provider>
  )
}

export const useSiteLocale = () => useContext(LocaleContext)

export function LanguageSwitch() {
  const { locale, toggleLanguage } = useSiteLocale()
  return (
    <button
      type="button"
      className="site-theme-toggle"
      onClick={toggleLanguage}
      aria-label={locale === "en" ? "切换到中文" : "Switch to English"}
      lang={locale === "en" ? "zh-CN" : "en"}
    >
      {locale === "en" ? "中文" : "English"}
    </button>
  )
}
