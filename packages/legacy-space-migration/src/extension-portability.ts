import type { LegacyExtension } from "./types"

export type LegacyExtensionMetadataState = "valid" | "missing" | "invalid"

export type LegacyExtensionSourceState =
  | "typescript-and-javascript"
  | "typescript"
  | "javascript"
  | "missing"

export type LegacyExtensionPortabilityReadiness =
  | "manual-port"
  | "blocked-by-v1"
  | "needs-review"
  | "source-missing"

export type FileBasedContributionCandidate = "command" | "file-editor" | null

export interface LegacyExtensionPortabilityAssessment {
  readiness: LegacyExtensionPortabilityReadiness
  reasonCode:
    | "manual-command-port"
    | "manual-file-editor-port"
    | "unsupported-contribution"
    | "metadata-missing"
    | "contribution-missing"
    | "metadata-invalid"
    | "source-missing"
  legacyContribution: string | null
  candidateContribution: FileBasedContributionCandidate
  metadataState: LegacyExtensionMetadataState
  sourceState: LegacyExtensionSourceState
  legacyFileExtensions: string[]
  summary: string
  manualSteps: string[]
}

interface ParsedLegacyMetadata {
  state: LegacyExtensionMetadataState
  contribution: string | null
  fileExtensions: string[]
}

const COMMAND_CONTRIBUTIONS = new Set([
  "tableAction",
  "docAction",
  "fileAction",
])

const UNSUPPORTED_V1_CONTRIBUTIONS = new Set([
  "tableView",
  "extNode",
  "folderHandler",
  "tool",
  "udf",
  "relayHandler",
])

function sourceState(extension: LegacyExtension): LegacyExtensionSourceState {
  if (extension.tsCode !== null && extension.code !== null) {
    return "typescript-and-javascript"
  }
  if (extension.tsCode !== null) return "typescript"
  if (extension.code !== null) return "javascript"
  return "missing"
}

function parseMetadata(extension: LegacyExtension): ParsedLegacyMetadata {
  if (!extension.metaJson?.trim()) {
    return { state: "missing", contribution: null, fileExtensions: [] }
  }
  try {
    const metadata: unknown = JSON.parse(extension.metaJson)
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return { state: "invalid", contribution: null, fileExtensions: [] }
    }
    const record = metadata as Record<string, unknown>
    const contribution =
      typeof record.type === "string" && record.type.trim()
        ? record.type.trim()
        : null
    const fileHandler =
      record.fileHandler &&
      typeof record.fileHandler === "object" &&
      !Array.isArray(record.fileHandler)
        ? (record.fileHandler as Record<string, unknown>)
        : null
    const fileAction =
      record.fileAction &&
      typeof record.fileAction === "object" &&
      !Array.isArray(record.fileAction)
        ? (record.fileAction as Record<string, unknown>)
        : null
    const rawExtensions = fileHandler?.extensions ?? fileAction?.extensions
    const fileExtensions = Array.isArray(rawExtensions)
      ? rawExtensions.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0
        )
      : []
    return { state: "valid", contribution, fileExtensions }
  } catch {
    return { state: "invalid", contribution: null, fileExtensions: [] }
  }
}

function baseManualSteps(candidate: "command" | "file-editor"): string[] {
  const template = candidate === "file-editor" ? "text-editor" : candidate
  return [
    `Create a new ${template} package with the file-based extension developer tools.`,
    "Copy only reviewed business logic; do not execute the archived compiled output.",
    "Replace the legacy global eidos API with the capability-scoped extension context.",
    "Declare the minimum file and network permissions required by the new package.",
    "Run eidos-extension check before installing, trusting, or enabling the package.",
  ]
}

