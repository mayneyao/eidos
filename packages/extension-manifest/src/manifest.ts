import path from "node:path"
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js"
import { satisfies, valid, validRange } from "semver"
import manifestSchema from "../schema/extension-manifest.schema.json"
import { parseStrictJson, type StrictJsonIssue } from "./strict-json"
import type {
  AnalyzeExtensionManifestOptions,
  ExtensionDiagnostic,
  ExtensionDiagnosticCode,
  ExtensionManifestAnalysis,
  ExtensionManifestV1,
  ExtensionPermissions,
  NormalizedExtensionPermissions,
} from "./types"

export const DEFAULT_MAX_MANIFEST_BYTES = 256 * 1024
export const DEFAULT_MAX_MANIFEST_DEPTH = 32
export const RESERVED_EXTENSION_PUBLISHERS = new Set(["eidos"])

const ajv = new Ajv2020({
  allErrors: true,
  formats: {
    uri: (value: string) => {
      try {
        new URL(value)
        return true
      } catch {
        return false
      }
    },
  },
  strict: true,
})
const validateSchema = ajv.compile<ExtensionManifestV1>(manifestSchema)

function pointerWithProperty(pointer: string, property: string): string {
  const escaped = property.replace(/~/g, "~0").replace(/\//g, "~1")
  return `${pointer}/${escaped}`
}

function schemaDiagnostic(error: ErrorObject): ExtensionDiagnostic {
  const additionalProperty =
    error.keyword === "additionalProperties" &&
    typeof error.params.additionalProperty === "string"
      ? error.params.additionalProperty
      : undefined
  return {
    code: "manifest-schema",
    severity: "error",
    message: `Manifest schema ${error.message ?? "validation failed"}`,
    pointer: additionalProperty
      ? pointerWithProperty(error.instancePath, additionalProperty)
      : error.instancePath,
  }
}

function strictJsonDiagnostic(issue: StrictJsonIssue): ExtensionDiagnostic {
  const codeByKind: Record<StrictJsonIssue["kind"], ExtensionDiagnosticCode> = {
    "too-large": "manifest-too-large",
    "too-deep": "manifest-json-depth",
    syntax: "manifest-json-syntax",
    "duplicate-key": "manifest-duplicate-key",
  }
  return {
    code: codeByKind[issue.kind],
    severity: "error",
    message: issue.message,
    pointer: issue.pointer,
    offset: issue.offset,
    length: issue.length,
  }
}

export function extensionCanonicalId(
  manifest: Pick<ExtensionManifestV1, "publisher" | "name">
): string {
  return `${manifest.publisher}.${manifest.name}`
}

export function isPortableExtensionEntrypoint(value: string): boolean {
  if (
    !value ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value)
  ) {
    return false
  }
  const segments = value.split("/")
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === ".."
    ) ||
    path.posix.normalize(value) !== value
  ) {
    return false
  }
  return /\.(?:ts|tsx|js|jsx)$/.test(value)
}

function isPortablePermissionPattern(value: string): boolean {
  if (
    !value ||
    value !== value.trim() ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value)
  ) {
    return false
  }
  const segments = value.split("/")
  return !segments.some(
    (segment) => segment === "" || segment === "." || segment === ".."
  )
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
}

