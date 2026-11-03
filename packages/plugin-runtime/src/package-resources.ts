import type { PluginManifest } from "./contracts"
import { record } from "./manifest"
import { parseJson } from "./json"
import { invalid } from "./errors"
import {
  pluginResourcePaths,
  pluginLanguageData,
  localizePluginManifest,
} from "./i18n"

/** Shared by native WebView and Node package readers. */
export function validatePluginResources(
  manifest: PluginManifest,
  value: unknown
): Record<string, string> {
  const raw = record(value)
  const paths = pluginResourcePaths(manifest)
  if (
    Object.keys(raw).length !== paths.length ||
    paths.some(
      (path) =>
        typeof raw[path] !== "string" ||
        new TextEncoder().encode(raw[path] as string).byteLength > 1024 * 1024
    )
  )
    invalid(
      "Package resources must match declared localization files (at most 1 MiB each)"
    )
  const resources = raw as Record<string, string>
  for (const resource of Object.values(manifest.i18n!.messages)) {
    const messages = record(parseJson(resources[resource]))
    if (
      Object.keys(messages).length > 4096 ||
      Object.entries(messages).some(
        ([key, value]) =>
          !/^[a-zA-Z][\w.-]{0,127}$/.test(key) ||
          typeof value !== "string" ||
          value.length > 4096 ||
          /[\u0000-\u001f\u007f]/.test(value)
      )
    )
      invalid("Invalid plugin messages")
  }
  const data = pluginLanguageData(manifest, resources)
  localizePluginManifest(manifest, data, data.defaultLocale, (key) => {
    if (!Object.hasOwn(data.messages[data.defaultLocale], key))
      invalid(`Missing default message: ${key}`)
    return data.messages[data.defaultLocale][key]
  })
  return resources
}