export function assessLegacyExtensionPortability(
  extension: LegacyExtension
): LegacyExtensionPortabilityAssessment {
  const source = sourceState(extension)
  const metadata = parseMetadata(extension)

  if (source === "missing") {
    return {
      readiness: "source-missing",
      reasonCode: "source-missing",
      legacyContribution: metadata.contribution,
      candidateContribution: null,
      metadataState: metadata.state,
      sourceState: source,
      legacyFileExtensions: metadata.fileExtensions,
      summary:
        "Neither original TypeScript nor compiled JavaScript was stored, so this record can only be preserved as metadata.",
      manualSteps: [
        "Locate the original source repository or marketplace package.",
        "Keep this archive as identity and metadata evidence until source is recovered.",
      ],
    }
  }

  if (metadata.state === "invalid") {
    return {
      readiness: "needs-review",
      reasonCode: "metadata-invalid",
      legacyContribution: null,
      candidateContribution: null,
      metadataState: metadata.state,
      sourceState: source,
      legacyFileExtensions: metadata.fileExtensions,
      summary:
        "The stored legacy metadata is not valid JSON and must be repaired or reconstructed before mapping its contribution.",
      manualSteps: [
        "Inspect metaJson in legacy-extension.json without rewriting the original value.",
        "Reconstruct the contribution contract from the archived source and legacy documentation.",
      ],
    }
  }

  if (metadata.state === "missing") {
    return {
      readiness: "needs-review",
      reasonCode: "metadata-missing",
      legacyContribution: null,
      candidateContribution: null,
      metadataState: metadata.state,
      sourceState: source,
      legacyFileExtensions: metadata.fileExtensions,
      summary:
        "The legacy contribution metadata is missing, so the source must be classified before a v1 package can be designed.",
      manualSteps: [
        "Review the archived entrypoint and identify how users invoked or opened it.",
        "Choose a supported v1 command or file-editor contribution, or keep it archived.",
      ],
    }
  }

  if (!metadata.contribution) {
    return {
      readiness: "needs-review",
      reasonCode: "contribution-missing",
      legacyContribution: null,
      candidateContribution: null,
      metadataState: metadata.state,
      sourceState: source,
      legacyFileExtensions: metadata.fileExtensions,
      summary:
        "The stored metadata is valid JSON but does not identify a legacy contribution type.",
      manualSteps: [
        "Review the archived entrypoint and identify how users invoked or opened it.",
        "Choose a supported v1 command or file-editor contribution, or keep it archived.",
      ],
    }
  }

  if (COMMAND_CONTRIBUTIONS.has(metadata.contribution)) {
    return {
      readiness: "manual-port",
      reasonCode: "manual-command-port",
      legacyContribution: metadata.contribution,
      candidateContribution: "command",
      metadataState: metadata.state,
      sourceState: source,
      legacyFileExtensions: metadata.fileExtensions,
      summary: `Legacy ${metadata.contribution} can be redesigned as a v1 command, but its runtime code and context contract require manual review.`,
      manualSteps: baseManualSteps("command"),
    }
  }

  if (metadata.contribution === "fileHandler") {
    return {
      readiness: "manual-port",
      reasonCode: "manual-file-editor-port",
      legacyContribution: metadata.contribution,
      candidateContribution: "file-editor",
      metadataState: metadata.state,
      sourceState: source,
      legacyFileExtensions: metadata.fileExtensions,
      summary:
        "Legacy fileHandler can be redesigned as a v1 file editor, but its UI bridge and file selectors require manual review.",
      manualSteps: baseManualSteps("file-editor"),
    }
  }

  const knownUnsupported = UNSUPPORTED_V1_CONTRIBUTIONS.has(
    metadata.contribution
  )
  return {
    readiness: "blocked-by-v1",
    reasonCode: "unsupported-contribution",
    legacyContribution: metadata.contribution,
    candidateContribution: null,
    metadataState: metadata.state,
    sourceState: source,
    legacyFileExtensions: metadata.fileExtensions,
    summary: knownUnsupported
      ? `Legacy ${metadata.contribution} has no equivalent contribution in the v1 file-based extension manifest.`
      : `Unknown legacy contribution ${metadata.contribution} has no verified mapping to the v1 file-based extension manifest.`,
    manualSteps: [
      "Keep the source archive outside the runnable extension directory.",
      "Wait for a compatible host contribution or redesign the feature using supported commands and file editors.",
    ],
  }
}
