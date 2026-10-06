import english from "../locales/en.json"

export type MobileLocale = "zh" | "en"
export function resolveMobileLocale(language: string): MobileLocale {
  return language.toLowerCase().split(/[-_]/)[0] === "zh" ? "zh" : "en"
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

export function mobileText(source: string): string {
  return locale === "en"
    ? ((english as Record<string, string>)[source] ?? source)
    : source
}
