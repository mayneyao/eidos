import { createHash } from "node:crypto"
import { constants } from "node:fs"
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import {
  createExtensionCommandTemplate,
  createExtensionTextEditorTemplate,
  type ExtensionDiagnosticSeverity,
  type ExtensionTemplate,
  type ExtensionTemplateFile,
  type LegacyExtensionPortingReceiptV1,
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

export interface CreateLegacyPortingProjectOptions {
  archiveRoot: string
  publisher: string
  name?: string
  outDir?: string
  engineRange?: string
  filenamePattern?: string
  mediaType?: string
}

export interface CreatedLegacyPortingProject {
  canonicalId: string
  packageRoot: string
  candidateContribution: "command" | "file-editor"
  draftManifestPath: string
  portingGuidePath: string
  portingReceiptPath: string
  portingReceipt: LegacyExtensionPortingReceiptV1
  archivedFiles: string[]
}

interface LegacyArchiveV2 {
  format: "eidos-legacy-extension-archive"
  formatVersion: 2
  identity: {
    id: string
    slug: string | null
  }
  presentation: {
    name: string | null
    description: string | null
  }
  portability: {
    readiness: string
    reasonCode: string
    legacyContribution: string | null
    candidateContribution: "command" | "file-editor" | null
    metadataState: string
    sourceState: string
    legacyFileExtensions: string[]
    summary: string
    manualSteps: string[]
  }
}

interface InspectedLegacyArchive {
  metadata: LegacyArchiveV2
  archiveDigest: string
  files: Array<{ archivePath: string; target: string; content: Buffer }>
}

const MAX_LEGACY_ARCHIVE_FILE_BYTES = 16 * 1024 * 1024
const EXTENSION_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}$/

function isRuntimeExtensionsPath(candidate: string): boolean {
  const segments = path
    .resolve(candidate)
    .split(path.sep)
    .map((segment) => segment.toLocaleLowerCase("en-US"))
  return segments.some(
    (segment, index) =>
      segment === ".eidos" && segments[index + 1] === "extensions"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeExtensionName(value: string, fallbackId: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "")
  const withPrefix = /^[a-z]/.test(normalized)
    ? normalized
    : `legacy-${
        normalized ||
        fallbackId
          .replace(/[^a-z0-9]/gi, "")
          .slice(-8)
          .toLowerCase() ||
        "extension"
      }`
  const withMinimumLength =
    withPrefix.length >= 2 ? withPrefix : `${withPrefix}-extension`
  return withMinimumLength.slice(0, 63).replace(/-+$/g, "")
}

async function regularFileIfPresent(
  root: string,
  relativePath: string
): Promise<Buffer | null> {
  const filePath = path.join(root, ...relativePath.split("/"))
  let handle
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return null
    if (isNodeError(error, "ELOOP")) {
      throw new Error(
        `Legacy archive entry must not be a symbolic link: ${relativePath}`
      )
    }
    throw error
  }
  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile() || before.nlink !== 1n) {
      throw new Error(
        `Legacy archive entry must be a regular file: ${relativePath}`
      )
    }
    if (before.size > BigInt(MAX_LEGACY_ARCHIVE_FILE_BYTES)) {
      throw new Error(`Legacy archive entry is too large: ${relativePath}`)
    }
    const content = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs
    ) {
      throw new Error(
        `Legacy archive entry changed while it was being read: ${relativePath}`
      )
    }
    return content
  } finally {
    await handle.close()
  }
}

function calculateLegacyArchiveDigest(
  files: readonly { archivePath: string; content: Uint8Array }[]
): string {
  const hash = createHash("sha256")
  hash.update("eidos-legacy-extension-archive-digest-v1\0", "utf8")
  const updateRecord = (value: Uint8Array) => {
    const length = Buffer.allocUnsafe(8)
    length.writeBigUInt64BE(BigInt(value.byteLength))
    hash.update(length)
    hash.update(value)
  }
  for (const file of [...files].sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.archivePath, "utf8"),
      Buffer.from(right.archivePath, "utf8")
    )
  )) {
    updateRecord(Buffer.from(file.archivePath, "utf8"))
    updateRecord(file.content)
  }
  return `sha256:${hash.digest("hex")}`
}

