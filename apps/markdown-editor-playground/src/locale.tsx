import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

const currentLocale = () =>
  /^\/zh(?:\/|$)/u.test(window.location.pathname)
    ? ("zh" as const)
    : ("en" as const)
const LocaleContext = createContext({
  locale: "en" as "en" | "zh",
  t: (en: string, _zh: string) => en,
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(currentLocale)
  useEffect(() => {
    const update = () => setLocale(currentLocale())
    window.addEventListener("popstate", update)
    return () => window.removeEventListener("popstate", update)
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  }, [locale])
  return (
    <LocaleContext.Provider
      value={{
        locale,
        t: (en, zh) => (locale === "zh" ? zh : en),
      }}
    >
      {children}
    </LocaleContext.Provider>
  )
}

export const useSiteLocale = () => useContext(LocaleContext)
