import type { PluginManifest, PluginPackage } from "./contracts"
import { createPluginI18n, pluginLocaleCandidates } from "./guest-i18n.js"
export { createPluginI18n, pluginLocaleCandidates } from "./guest-i18n.js"

export type PluginMessages = Record<string, Record<string, string>>
export interface PluginLanguageData {
  defaultLocale: string
  messages: PluginMessages
}
export function parsePluginLanguageData(value: unknown): PluginLanguageData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid localization")
  const data = value as PluginLanguageData
  if (
    typeof data.defaultLocale !== "string" ||
    canonicalPluginLocale(data.defaultLocale) !== data.defaultLocale ||
    !data.messages ||
    typeof data.messages !== "object" ||
    Array.isArray(data.messages) ||
    !Object.hasOwn(data.messages, data.defaultLocale) ||
    Object.keys(data.messages).length > 32
  )
    throw new Error("Invalid localization")
  for (const [locale, messages] of Object.entries(data.messages)) {
    if (
      canonicalPluginLocale(locale) !== locale ||
      !messages ||
      typeof messages !== "object" ||
      Array.isArray(messages) ||
      Object.keys(messages).length > 4096 ||
      Object.entries(messages).some(
        ([key, message]) =>
          !/^[a-zA-Z][\w.-]{0,127}$/.test(key) ||
          typeof message !== "string" ||
          message.length > 4096 ||
          /[\u0000-\u001f\u007f]/.test(message)
      )
    )
      throw new Error("Invalid localization messages")
  }
  return structuredClone(data)
}

export function canonicalPluginLocale(locale: string): string {
  return Intl.getCanonicalLocales(locale)[0]
}

export function pluginResourcePaths(manifest: PluginManifest): string[] {
  return [
    ...new Set([
      ...Object.values(manifest.i18n?.messages ?? {}),
      ...Object.values(manifest.i18n?.readme ?? {}),
    ]),
  ]
}

export function pluginLanguageData(
  manifest: PluginManifest,
  resources: Record<string, string> = {}
): PluginLanguageData {
  const messages: PluginMessages = {}
  for (const [locale, path] of Object.entries(manifest.i18n?.messages ?? {})) {
    messages[locale] = JSON.parse(resources[path]) as Record<string, string>
  }
  return { defaultLocale: manifest.i18n?.defaultLocale ?? "en", messages }
}

/** Resolve only display fields; never translate IDs, code, paths, settings values or grants. */
export function localizePluginManifest(
  manifest: PluginManifest,
  data: PluginLanguageData,
  locale: string,
  resolve?: (key: string) => string
): PluginManifest {
  if (!manifest.i18n) return manifest
  const i18n = createPluginI18n(data, locale)
  const label = (text: string) =>
    /^%[^%]+%$/.test(text) ? (resolve ?? i18n.t)(text.slice(1, -1)) : text
  const result = structuredClone(manifest)
  const translate = (item: {
    title?: string
    description?: string
    name?: string
  }) => {
    if (item.title) item.title = label(item.title)
    if (item.description) item.description = label(item.description)
    if (item.name) item.name = label(item.name)
  }
  translate(result)
  for (const item of [
    ...(result.views ?? []),
    ...(result.actions ?? []),
    ...(result.formatters ?? []),
    ...(result.hooks ?? []),
    ...(result.fileTemplates ?? []),
    ...Object.values(result.settings ?? {}),
    ...Object.values(result.connections ?? {}),
  ])
    translate(item)
  for (const view of result.views ?? []) {
    if (view.configuration) {
      for (const item of Object.values(view.configuration.properties))
        translate(item)
    }
  }
  return result
}

export interface PluginReadme {
  content: string
  locale: string | null
  fallback: boolean
  source: string
}
export function localizedPluginReadme(
  pkg: PluginPackage,
  locale: string
): PluginReadme | null {
  if (!pkg.manifest.i18n?.readme) return null
  const { defaultLocale, readme } = pkg.manifest.i18n
  for (const candidate of pluginLocaleCandidates(locale, defaultLocale)) {
    const path = readme[candidate]
    if (path && pkg.resources?.[path] !== undefined)
      return {
        content: pkg.resources[path],
        locale: candidate,
        fallback:
          candidate === defaultLocale &&
          !pluginLocaleCandidates(locale, locale).includes(candidate),
        source: path,
      }
  }
  return null
}
