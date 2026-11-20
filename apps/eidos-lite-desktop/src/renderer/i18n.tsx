import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import type { EidosLiteLanguage } from "../shared/contracts"
import {
  resolveEidosLiteLocale,
  translateEidosLite,
  type EidosLiteLocale,
  type EidosLiteMessageValues,
} from "../shared/i18n"

interface EidosLiteI18nContextValue {
  locale: EidosLiteLocale
  language: EidosLiteLanguage
  t(message: string, values?: EidosLiteMessageValues): string
}

function browserLocale(): string {
  return navigator.languages[0] ?? navigator.language ?? "en"
}

function initialSystemLocale(): string {
  return globalThis.window?.eidosLite?.systemLocale ?? browserLocale()
}

const defaultLocale = resolveEidosLiteLocale("system", initialSystemLocale())
const EidosLiteI18nContext = createContext<EidosLiteI18nContextValue>({
  locale: defaultLocale,
  language: "system",
  t: (message, values) => translateEidosLite(defaultLocale, message, values),
})

export function EidosLiteI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<EidosLiteLanguage>("system")
  const [systemLocale, setSystemLocale] = useState(initialSystemLocale)

  useEffect(() => {
    const update = () => {
      if (window.eidosLite?.systemLocale === undefined) {
        setSystemLocale(browserLocale())
        return
      }
      void window.eidosLite.getAppInfo().then(
        ({ systemLocale }) => {
          if (systemLocale !== undefined) setSystemLocale(systemLocale)
        },
        () => {}
      )
    }
    window.addEventListener("languagechange", update)
    return () => window.removeEventListener("languagechange", update)
  }, [])

  useEffect(() => {
    void window.eidosLite
      .getPreferences()
      .then((preferences) => setLanguage(preferences.language))
    return window.eidosLite.onPreferencesChanged((preferences) =>
      setLanguage(preferences.language)
    )
  }, [])

  const locale = resolveEidosLiteLocale(language, systemLocale)
  const value = useMemo<EidosLiteI18nContextValue>(
    () => ({
      locale,
      language,
      t: (message, values) => translateEidosLite(locale, message, values),
    }),
    [language, locale]
  )

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale
  }, [locale])

  return (
    <EidosLiteI18nContext.Provider value={value}>
      {children}
    </EidosLiteI18nContext.Provider>
  )
}

export function useEidosLiteI18n(): EidosLiteI18nContextValue {
  return useContext(EidosLiteI18nContext)
}
