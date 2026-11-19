import english from "../locales/en.json"
import brazilianPortuguese from "../locales/pt-BR.json"

export type MobileLocale = "zh" | "en" | "pt-BR"
export function resolveMobileLocale(language: string): MobileLocale {
  const primary = language.toLowerCase().split(/[-_]/)[0]
  if (primary === "zh") return "zh"
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
  return locale === "zh" ? "zh-CN" : locale
}

const ptBR: Record<string, string> = brazilianPortuguese

export function mobileText(source: string): string {
  if (locale === "zh") return source
  const fallback = (english as Record<string, string>)[source] ?? source
  return locale === "pt-BR" ? (ptBR[source] ?? fallback) : fallback
}
