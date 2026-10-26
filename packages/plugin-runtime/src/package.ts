import { createHash } from "node:crypto"
import { gzipSync, gunzipSync } from "node:zlib"
import type { PluginManifest, PluginPackage } from "./contracts"
export type { PluginPackage } from "./contracts"
import { PACKAGE_LIMIT, PluginError, invalid } from "./errors"
import { parseManifest, record } from "./manifest"
import { parseJson } from "./json"
import { validateSource } from "./source"
import { loadEsbuild, loadTypeScript } from "./toolchain"
import { parseThemeStylesheet } from "./theme-stylesheet"
import {
  pluginResourcePaths,
  pluginLanguageData,
  localizePluginManifest,
} from "./i18n"

export function packageHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}
export function parsePackage(value: unknown): PluginPackage {
  const p = record(value)
  if (
    (p.format !== 1 && p.format !== 2 && p.format !== 3) ||
    Object.keys(p).sort().join() !==
      (p.format === 3
        ? "format,manifest,modules,resources"
        : "format,manifest,modules")
  )
    invalid("Invalid plugin package envelope")
  const manifest = parseManifest(p.manifest)
  if (manifest.theme) parseThemeStylesheet(manifest.theme.stylesheet, true)
  if (
    (p.format !== 1) !== Boolean(manifest.requires) ||
    (p.format === 3) !== Boolean(manifest.i18n)
  )
    invalid(
      "Packages declaring requires must use format 2 or 3; both require a minimum plugin API; localization requires format 3"
    )
  const modules = record(p.modules)
  let resources: Record<string, string> | undefined
  if (p.format === 3) {
    const raw = record(p.resources)
    const paths = pluginResourcePaths(manifest)
    if (
      Object.keys(raw).length !== paths.length ||
      paths.some(
        (path) =>
          typeof raw[path] !== "string" ||
          Buffer.byteLength(raw[path] as string) > 1024 * 1024
      )
    )
      invalid(
        "Package resources must match declared localization files (at most 1 MiB each)"
      )
    resources = raw as Record<string, string>
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
  }
  const entries = new Set([
    ...(manifest.views ?? []).map((v) => v.entry),
    ...(manifest.extension ? [manifest.extension] : []),
    ...(manifest.background ? [manifest.background.entry] : []),
  ])
  if (
    Object.keys(modules).length !== entries.size ||
    Object.entries(modules).some(
      ([key, code]) =>
        !entries.has(key) || typeof code !== "string" || !code.trim()
    )
  )
    invalid("Package modules do not match declared entries")
  const ts = loadTypeScript()
  const { transformSync } = loadEsbuild()
  for (const [key, code] of Object.entries(modules)) {
    const text = code as string
    try {
      transformSync(text, { loader: "js", format: "esm", logLevel: "silent" })
    } catch {
      throw new PluginError("SOURCE_INVALID", "Invalid package JavaScript")
    }
    validateSource(
      ts.createSourceFile(
        key,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
      ),
      true
    )
  }
  return {
    format: p.format,
    manifest,
    modules: { ...modules } as Record<string, string>,
    ...(resources ? { resources: { ...resources } } : {}),
  }
}
export function decodePackage(bytes: Uint8Array): PluginPackage {
  if (bytes.byteLength > PACKAGE_LIMIT)
    throw new PluginError("TOO_LARGE", "Compressed package exceeds 16 MiB")
  let raw: Uint8Array
  try {
    raw = gunzipSync(bytes, { maxOutputLength: PACKAGE_LIMIT })
  } catch {
    invalid("Invalid or oversized gzip package")
  }
  try {
    return parsePackage(
      parseJson(new TextDecoder("utf-8", { fatal: true }).decode(raw))
    )
  } catch (error) {
    if (error instanceof PluginError) throw error
    invalid("Invalid UTF-8 JSON package")
  }
}
export function encodePackage(
  manifest: PluginManifest,
  modules: Record<string, string>,
  resources?: Record<string, string>
): Uint8Array {
  const pkg = parsePackage({
    format: manifest.i18n ? 3 : manifest.requires ? 2 : 1,
    manifest,
    modules,
    ...(manifest.i18n ? { resources: resources ?? {} } : {}),
  })
  const raw = Buffer.from(JSON.stringify(pkg))
  if (raw.length > PACKAGE_LIMIT)
    throw new PluginError("TOO_LARGE", "Package exceeds 16 MiB")
  const bytes = gzipSync(raw)
  if (bytes.length > PACKAGE_LIMIT)
    throw new PluginError("TOO_LARGE", "Compressed package exceeds 16 MiB")
  return bytes
}
