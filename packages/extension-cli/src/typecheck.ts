import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

import type { ExtensionPackageSnapshotFile } from "@eidos.space/extension-manifest/node"

const CODE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mts|mjs)$/
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true })
const SDK_MODULE = "@eidos.space/extension-sdk"

function sdkTypesPath(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url))
  while (true) {
    const candidate = path.join(
      directory,
      "node_modules",
      "@eidos.space",
      "extension-sdk",
      "dist",
      "index.d.mts"
    )
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error(
    "Cannot resolve @eidos.space/extension-sdk type declarations; reinstall the extension CLI dependencies"
  )
}

export interface ExtensionTypecheckDiagnostic {
  code: string
  message: string
  path?: string
  line?: number
  column?: number
}

function extensionFor(filename: string): ts.Extension {
  if (filename.endsWith(".tsx")) return ts.Extension.Tsx
  if (filename.endsWith(".ts")) return ts.Extension.Ts
  if (filename.endsWith(".mts")) return ts.Extension.Mts
  if (filename.endsWith(".jsx")) return ts.Extension.Jsx
  if (filename.endsWith(".mjs")) return ts.Extension.Mjs
  return ts.Extension.Js
}

function portablePath(root: string, filename: string): string | undefined {
  const relative = path.relative(root, filename)
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : undefined
}

/**
 * Type-check the exact in-memory package snapshot. Only default TypeScript
 * libraries and the public Eidos SDK are resolved outside the snapshot.
 */
export function typecheckExtensionSnapshot(
  files: readonly ExtensionPackageSnapshotFile[]
): ExtensionTypecheckDiagnostic[] {
  const sdkTypes = sdkTypesPath()
  const virtualRoot = path.resolve(
    path.parse(process.cwd()).root,
    "__eidos_extension_typecheck__"
  )
  const virtualFiles = new Map<string, string>()
  const virtualDirectories = new Set<string>([virtualRoot])
  const rootNames: string[] = []
  const diagnostics: ExtensionTypecheckDiagnostic[] = []

  for (const file of files) {
    if (!CODE_FILE_PATTERN.test(file.path) && !file.path.endsWith(".json")) {
      continue
    }
    let content: string
    try {
      content = STRICT_UTF8.decode(file.content)
    } catch {
      diagnostics.push({
        code: "typescript-encoding",
        message: "TypeScript and JSON modules must be valid UTF-8",
        path: file.path,
      })
      continue
    }
    const filename = path.resolve(virtualRoot, ...file.path.split("/"))
    virtualFiles.set(filename, content)
    for (
      let directory = path.dirname(filename);
      directory.startsWith(virtualRoot);
      directory = path.dirname(directory)
    ) {
      virtualDirectories.add(directory)
      if (directory === virtualRoot) break
    }
    if (CODE_FILE_PATTERN.test(file.path)) rootNames.push(filename)
  }

  if (diagnostics.length > 0 || rootNames.length === 0) return diagnostics

  const compilerOptions: ts.CompilerOptions = {
    allowArbitraryExtensions: true,
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  }
  const host = ts.createCompilerHost(compilerOptions, true)
  const originalFileExists = host.fileExists.bind(host)
  const originalReadFile = host.readFile.bind(host)
  const originalDirectoryExists = host.directoryExists?.bind(host)
  const styleModules = new Map<string, string>()

  host.fileExists = (filename) =>
    virtualFiles.has(path.resolve(filename)) ||
    styleModules.has(path.resolve(filename)) ||
    originalFileExists(filename)
  host.readFile = (filename) =>
    virtualFiles.get(path.resolve(filename)) ??
    styleModules.get(path.resolve(filename)) ??
    originalReadFile(filename)
  host.directoryExists = (directory) =>
    virtualDirectories.has(path.resolve(directory)) ||
    originalDirectoryExists?.(directory) === true
  host.getSourceFile = (filename, languageVersion) => {
    const content = host.readFile(filename)
    return content === undefined
      ? undefined
      : ts.createSourceFile(filename, content, languageVersion, true)
  }
  host.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((moduleName) => {
      if (moduleName === SDK_MODULE) {
        return {
          resolvedFileName: sdkTypes,
          extension: ts.Extension.Dmts,
          isExternalLibraryImport: true,
        }
      }
      if (moduleName.endsWith(".css")) {
        const stylesheet = path.resolve(
          path.dirname(containingFile),
          moduleName
        )
        if (
          files.some(
            (file) =>
              path.resolve(virtualRoot, ...file.path.split("/")) === stylesheet
          )
        ) {
          const declaration = `${stylesheet}.d.ts`
          styleModules.set(
            declaration,
            "declare const stylesheet: string; export default stylesheet;"
          )
          return {
            resolvedFileName: declaration,
            extension: ts.Extension.Dts,
          }
        }
      }
      return ts.resolveModuleName(
        moduleName,
        containingFile,
        compilerOptions,
        host
      ).resolvedModule
    })

  const program = ts.createProgram({
    rootNames,
    options: compilerOptions,
    host,
  })
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const location =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : undefined
    diagnostics.push({
      code: `TS${diagnostic.code}`,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      path: diagnostic.file
        ? portablePath(virtualRoot, diagnostic.file.fileName)
        : undefined,
      line: location ? location.line + 1 : undefined,
      column: location ? location.character + 1 : undefined,
    })
  }
  return diagnostics
}
