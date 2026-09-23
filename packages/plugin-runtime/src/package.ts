import { createHash } from "node:crypto"
import { gzipSync, gunzipSync } from "node:zlib"
import type { PluginManifest, PluginPackage } from "./contracts"
export type { PluginPackage } from "./contracts"
import { PACKAGE_LIMIT, PluginError, invalid } from "./errors"
import { parseManifest, record } from "./manifest"
import { parseJson } from "./json"
import { validateSource } from "./source"
import { loadEsbuild, loadTypeScript } from "./toolchain"
import { themeFontData } from "./theme"

export function packageHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}
export function parsePackage(value: unknown): PluginPackage {
  const p = record(value)
  if (
    (p.format !== 1 && p.format !== 2) ||
    Object.keys(p).sort().join() !== "format,manifest,modules"
  )
    invalid("Invalid plugin package envelope")
  const manifest = parseManifest(p.manifest)
  if (manifest.theme?.fonts?.some((font) => !themeFontData(font.source)))
    invalid("Packaged theme fonts must be embedded")
  if ((p.format === 2) !== Boolean(manifest.requires))
    invalid(
      "Packages declaring requires must use format 2; format 2 requires a minimum plugin API"
    )
  const modules = record(p.modules)
  const entries = new Set([
    ...(manifest.views ?? []).map((v) => v.entry),
    ...(manifest.extension ? [manifest.extension] : []),
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
  modules: Record<string, string>
): Uint8Array {
  const pkg = parsePackage({
    format: manifest.requires ? 2 : 1,
    manifest,
    modules,
  })
  const raw = Buffer.from(JSON.stringify(pkg))
  if (raw.length > PACKAGE_LIMIT)
    throw new PluginError("TOO_LARGE", "Package exceeds 16 MiB")
  const bytes = gzipSync(raw)
  if (bytes.length > PACKAGE_LIMIT)
    throw new PluginError("TOO_LARGE", "Compressed package exceeds 16 MiB")
  return bytes
}
