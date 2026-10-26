import type { PluginI18n } from "./contracts"
import type { PluginLanguageData } from "./i18n"
export function pluginLocaleCandidates(
  locale: string,
  fallback: string
): string[]
export function createPluginI18n(
  data: PluginLanguageData,
  initialLocale: string,
  candidates?: typeof pluginLocaleCandidates
): PluginI18n & { setLocale(locale: string): void }
