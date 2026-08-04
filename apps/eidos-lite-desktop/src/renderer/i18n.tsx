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

const defaultLocale = resolveEidosLiteLocale("system", browserLocale())
const EidosLiteI18nContext = createContext<EidosLiteI18nContextValue>({
  locale: defaultLocale,
  language: "system",
  t: (message, values) => translateEidosLite(defaultLocale, message, values),
})

export function EidosLiteI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<EidosLiteLanguage>("system")

  useEffect(() => {
    void window.eidosLite
      .getPreferences()
      .then((preferences) => setLanguage(preferences.language))
    return window.eidosLite.onPreferencesChanged((preferences) =>
      setLanguage(preferences.language)
    )
  }, [])

  const locale = resolveEidosLiteLocale(language, browserLocale())
  const value = useMemo<EidosLiteI18nContextValue>(
    () => ({
      locale,
      language,
      t: (message, values) => translateEidosLite(locale, message, values),
    }),
    [language, locale]
  )

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
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
