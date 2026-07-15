import path from "node:path"
import { canonicalExtensionPackagePath } from "@eidos.space/extension-manifest"
import * as oxc from "oxc-transform"
import { rollup, type Plugin } from "rollup"

const SDK_MODULE = "@eidos.space/extension-sdk"
const SDK_VIRTUAL_ID = "\0eidos-extension-sdk"
const PACKAGE_PREFIX = "\0eidos-extension-package:"
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true })
const MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
  ".json",
] as const

export interface ExtensionRuntimeSourceFile {
  path: string
  content: Uint8Array
}

export interface CompileExtensionWorkerOptions {
  entrypoint: string
  files: readonly ExtensionRuntimeSourceFile[]
}

export interface CompiledExtensionWorker {
  code: string
  entrypoint: string
  warnings: string[]
}

function moduleCandidates(base: string): string[] {
  const extension = path.posix.extname(base)
  if (extension) {
    const candidates = [base]
    if (extension === ".js" || extension === ".mjs") {
      const stem = base.slice(0, -extension.length)
      candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`)
    } else if (extension === ".jsx") {
      candidates.push(`${base.slice(0, -extension.length)}.tsx`)
    }
    return candidates
  }
  return [
    ...MODULE_EXTENSIONS.map((candidate) => `${base}${candidate}`),
    ...MODULE_EXTENSIONS.map((candidate) => `${base}/index${candidate}`),
  ]
}

function resolvePackageModule(
  importer: string,
  specifier: string,
  available: ReadonlySet<string>
): string | undefined {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return undefined
  }
  const target = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier)
  )
  if (
    target === ".." ||
    target.startsWith("../") ||
    path.posix.isAbsolute(target)
  ) {
    return undefined
  }
  return moduleCandidates(target).find((candidate) => available.has(candidate))
}

function transformModule(filename: string, source: string): string {
  const extension = path.posix.extname(filename)
  if (extension === ".json") {
    let value: unknown
    try {
      value = JSON.parse(source)
    } catch (error) {
      throw new Error(
        `Cannot parse JSON module ${filename}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    return `export default ${JSON.stringify(value)};`
  }
  if (
    !MODULE_EXTENSIONS.includes(extension as (typeof MODULE_EXTENSIONS)[number])
  ) {
    throw new Error(
      `Worker modules do not support ${extension || "extensionless"} files: ${filename}`
    )
  }
  const result = oxc.transform(filename, source, {
    lang:
      extension === ".tsx" || extension === ".jsx"
        ? "tsx"
        : extension === ".ts" || extension === ".mts"
          ? "ts"
          : "js",
    typescript: {},
    target: "es2022",
  })
  if (result.errors.length > 0) {
    throw new Error(
      `Cannot compile ${filename}: ${result.errors.map((error) => error.message).join("; ")}`
    )
  }
  return result.code
}

function packageSnapshotPlugin(files: ReadonlyMap<string, Uint8Array>): Plugin {
  const available = new Set(files.keys())
  return {
    name: "eidos-extension-package-snapshot",
    resolveId(source, importer) {
      if (source === SDK_MODULE) return SDK_VIRTUAL_ID
      if (!importer) {
        const entrypoint = canonicalExtensionPackagePath(source)
        if (!available.has(entrypoint)) {
          throw new Error(`Worker entrypoint does not exist: ${entrypoint}`)
        }
        return `${PACKAGE_PREFIX}${entrypoint}`
      }
      if (!importer.startsWith(PACKAGE_PREFIX)) {
        throw new Error(`Unexpected extension module importer: ${importer}`)
      }
      const importerPath = importer.slice(PACKAGE_PREFIX.length)
      const resolved = resolvePackageModule(importerPath, source, available)
      if (!resolved) {
        throw new Error(
          `Unsupported or missing extension import from ${importerPath}: ${source}`
        )
      }
      return `${PACKAGE_PREFIX}${resolved}`
    },
    load(id) {
      if (id === SDK_VIRTUAL_ID) return "export {};"
      if (!id.startsWith(PACKAGE_PREFIX)) return null
      const filename = id.slice(PACKAGE_PREFIX.length)
      const content = files.get(filename)
      if (!content) throw new Error(`Extension module disappeared: ${filename}`)
      let source: string
      try {
        source = STRICT_UTF8.decode(content)
      } catch {
        throw new Error(`Extension module must be valid UTF-8: ${filename}`)
      }
      return transformModule(filename, source)
    },
  }
}

/**
 * Compile one worker from the exact bytes inspected by the host. This function
 * deliberately has no filesystem access, configuration discovery, or plugin
 * loading surface.
 */
export async function compileExtensionWorker(
  options: CompileExtensionWorkerOptions
): Promise<CompiledExtensionWorker> {
  const entrypoint = canonicalExtensionPackagePath(options.entrypoint)
  const files = new Map<string, Uint8Array>()
  for (const file of options.files) {
    const canonicalPath = canonicalExtensionPackagePath(file.path)
    if (files.has(canonicalPath)) {
      throw new Error(`Duplicate extension package path: ${canonicalPath}`)
    }
    files.set(canonicalPath, new Uint8Array(file.content))
  }
  const warnings: string[] = []
  const bundle = await rollup({
    input: entrypoint,
    plugins: [packageSnapshotPlugin(files)],
    treeshake: true,
    onwarn(warning) {
      warnings.push(warning.message)
    },
  })
  try {
    const generated = await bundle.generate({
      format: "iife",
      name: "__eidosExtensionModule",
      exports: "named",
      inlineDynamicImports: true,
      generatedCode: "es2015",
      sourcemap: false,
    })
    const chunk = generated.output.find((item) => item.type === "chunk")
    if (!chunk)
      throw new Error("Extension compiler did not emit a worker chunk")
    return { code: chunk.code, entrypoint, warnings }
  } finally {
    await bundle.close()
  }
}