function parseLegacyArchiveMetadata(raw: string): LegacyArchiveV2 {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error("Legacy extension archive metadata is not valid JSON")
  }
  if (
    !isRecord(value) ||
    value.format !== "eidos-legacy-extension-archive" ||
    value.formatVersion !== 2 ||
    !isRecord(value.identity) ||
    typeof value.identity.id !== "string" ||
    !(
      value.identity.slug === null || typeof value.identity.slug === "string"
    ) ||
    !isRecord(value.presentation) ||
    !(
      value.presentation.name === null ||
      typeof value.presentation.name === "string"
    ) ||
    !(
      value.presentation.description === null ||
      typeof value.presentation.description === "string"
    ) ||
    !isRecord(value.portability)
  ) {
    throw new Error("Unsupported or malformed legacy extension archive")
  }
  const portability = value.portability
  const candidate = portability.candidateContribution
  if (
    portability.readiness !== "manual-port" ||
    (candidate !== "command" && candidate !== "file-editor")
  ) {
    throw new Error(
      `Legacy extension cannot start a v1 port: ${String(portability.reasonCode ?? portability.readiness ?? "unknown")}`
    )
  }
  if (
    typeof portability.reasonCode !== "string" ||
    !(
      portability.legacyContribution === null ||
      typeof portability.legacyContribution === "string"
    ) ||
    typeof portability.metadataState !== "string" ||
    typeof portability.sourceState !== "string" ||
    typeof portability.summary !== "string" ||
    !Array.isArray(portability.manualSteps) ||
    !portability.manualSteps.every((step) => typeof step === "string") ||
    !Array.isArray(portability.legacyFileExtensions) ||
    !portability.legacyFileExtensions.every(
      (extension) => typeof extension === "string"
    )
  ) {
    throw new Error("Malformed portability assessment in legacy archive")
  }
  return value as unknown as LegacyArchiveV2
}

async function inspectLegacyArchive(
  archiveRoot: string
): Promise<InspectedLegacyArchive> {
  const root = path.resolve(archiveRoot)
  const rootStats = await lstat(root)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error("Legacy extension archive must be a real directory")
  }
  const metadataSource = await regularFileIfPresent(
    root,
    "legacy-extension.json"
  )
  if (!metadataSource) {
    throw new Error("Legacy extension archive is missing legacy-extension.json")
  }
  const metadata = parseLegacyArchiveMetadata(metadataSource.toString("utf8"))
  const knownFiles = [
    ["legacy-extension.json", "legacy/legacy-extension.json"],
    ["README.md", "legacy/README.md"],
    ["src/extension.ts", "legacy/src/extension.ts"],
    ["src/view.tsx", "legacy/src/view.tsx"],
    ["dist/extension.js", "legacy/dist/extension.js"],
  ] as const
  const files: Array<{
    archivePath: string
    target: string
    content: Buffer
  }> = []
  for (const [archivePath, target] of knownFiles) {
    const content = await regularFileIfPresent(root, archivePath)
    if (content) files.push({ archivePath, target, content })
  }
  if (
    !files.some(
      (file) =>
        file.target === "legacy/src/extension.ts" ||
        file.target === "legacy/src/view.tsx" ||
        file.target === "legacy/dist/extension.js"
    )
  ) {
    throw new Error("Legacy extension archive contains no recoverable source")
  }
  return {
    metadata,
    archiveDigest: calculateLegacyArchiveDigest(files),
    files,
  }
}

function inferredEditorPattern(metadata: LegacyArchiveV2): string | undefined {
  const extension = metadata.portability.legacyFileExtensions[0]?.trim()
  if (!extension) return undefined
  if (extension.includes("*") || extension.includes("/")) return extension
  return extension.startsWith(".") ? `**/*${extension}` : `**/*.${extension}`
}

function portingGuide(
  metadata: LegacyArchiveV2,
  canonicalId: string,
  candidate: "command" | "file-editor"
): string {
  const steps = metadata.portability.manualSteps
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n")
  return `# Port ${metadata.presentation.name ?? metadata.identity.slug ?? metadata.identity.id}

This is a non-installable porting workspace for \`${canonicalId}\`.
The legacy source under \`legacy/\` is reference material only and is not
imported by the new ${candidate} entrypoint.

## Assessment

- Legacy contribution: \`${metadata.portability.legacyContribution ?? "unknown"}\`
- v1 candidate: \`${candidate}\`
- Source state: \`${metadata.portability.sourceState}\`
- Metadata state: \`${metadata.portability.metadataState}\`

${metadata.portability.summary}

## Required work

${steps}

## Finalize

1. Replace the starter implementation with reviewed, capability-scoped code.
2. Review and minimize permissions in \`extension.json.draft\`.
3. Keep \`PORTING.json\` as the machine-readable legacy-to-canonical receipt.
4. Rename \`extension.json.draft\` to \`extension.json\`.
5. Run \`npm install\` and \`npm run check\`.
6. Install, trust, and enable the package only after the check succeeds.
`
}

