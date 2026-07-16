import type * as Monaco from "monaco-editor"
import type {
  ListSpaceFilesOptions,
  SpaceFileEntry,
  SpaceTextFile,
} from "@eidos.space/file-space"

import extensionSdkSource from "@/packages/extension-sdk/src/index.ts?raw"
import extensionSurfaceProtocolTypes from "@/packages/extension-surface-protocol/src/types.ts?raw"

const EXTENSION_PACKAGE_ROOT = ".eidos/extensions/"
const SDK_MODULE = "@eidos.space/extension-sdk"
const SURFACE_PROTOCOL_MODULE = "@eidos.space/extension-surface-protocol"
const SDK_VIRTUAL_PATH =
  "file:///node_modules/@eidos.space/extension-sdk/index.ts"
const SURFACE_PROTOCOL_VIRTUAL_PATH =
  "file:///node_modules/@eidos.space/extension-surface-protocol/index.ts"
const STYLE_MODULE_VIRTUAL_PATH =
  "file:///node_modules/@eidos.space/extension-sdk/style-modules.d.ts"
const STYLE_MODULE_TYPES =
  'declare module "*.css" { const stylesheet: string; export default stylesheet; }\n'
const EDITOR_MODULE_EXTENSIONS = new Set([
  "js",
  "jsx",
  "json",
  "mjs",
  "mts",
  "ts",
  "tsx",
])
const IGNORED_PACKAGE_DIRECTORIES = new Set([".git", "node_modules"])
const MAX_PACKAGE_ENTRIES = 2_048
const MAX_PACKAGE_MODULES = 256
const MAX_PACKAGE_MODULE_BYTES = 4 * 1024 * 1024
const MAX_SINGLE_MODULE_BYTES = 1024 * 1024

type TypeScriptDefaults = typeof Monaco.languages.typescript.typescriptDefaults

interface RegisteredExtraLib {
  content: string
  disposable: Monaco.IDisposable
}

const packageRegistrations = new WeakMap<
  TypeScriptDefaults,
  Map<string, Map<string, RegisteredExtraLib>>
>()

export interface FileExtensionEditorSource {
  path: string
  content: string
}

export interface FileExtensionEditorPackage {
  rootPath: string
  sources: FileExtensionEditorSource[]
  warnings: string[]
}

export interface FileExtensionEditorFiles {
  list(
    relativeDirectory: string,
    options?: ListSpaceFilesOptions
  ): Promise<SpaceFileEntry[]>
  readText(relativePath: string): Promise<SpaceTextFile>
}

function normalizeSpacePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\/+/, "")
}

function encodeVirtualPath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function extensionOf(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() ?? ""
}

function isEditorModulePath(filePath: string): boolean {
  return EDITOR_MODULE_EXTENSIONS.has(extensionOf(filePath))
}

export function isFileExtensionSourcePath(filePath: string): boolean {
  const normalizedPath = normalizeSpacePath(filePath)
  return normalizedPath.startsWith(EXTENSION_PACKAGE_ROOT)
}

export function fileExtensionPackageRoot(filePath: string): string | null {
  const normalizedPath = normalizeSpacePath(filePath)
  if (!normalizedPath.startsWith(EXTENSION_PACKAGE_ROOT)) return null
  const packageDirectory = normalizedPath
    .slice(EXTENSION_PACKAGE_ROOT.length)
    .split("/")[0]
  return packageDirectory
    ? `${EXTENSION_PACKAGE_ROOT}${packageDirectory}`
    : null
}

export function fileExtensionEditorUri(
  spaceId: string,
  filePath: string
): string | undefined {
  if (!isFileExtensionSourcePath(filePath)) return undefined
  return `file:///eidos-spaces/${encodeURIComponent(spaceId)}/${encodeVirtualPath(
    normalizeSpacePath(filePath)
  )}`
}

