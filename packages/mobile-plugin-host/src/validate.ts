import { parseJson } from "../../plugin-runtime/src/json"
import { validateSource } from "../../plugin-runtime/src/source"
import { loadTypeScript } from "./browser-toolchain"
import { validateMobileManifest } from "./profile"

/** Parses code as data in a dedicated renderer. Never imports or evaluates package modules. */
export function validatePackage(text: string) {
  const value = parseJson(text) as Record<string, unknown>
  if (
    !value ||
    typeof value !== "object" ||
    value.format !== 2 ||
    Object.keys(value).sort().join() !== "format,manifest,modules"
  )
    throw new Error("Invalid plugin package envelope")
  const manifest = validateMobileManifest(value.manifest)
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
  return manifest
}