export async function createLegacyPortingProject(
  options: CreateLegacyPortingProjectOptions
): Promise<CreatedLegacyPortingProject> {
  if (!EXTENSION_NAME_PATTERN.test(options.publisher)) {
    throw new Error(
      "Publisher must match ^[a-z][a-z0-9-]{1,62}$ for a v1 extension"
    )
  }
  const outDir = path.resolve(options.outDir ?? ".")
  if (isRuntimeExtensionsPath(outDir)) {
    throw new Error(
      "Porting workspaces cannot be created under .eidos/extensions; finalize them outside the live Space first"
    )
  }
  const archive = await inspectLegacyArchive(options.archiveRoot)
  const candidate = archive.metadata.portability.candidateContribution
  if (candidate !== "command" && candidate !== "file-editor") {
    throw new Error("Legacy archive has no supported v1 contribution candidate")
  }
  const name = normalizeExtensionName(
    options.name ??
      archive.metadata.identity.slug ??
      archive.metadata.presentation.name ??
      "",
    archive.metadata.identity.id
  )
  if (!EXTENSION_NAME_PATTERN.test(name)) {
    throw new Error(`Unable to derive a valid v1 extension name: ${name}`)
  }
  const canonicalId = `${options.publisher}.${name}`
  const filenamePattern =
    options.filenamePattern ?? inferredEditorPattern(archive.metadata)
  if (candidate === "file-editor" && !filenamePattern) {
    throw new Error(
      "Legacy file editor archive has no usable selector; provide --pattern"
    )
  }
  const created = await createExtensionProject({
    canonicalId,
    template: candidate === "command" ? "command" : "text-editor",
    outDir,
    displayName: (
      archive.metadata.presentation.name ??
      archive.metadata.identity.slug ??
      canonicalId
    ).slice(0, 80),
    engineRange: options.engineRange,
    filenamePattern,
    mediaType: options.mediaType,
  })
  const draftManifestPath = path.join(
    created.packageRoot,
    "extension.json.draft"
  )
  const portingGuidePath = path.join(created.packageRoot, "PORTING.md")
  const portingReceiptPath = path.join(created.packageRoot, "PORTING.json")
  const portingReceipt: LegacyExtensionPortingReceiptV1 = {
    format: "eidos-legacy-extension-port",
    formatVersion: 1,
    source: {
      legacyExtensionId: archive.metadata.identity.id,
      legacySlug: archive.metadata.identity.slug,
      archiveDigest: archive.archiveDigest,
    },
    target: {
      canonicalPackageId: canonicalId,
      candidateContribution: candidate,
    },
    state: "draft",
  }
  try {
    await rename(
      path.join(created.packageRoot, "extension.json"),
      draftManifestPath
    )
    for (const file of archive.files) {
      const target = path.join(created.packageRoot, ...file.target.split("/"))
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, file.content, { flag: "wx" })
    }
    const entrypoint = path.join(
      created.packageRoot,
      candidate === "command" ? "src/extension.ts" : "src/editor.ts"
    )
    const starter = await readFile(entrypoint, "utf8")
    await writeFile(
      entrypoint,
      `/* Porting scaffold: legacy/ is reference-only and must never be imported directly. */\n${starter}`,
      "utf8"
    )
    await writeFile(
      portingGuidePath,
      portingGuide(archive.metadata, canonicalId, candidate),
      "utf8"
    )
    await writeFile(
      portingReceiptPath,
      `${JSON.stringify(portingReceipt, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    )
    return {
      canonicalId,
      packageRoot: created.packageRoot,
      candidateContribution: candidate,
      draftManifestPath,
      portingGuidePath,
      portingReceiptPath,
      portingReceipt,
      archivedFiles: archive.files.map((file) => file.target),
    }
  } catch (error) {
    await rm(created.packageRoot, { recursive: true, force: true })
    throw error
  }
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
