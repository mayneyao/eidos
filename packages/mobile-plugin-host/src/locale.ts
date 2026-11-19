import english from "../locales/en.json"
import brazilianPortuguese from "../locales/pt-BR.json"
import japanese from "../locales/ja.json"
import korean from "../locales/ko.json"

export type MobileLocale = "zh" | "en" | "pt-BR" | "ja" | "ko"
const catalogs: Record<Exclude<MobileLocale, "zh">, Record<string, string>> = {
  en: english,
  "pt-BR": brazilianPortuguese,
  ja: japanese,
  ko: korean,
}

export function resolveMobileLocale(language: string): MobileLocale {
  const primary = language.toLowerCase().split(/[-_]/)[0]
  if (primary === "zh" || primary === "ja" || primary === "ko") return primary
  if (primary === "pt") return "pt-BR"
  return "en"
}

let locale = resolveMobileLocale(
  document.querySelector<HTMLMetaElement>('meta[name="eidos-locale"]')
    ?.content || navigator.language
)
document.documentElement.lang = locale
const listeners = new Set<() => void>()
export function setMobileLocale(language: string) {
  const next = resolveMobileLocale(language)
  document.documentElement.lang = next
  if (next === locale) return
  locale = next
  listeners.forEach((listener) => listener())
}
declare global {
  interface Window {
    eidosSetLocale?: typeof setMobileLocale
  }
}
window.eidosSetLocale = setMobileLocale

export function subscribeMobileLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getMobileLocale(): MobileLocale {
  return locale
}

export function getMobileLocaleTag(): string {
  switch (locale) {
    case "zh":
      return "zh-CN"
    case "ja":
      return "ja-JP"
    case "ko":
      return "ko-KR"
    default:
      return locale
  }
}

export function mobileText(source: string): string {
  if (locale === "zh") return source
  return catalogs[locale][source] ?? catalogs.en[source] ?? source
}
