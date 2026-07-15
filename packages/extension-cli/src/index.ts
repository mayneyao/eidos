import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  createExtensionCommandTemplate,
  createExtensionTextEditorTemplate,
  type ExtensionDiagnosticSeverity,
  type ExtensionTemplate,
  type ExtensionTemplateFile,
} from "@eidos.space/extension-manifest"
import { inspectExtensionPackageSnapshot } from "@eidos.space/extension-manifest/node"
import {
  compileExtensionSurface,
  compileExtensionWorker,
} from "@eidos.space/extension-runtime/compiler"

import { typecheckExtensionSnapshot } from "./typecheck"
import packageMetadata from "../package.json" with { type: "json" }

export type ExtensionProjectTemplate = "command" | "text-editor"

export interface CreateExtensionProjectOptions {
  canonicalId: string
  template?: ExtensionProjectTemplate
  outDir?: string
  displayName?: string
  engineRange?: string
  filenamePattern?: string
  mediaType?: string
}

export interface CreatedExtensionProject {
  canonicalId: string
  packageRoot: string
  files: string[]
}

export interface ExtensionCheckDiagnostic {
  code: string
  severity: ExtensionDiagnosticSeverity
  message: string
  path?: string
  line?: number
  column?: number
}

export interface ExtensionEntrypointCheck {
  kind: "worker" | "ui"
  path: string
  bytes: number
}

export interface ExtensionPackageCheckResult {
  ok: boolean
  packageRoot: string
  status: "invalid" | "incompatible" | "ready"
  canonicalId?: string
  version?: string
  contentDigest?: string
  permissionHash?: string
  locallyModified: boolean
  entrypoints: ExtensionEntrypointCheck[]
  diagnostics: ExtensionCheckDiagnostic[]
}

export interface CheckExtensionPackageOptions {
  packageRoot: string
  hostVersion?: string
}

function splitCanonicalId(canonicalId: string): {
  publisher: string
  name: string
} {
  const parts = canonicalId.split(".")
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error(
      "Extension ID must contain exactly one dot: <publisher>.<name>"
    )
  }
  return { publisher: parts[0]!, name: parts[1]! }
}

function buildTemplate(
  options: CreateExtensionProjectOptions
): ExtensionTemplate {
  const { publisher, name } = splitCanonicalId(options.canonicalId)
  const common = {
    publisher,
    name,
    displayName: options.displayName,
    engineRange: options.engineRange ?? ">=0.33.0",
  }
  return options.template === "text-editor"
    ? createExtensionTextEditorTemplate({
        ...common,
        filenamePattern: options.filenamePattern,
        mediaType: options.mediaType,
      })
    : createExtensionCommandTemplate(common)
}

function developerProjectFiles(
  template: ExtensionTemplate
): ExtensionTemplateFile[] {
  const versionRange = `^${packageMetadata.version}`
  const files = template.files.map((file) =>
    file.path === "README.md"
      ? {
          ...file,
          content: [
            file.content.trimEnd(),
            "",
            "## Development",
            "",
            "Install the local developer tools, then run the same validation used by Eidos Desktop:",
            "",
            "```sh",
            "npm install",
            "npm run check",
            "```",
            "",
          ].join("\n"),
        }
      : file
  )
  return [
    ...files,
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: template.canonicalId,
          version: template.manifest.version,
          private: true,
          type: "module",
          scripts: { check: "eidos-extension check ." },
          devDependencies: {
            "@eidos.space/extension-cli": versionRange,
            "@eidos.space/extension-sdk": versionRange,
          },
        },
        null,
        2
      )}\n`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "Bundler",
            allowArbitraryExtensions: true,
            noEmit: true,
            skipLibCheck: true,
            strict: true,
            types: [],
          },
          include: ["src/**/*.ts", "src/**/*.tsx"],
        },
        null,
        2
      )}\n`,
    },
    {
      path: ".gitignore",
      content: [
        "node_modules/",
        "dist/",
        "coverage/",
        "*.tsbuildinfo",
        ".DS_Store",
        "",
      ].join("\n"),
    },
  ]
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  )
}

export async function createExtensionProject(
  options: CreateExtensionProjectOptions
): Promise<CreatedExtensionProject> {
  const template = buildTemplate(options)
  const projectFiles = developerProjectFiles(template)
  const parent = path.resolve(options.outDir ?? ".")
  const packageRoot = path.join(parent, template.canonicalId)
  await mkdir(parent, { recursive: true })
  try {
    await mkdir(packageRoot)
  } catch (error) {
    if (isNodeError(error, "EEXIST")) {
      throw new Error(
        `Refusing to overwrite existing extension directory: ${packageRoot}`
      )
    }
    throw error
  }

  try {
    for (const file of projectFiles) {
      const filename = path.join(packageRoot, ...file.path.split("/"))
      await mkdir(path.dirname(filename), { recursive: true })
      await writeFile(filename, file.content, { encoding: "utf8", flag: "wx" })
    }
  } catch (error) {
    await rm(packageRoot, { recursive: true, force: true })
    throw error
  }

  return {
    canonicalId: template.canonicalId,
    packageRoot,
    files: projectFiles.map((file) => file.path),
  }
}

export async function checkExtensionPackage(
  options: CheckExtensionPackageOptions
): Promise<ExtensionPackageCheckResult> {
  const packageRoot = path.resolve(options.packageRoot)
  const snapshot = await inspectExtensionPackageSnapshot(packageRoot, {
    hostVersion: options.hostVersion,
    requireCanonicalDirectoryName: false,
  })
  const inspection = snapshot.inspection
  const diagnostics: ExtensionCheckDiagnostic[] = inspection.diagnostics.map(
    (item) => ({
      code: item.code,
      severity: item.severity,
      message: item.message,
      path: item.path,
    })
  )
  const entrypoints: ExtensionEntrypointCheck[] = []

  if (inspection.status === "ready" && inspection.manifest) {
    diagnostics.push(
      ...typecheckExtensionSnapshot(snapshot.files).map((item) => ({
        ...item,
        severity: "error" as const,
      }))
    )

    const compile = async (kind: "worker" | "ui", entrypoint: string) => {
      try {
        const result =
          kind === "worker"
            ? await compileExtensionWorker({
                entrypoint,
                files: snapshot.files,
              })
            : await compileExtensionSurface({
                entrypoint,
                files: snapshot.files,
              })
        entrypoints.push({
          kind,
          path: result.entrypoint,
          bytes: Buffer.byteLength(result.code),
        })
        diagnostics.push(
          ...result.warnings.map((message) => ({
            code: "compiler-warning",
            severity: "error" as const,
            message,
            path: entrypoint,
          }))
        )
      } catch (error) {
        diagnostics.push({
          code: "compiler-error",
          severity: "error",
          message: error instanceof Error ? error.message : String(error),
          path: entrypoint,
        })
      }
    }

    if (inspection.manifest.entrypoints.worker) {
      await compile("worker", inspection.manifest.entrypoints.worker)
    }
    if (inspection.manifest.entrypoints.ui) {
      await compile("ui", inspection.manifest.entrypoints.ui)
    }
  }

  const hasErrors = diagnostics.some((item) => item.severity === "error")
  const status =
    inspection.status === "ready" && hasErrors
      ? ("invalid" as const)
      : inspection.status
  return {
    ok: status === "ready",
    packageRoot,
    status,
    canonicalId: inspection.canonicalId,
    version: inspection.manifest?.version,
    contentDigest: inspection.contentDigest,
    permissionHash: inspection.permissionHash,
    locallyModified: inspection.locallyModified ?? false,
    entrypoints,
    diagnostics,
  }
}
