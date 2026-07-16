import path from "node:path"
import { canonicalExtensionPackagePath } from "@eidos.space/extension-manifest"
import * as oxc from "oxc-transform"
import { rollup, type Plugin, type RollupError, type RollupLog } from "rollup"

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
const STYLE_EXTENSION = ".css"

type ExtensionBundleTarget = "worker" | "surface"

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

export interface ExtensionCompileDiagnostic {
  message: string
  path?: string
  line?: number
  column?: number
}

export class ExtensionCompileError extends Error {
  readonly path?: string
  readonly line?: number
  readonly column?: number

  constructor(diagnostic: ExtensionCompileDiagnostic) {
    super(diagnostic.message)
    this.name = "ExtensionCompileError"
    this.path = diagnostic.path
    this.line = diagnostic.line
    this.column = diagnostic.column
  }
}

export type CompileExtensionSurfaceOptions = CompileExtensionWorkerOptions
export type CompiledExtensionSurface = CompiledExtensionWorker

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

function sourcePosition(
  source: string,
  byteOffset: number | undefined
): { line: number; column: number } | undefined {
  if (byteOffset === undefined || byteOffset < 0) return undefined
  const bytes = new TextEncoder().encode(source)
  if (byteOffset > bytes.byteLength) return undefined
  let prefix: string
  try {
    prefix = STRICT_UTF8.decode(bytes.subarray(0, byteOffset))
  } catch {
    return undefined
  }
  const lines = prefix.split("\n")
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  }
}

function compilerPluginError(
  diagnostic: ExtensionCompileDiagnostic
): RollupLog {
  return {
    message: diagnostic.message,
    id: diagnostic.path,
    loc:
      diagnostic.path && diagnostic.line && diagnostic.column
        ? {
            file: diagnostic.path,
            line: diagnostic.line,
            column: diagnostic.column - 1,
          }
        : undefined,
    meta: { eidosExtensionDiagnostic: diagnostic },
  }
}

function extensionCompileError(error: unknown): ExtensionCompileError {
  if (error instanceof ExtensionCompileError) return error
  if (error && typeof error === "object") {
    const rollupError = error as RollupError
    const diagnostic = rollupError.meta?.eidosExtensionDiagnostic as
      | ExtensionCompileDiagnostic
      | undefined
    if (diagnostic && typeof diagnostic.message === "string") {
      return new ExtensionCompileError(diagnostic)
    }
    const path = rollupError.id?.startsWith(PACKAGE_PREFIX)
      ? rollupError.id.slice(PACKAGE_PREFIX.length)
      : rollupError.id
    return new ExtensionCompileError({
      message: rollupError.message || "The extension could not be compiled.",
      path,
      line: rollupError.loc?.line,
      column:
        rollupError.loc?.column === undefined
          ? undefined
          : rollupError.loc.column + 1,
    })
  }
  return new ExtensionCompileError({
    message: "The extension could not be compiled.",
  })
}

function transformModule(
  filename: string,
  source: string,
  target: ExtensionBundleTarget
): string {
  const extension = path.posix.extname(filename)
  if (extension === STYLE_EXTENSION) {
    if (target !== "surface") {
      throw new ExtensionCompileError({
        message: `Worker modules do not support ${extension} files`,
        path: filename,
      })
    }
    const css = JSON.stringify(source)
    return [
      `const css = ${css};`,
      'const style = document.createElement("style");',
      "style.textContent = css;",
      "document.head.append(style);",
      "export default css;",
    ].join("\n")
  }
  if (extension === ".json") {
    let value: unknown
    try {
      value = JSON.parse(source)
    } catch (error) {
      throw new ExtensionCompileError({
        message: `Cannot parse JSON module: ${error instanceof Error ? error.message : String(error)}`,
        path: filename,
      })
    }
    return `export default ${JSON.stringify(value)};`
  }
  if (
    !MODULE_EXTENSIONS.includes(extension as (typeof MODULE_EXTENSIONS)[number])
  ) {
    throw new ExtensionCompileError({
      message: `Worker modules do not support ${extension || "extensionless"} files`,
      path: filename,
    })
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
    const primary = result.errors[0]
    const position = sourcePosition(source, primary?.labels[0]?.start)
    throw new ExtensionCompileError({
      message: result.errors.map((error) => error.message).join("; "),
      path: filename,
      ...position,
    })
  }
  return result.code
}

function packageSnapshotPlugin(
  files: ReadonlyMap<string, Uint8Array>,
  target: ExtensionBundleTarget
): Plugin {
  const available = new Set(files.keys())
  return {
    name: "eidos-extension-package-snapshot",
    resolveId(source, importer) {
      if (source === SDK_MODULE) return SDK_VIRTUAL_ID
      if (!importer) {
        const entrypoint = canonicalExtensionPackagePath(source)
        if (!available.has(entrypoint)) {
          this.error(
            compilerPluginError({
              message: `Worker entrypoint does not exist: ${entrypoint}`,
              path: entrypoint,
            })
          )
        }
        return `${PACKAGE_PREFIX}${entrypoint}`
      }
      if (!importer.startsWith(PACKAGE_PREFIX)) {
        this.error(
          compilerPluginError({
            message: `Unexpected extension module importer: ${importer}`,
          })
        )
      }
      const importerPath = importer.slice(PACKAGE_PREFIX.length)
      const resolved = resolvePackageModule(importerPath, source, available)
      if (!resolved) {
        this.error(
          compilerPluginError({
            message: `Unsupported or missing extension import: ${source}`,
            path: importerPath,
          })
        )
      }
      return `${PACKAGE_PREFIX}${resolved}`
    },
    load(id) {
      if (id === SDK_VIRTUAL_ID) return "export {};"
      if (!id.startsWith(PACKAGE_PREFIX)) return null
      const filename = id.slice(PACKAGE_PREFIX.length)
      const content = files.get(filename)
      if (!content) {
        this.error(
          compilerPluginError({
            message: `Extension module disappeared: ${filename}`,
            path: filename,
          })
        )
      }
      let source: string
      try {
        source = STRICT_UTF8.decode(content)
      } catch {
        this.error(
          compilerPluginError({
            message: "Extension module must be valid UTF-8",
            path: filename,
          })
        )
        return null
      }
      try {
        return transformModule(filename, source, target)
      } catch (error) {
        if (error instanceof ExtensionCompileError) {
          this.error(
            compilerPluginError({
              message: error.message,
              path: error.path,
              line: error.line,
              column: error.column,
            })
          )
        }
        throw error
      }
    },
  }
}

/**
 * Compile one worker from the exact bytes inspected by the host. This function
 * deliberately has no filesystem access, configuration discovery, or plugin
 * loading surface.
 */
async function compileExtensionBundle(
  options: CompileExtensionWorkerOptions,
  target: ExtensionBundleTarget
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
  let bundle
  try {
    bundle = await rollup({
      input: entrypoint,
      plugins: [packageSnapshotPlugin(files, target)],
      treeshake: true,
      onwarn(warning) {
        warnings.push(warning.message)
      },
    })
  } catch (error) {
    throw extensionCompileError(error)
  }
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
  } catch (error) {
    throw extensionCompileError(error)
  } finally {
    await bundle.close()
  }
}

export function compileExtensionWorker(
  options: CompileExtensionWorkerOptions
): Promise<CompiledExtensionWorker> {
  return compileExtensionBundle(options, "worker")
}

/** Compile a UI entrypoint from the exact inspected package snapshot. */
export function compileExtensionSurface(
  options: CompileExtensionSurfaceOptions
): Promise<CompiledExtensionSurface> {
  return compileExtensionBundle(options, "surface")
}
