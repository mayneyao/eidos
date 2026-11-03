import { parseJson } from "../../plugin-runtime/src/json"
import { validateSource } from "../../plugin-runtime/src/source"
import { loadTypeScript } from "./browser-toolchain"
import { validateMobileManifest } from "./profile"
import {
  localizePluginManifest,
  pluginLanguageData,
} from "../../plugin-runtime/src/i18n"
import { validatePluginResources } from "../../plugin-runtime/src/package-resources"

/** Parses code as data in a dedicated renderer. Never imports or evaluates package modules. */
export function validatePackage(text: string, locale = "en") {
  const value = parseJson(text) as Record<string, unknown>
  if (
    !value ||
    typeof value !== "object" ||
    (value.format !== 2 && value.format !== 3) ||
    Object.keys(value).sort().join() !==
      (value.format === 3
        ? "format,manifest,modules,resources"
        : "format,manifest,modules")
  )
    throw new Error("Invalid plugin package envelope")
  const manifest = validateMobileManifest(value.manifest)
  if ((value.format === 3) !== Boolean(manifest.i18n))
    throw new Error("Localization requires package format 3")
  const resources =
    value.format === 3
      ? validatePluginResources(manifest, value.resources)
      : undefined
  const modules = value.modules
  if (!modules || typeof modules !== "object" || Array.isArray(modules))
    throw new Error("Invalid modules")
  const entries = new Set([
    ...(manifest.views ?? []).map((view) => view.entry),
    ...(manifest.extension ? [manifest.extension] : []),
  ])
  if (Object.keys(modules).length !== entries.size)
    throw new Error("Package entries do not match manifest")
  const ts = loadTypeScript()
  for (const [entry, code] of Object.entries(modules)) {
    if (!entries.has(entry) || typeof code !== "string" || !code.trim())
      throw new Error("Invalid package module")
    const source = ts.createSourceFile(
      entry,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS
    )
    const diagnostics = (
      source as typeof source & { parseDiagnostics: readonly unknown[] }
    ).parseDiagnostics
    if (diagnostics.length) throw new Error("Invalid package JavaScript")
    // JS-only syntactic diagnostics also reject TS annotations accepted by the parser.
    const program = ts.createProgram(
      [entry],
      { allowJs: true, noLib: true },
      {
        getSourceFile: (name) => (name === entry ? source : undefined),
        getDefaultLibFileName: () => "",
        writeFile: () => {},
        getCurrentDirectory: () => "",
        getDirectories: () => [],
        fileExists: (name) => name === entry,
        readFile: (name) => (name === entry ? code : undefined),
        getCanonicalFileName: (name) => name,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
      }
    )
    if (program.getSyntacticDiagnostics(source).length)
      throw new Error("Invalid package JavaScript")
    validateSource(source, true)
  }
  return localizePluginManifest(
    manifest,
    pluginLanguageData(manifest, resources),
    locale
  )
}