function normalizePermissions(
  permissions: ExtensionPermissions,
  diagnostics: ExtensionDiagnostic[]
): NormalizedExtensionPermissions | undefined {
  const read = [...permissions.files.read]
  const write = [...permissions.files.write]
  for (const [scope, patterns] of [
    ["read", read],
    ["write", write],
  ] as const) {
    patterns.forEach((pattern, index) => {
      if (!isPortablePermissionPattern(pattern)) {
        diagnostics.push({
          code: "manifest-permission-invalid",
          severity: "error",
          message: `File ${scope} pattern must be a portable Space-relative pattern: ${pattern}`,
          pointer: `/permissions/files/${scope}/${index}`,
        })
      }
    })
  }

  const network: string[] = []
  const seenOrigins = new Set<string>()
  permissions.network.forEach((origin, index) => {
    try {
      const url = new URL(origin)
      const canonical = url.origin
      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        origin !== canonical
      ) {
        throw new Error("origin is not canonical HTTPS")
      }
      if (seenOrigins.has(canonical)) {
        throw new Error("origin is duplicated after normalization")
      }
      seenOrigins.add(canonical)
      network.push(canonical)
    } catch {
      diagnostics.push({
        code: "manifest-permission-invalid",
        severity: "error",
        message: `Network permission must be one canonical HTTPS origin: ${origin}`,
        pointer: `/permissions/network/${index}`,
      })
    }
  })

  if (
    diagnostics.some(
      (diagnostic) => diagnostic.code === "manifest-permission-invalid"
    )
  ) {
    return undefined
  }

  return {
    files: {
      read: read.sort(compareUtf8),
      write: write.sort(compareUtf8),
    },
    network: network.sort(compareUtf8),
  }
}