export async function loadFileExtensionEditorPackage(
  files: FileExtensionEditorFiles,
  filePath: string
): Promise<FileExtensionEditorPackage | null> {
  const rootPath = fileExtensionPackageRoot(filePath)
  if (!rootPath) return null
  const currentFilePath = normalizeSpacePath(filePath)

  const warnings: string[] = []
  const directories = [rootPath]
  const modules: SpaceFileEntry[] = []
  let visitedEntries = 0
  let reachedEntryLimit = false

  while (directories.length > 0 && !reachedEntryLimit) {
    const directory = directories.shift()
    if (!directory) break
    const entries = await files.list(directory, { includeHidden: true })
    for (const entry of entries) {
      visitedEntries += 1
      if (visitedEntries > MAX_PACKAGE_ENTRIES) {
        warnings.push(
          `Editor context is limited to ${MAX_PACKAGE_ENTRIES} package entries.`
        )
        reachedEntryLimit = true
        break
      }
      if (entry.kind === "directory") {
        if (!IGNORED_PACKAGE_DIRECTORIES.has(entry.name)) {
          directories.push(entry.path)
        }
        continue
      }
      if (
        entry.kind !== "file" ||
        entry.path === currentFilePath ||
        !isEditorModulePath(entry.path)
      )
        continue
      if (entry.size > MAX_SINGLE_MODULE_BYTES) {
        warnings.push(
          `${entry.path} is too large to include in editor type checking.`
        )
        continue
      }
      if (modules.length >= MAX_PACKAGE_MODULES) {
        warnings.push(
          `Editor type checking is limited to ${MAX_PACKAGE_MODULES} package modules.`
        )
        continue
      }
      modules.push(entry)
    }
  }

  modules.sort((left, right) => left.path.localeCompare(right.path))
  const selectedModules: SpaceFileEntry[] = []
  let selectedBytes = 0
  for (const module of modules) {
    if (selectedBytes + module.size > MAX_PACKAGE_MODULE_BYTES) {
      warnings.push(
        `Editor type checking is limited to ${MAX_PACKAGE_MODULE_BYTES / 1024 / 1024} MB of package modules.`
      )
      continue
    }
    selectedModules.push(module)
    selectedBytes += module.size
  }

  const results = await Promise.allSettled(
    selectedModules.map((module) => files.readText(module.path))
  )
  const sources: FileExtensionEditorSource[] = []
  results.forEach((result, index) => {
    const module = selectedModules[index]
    if (result.status === "fulfilled") {
      sources.push({ path: module.path, content: result.value.content })
      return
    }
    warnings.push(`Unable to load ${module.path} for editor type checking.`)
  })

  return { rootPath, sources, warnings: Array.from(new Set(warnings)) }
}

export function configureFileExtensionEditorTypes(
  monaco: typeof Monaco,
  filePath: string
): void {
  if (!isFileExtensionSourcePath(filePath)) return

  const languageDefaults = [
    monaco.languages.typescript.typescriptDefaults,
    monaco.languages.typescript.javascriptDefaults,
  ]

  for (const defaults of languageDefaults) {
    const extraLibs = defaults.getExtraLibs()
    if (!extraLibs[SURFACE_PROTOCOL_VIRTUAL_PATH]) {
      defaults.addExtraLib(
        extensionSurfaceProtocolTypes,
        SURFACE_PROTOCOL_VIRTUAL_PATH
      )
    }
    if (!extraLibs[SDK_VIRTUAL_PATH]) {
      defaults.addExtraLib(extensionSdkSource, SDK_VIRTUAL_PATH)
    }
    if (!extraLibs[STYLE_MODULE_VIRTUAL_PATH]) {
      defaults.addExtraLib(STYLE_MODULE_TYPES, STYLE_MODULE_VIRTUAL_PATH)
    }

    const compilerOptions = defaults.getCompilerOptions()
    defaults.setCompilerOptions({
      ...compilerOptions,
      allowJs: true,
      allowNonTsExtensions: true,
      baseUrl: "file:///",
      checkJs: false,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      paths: {
        ...compilerOptions.paths,
        [SDK_MODULE]: ["node_modules/@eidos.space/extension-sdk/index.ts"],
        [SURFACE_PROTOCOL_MODULE]: [
          "node_modules/@eidos.space/extension-surface-protocol/index.ts",
        ],
      },
      resolveJsonModule: true,
    })
  }
}

export function syncFileExtensionEditorPackageTypes(
  monaco: typeof Monaco,
  spaceId: string,
  editorPackage: FileExtensionEditorPackage
): void {
  const packageKey = `${spaceId}:${editorPackage.rootPath}`
  const desiredLibraries = new Map(
    editorPackage.sources.map((source) => [
      fileExtensionEditorUri(spaceId, source.path)!,
      source.content,
    ])
  )

  for (const defaults of [
    monaco.languages.typescript.typescriptDefaults,
    monaco.languages.typescript.javascriptDefaults,
  ]) {
    let defaultsRegistrations = packageRegistrations.get(defaults)
    if (!defaultsRegistrations) {
      defaultsRegistrations = new Map()
      packageRegistrations.set(defaults, defaultsRegistrations)
    }
    const currentLibraries =
      defaultsRegistrations.get(packageKey) ??
      new Map<string, RegisteredExtraLib>()

    for (const [virtualPath, registration] of currentLibraries) {
      if (desiredLibraries.has(virtualPath)) continue
      registration.disposable.dispose()
      currentLibraries.delete(virtualPath)
    }
    for (const [virtualPath, content] of desiredLibraries) {
      const current = currentLibraries.get(virtualPath)
      if (current?.content === content) continue
      const disposable = defaults.addExtraLib(content, virtualPath)
      current?.disposable.dispose()
      currentLibraries.set(virtualPath, { content, disposable })
    }
    defaultsRegistrations.set(packageKey, currentLibraries)
  }
}