function validateManifestSemantics(
  manifest: ExtensionManifestV1,
  options: AnalyzeExtensionManifestOptions,
  diagnostics: ExtensionDiagnostic[]
): {
  canonicalId: string
  compatible: boolean | null
  normalizedPermissions?: NormalizedExtensionPermissions
} {
  const canonicalId = extensionCanonicalId(manifest)
  if (RESERVED_EXTENSION_PUBLISHERS.has(manifest.publisher)) {
    diagnostics.push({
      code: "manifest-reserved-publisher",
      severity: "error",
      message: `Publisher ${manifest.publisher} is reserved for Eidos built-ins`,
      pointer: "/publisher",
    })
  }
  if (
    options.packageDirectoryName &&
    options.packageDirectoryName !== canonicalId
  ) {
    diagnostics.push({
      code: "manifest-directory-mismatch",
      severity: "error",
      message: `Package directory must be named ${canonicalId}`,
      pointer: "",
    })
  }

  const range = manifest.engines.eidos
  if (range !== range.trim() || !validRange(range)) {
    diagnostics.push({
      code: "manifest-semver",
      severity: "error",
      message: `engines.eidos is not a valid semantic-version range: ${range}`,
      pointer: "/engines/eidos",
    })
  }

  for (const [kind, entrypoint] of Object.entries(manifest.entrypoints)) {
    if (entrypoint && !isPortableExtensionEntrypoint(entrypoint)) {
      diagnostics.push({
        code: "manifest-entrypoint-invalid",
        severity: "error",
        message: `${kind} entrypoint must be a normalized package-relative JS/TS path`,
        pointer: `/entrypoints/${kind}`,
      })
    }
  }

  const commands = manifest.contributes.commands ?? []
  const fileEditors = manifest.contributes.fileEditors ?? []
  const panels = manifest.contributes.panels ?? []
  const baseViews = manifest.contributes.baseViews ?? []
  const menus = manifest.contributes.menus ?? {}
  if (
    commands.length === 0 &&
    fileEditors.length === 0 &&
    panels.length === 0 &&
    baseViews.length === 0
  ) {
    diagnostics.push({
      code: "manifest-no-contributions",
      severity: "error",
      message: "Manifest v1 requires at least one activatable contribution",
      pointer: "/contributes",
    })
  }
  if (commands.length > 0 && !manifest.entrypoints.worker) {
    diagnostics.push({
      code: "manifest-entrypoint-required",
      severity: "error",
      message: "Command contributions require entrypoints.worker",
      pointer: "/entrypoints/worker",
    })
  }
  if (fileEditors.length > 0 && !manifest.entrypoints.ui) {
    diagnostics.push({
      code: "manifest-entrypoint-required",
      severity: "error",
      message: "File editor contributions require entrypoints.ui",
      pointer: "/entrypoints/ui",
    })
  }
  if (panels.length > 0 && !manifest.entrypoints.ui) {
    diagnostics.push({
      code: "manifest-entrypoint-required",
      severity: "error",
      message: "Panel contributions require entrypoints.ui",
      pointer: "/entrypoints/ui",
    })
  }
  if (baseViews.length > 0 && !manifest.entrypoints.ui) {
    diagnostics.push({
      code: "manifest-entrypoint-required",
      severity: "error",
      message: "Base view contributions require entrypoints.ui",
      pointer: "/entrypoints/ui",
    })
  }

  const contributionIds = new Set<string>()
  const commandIds = new Set<string>()
  for (const [collection, contributions] of [
    ["commands", commands],
    ["fileEditors", fileEditors],
    ["panels", panels],
    ["baseViews", baseViews],
  ] as const) {
    contributions.forEach((contribution, index) => {
      if (!contribution.id.startsWith(`${canonicalId}.`)) {
        diagnostics.push({
          code: "manifest-id-namespace",
          severity: "error",
          message: `Contribution ID must start with ${canonicalId}.`,
          pointer: `/contributes/${collection}/${index}/id`,
        })
      }
      if (contributionIds.has(contribution.id)) {
        diagnostics.push({
          code: "manifest-duplicate-contribution",
          severity: "error",
          message: `Duplicate contribution ID: ${contribution.id}`,
          pointer: `/contributes/${collection}/${index}/id`,
        })
      }
      contributionIds.add(contribution.id)
      if (collection === "commands") commandIds.add(contribution.id)
    })
  }

  for (const [menu, items] of Object.entries(menus)) {
    items.forEach((item, index) => {
      if (!commandIds.has(item.command)) {
        diagnostics.push({
          code: "manifest-command-missing",
          severity: "error",
          message: `Menu ${menu} references undeclared command ${item.command}`,
          pointer: `/contributes/menus/${menu.replace(/~/g, "~0").replace(/\//g, "~1")}/${index}/command`,
        })
      }
    })
  }

  const normalizedPermissions = normalizePermissions(
    manifest.permissions,
    diagnostics
  )

  let compatible: boolean | null = null
  if (options.hostVersion !== undefined) {
    if (!valid(options.hostVersion)) {
      throw new Error(`Invalid Eidos host version: ${options.hostVersion}`)
    }
    compatible =
      Boolean(validRange(range)) && satisfies(options.hostVersion, range)
    if (!compatible) {
      diagnostics.push({
        code: "manifest-incompatible",
        severity: "warning",
        message: `Extension requires Eidos ${range}; current host is ${options.hostVersion}`,
        pointer: "/engines/eidos",
      })
    }
  }

  return { canonicalId, compatible, normalizedPermissions }
}

export function analyzeExtensionManifest(
  text: string,
  options: AnalyzeExtensionManifestOptions = {}
): ExtensionManifestAnalysis {
  const strict = parseStrictJson(text, {
    label: "extension.json",
    maxBytes: options.maxBytes ?? DEFAULT_MAX_MANIFEST_BYTES,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_MANIFEST_DEPTH,
  })
  if (strict.issues.length > 0) {
    return {
      valid: false,
      compatible: null,
      diagnostics: strict.issues.map(strictJsonDiagnostic),
    }
  }
  if (!validateSchema(strict.value)) {
    return {
      valid: false,
      compatible: null,
      diagnostics: (validateSchema.errors ?? []).map(schemaDiagnostic),
    }
  }

  const diagnostics: ExtensionDiagnostic[] = []
  const semantic = validateManifestSemantics(strict.value, options, diagnostics)
  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    compatible: semantic.compatible,
    canonicalId: semantic.canonicalId,
    manifest: strict.value,
    normalizedPermissions: semantic.normalizedPermissions,
    diagnostics,
  }
}

export { manifestSchema }
