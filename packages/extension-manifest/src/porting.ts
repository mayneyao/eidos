import { parseStrictJson } from "./strict-json"

export const LEGACY_EXTENSION_PORTING_RECEIPT_FILENAME = "PORTING.json"
export const DEFAULT_MAX_PORTING_RECEIPT_BYTES = 64 * 1024
export const DEFAULT_MAX_PORTING_RECEIPT_DEPTH = 12

export type LegacyExtensionPortingContribution = "command" | "file-editor"

export interface LegacyExtensionPortingReceiptV1 {
  format: "eidos-legacy-extension-port"
  formatVersion: 1
  source: {
    legacyExtensionId: string
    legacySlug: string | null
    archiveDigest: string
  }
  target: {
    canonicalPackageId: string
    candidateContribution: LegacyExtensionPortingContribution
  }
  state: "draft"
}

export type LegacyExtensionPortingReceiptDiagnosticCode =
  | "porting-receipt-json"
  | "porting-receipt-schema"
  | "porting-receipt-target-mismatch"

export interface LegacyExtensionPortingReceiptDiagnostic {
  code: LegacyExtensionPortingReceiptDiagnosticCode
  message: string
  pointer?: string
}

export interface AnalyzeLegacyExtensionPortingReceiptOptions {
  expectedCanonicalPackageId?: string
  expectedCandidateContribution?: LegacyExtensionPortingContribution
  maxBytes?: number
  maxDepth?: number
}

export interface LegacyExtensionPortingReceiptAnalysis {
  valid: boolean
  receipt?: LegacyExtensionPortingReceiptV1
  diagnostics: LegacyExtensionPortingReceiptDiagnostic[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[]
): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...required].sort()
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  )
}

function isBoundedIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !/[\0\r\n]/.test(value)
  )
}

function isCanonicalPackageId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z][a-z0-9-]{1,62}\.[a-z][a-z0-9-]{1,62}$/.test(value)
  )
}

function invalidSchema(): LegacyExtensionPortingReceiptAnalysis {
  return {
    valid: false,
    diagnostics: [
      {
        code: "porting-receipt-schema",
        message:
          "PORTING.json does not match the version 1 legacy porting receipt contract",
      },
    ],
  }
}

export function analyzeLegacyExtensionPortingReceipt(
  text: string,
  options: AnalyzeLegacyExtensionPortingReceiptOptions = {}
): LegacyExtensionPortingReceiptAnalysis {
  const parsed = parseStrictJson(text, {
    label: LEGACY_EXTENSION_PORTING_RECEIPT_FILENAME,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_PORTING_RECEIPT_BYTES,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_PORTING_RECEIPT_DEPTH,
  })
  if (parsed.issues.length > 0) {
    return {
      valid: false,
      diagnostics: parsed.issues.map((issue) => ({
        code: "porting-receipt-json" as const,
        message: issue.message,
        pointer: issue.pointer,
      })),
    }
  }

  const value = parsed.value
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "format",
      "formatVersion",
      "source",
      "target",
      "state",
    ]) ||
    value.format !== "eidos-legacy-extension-port" ||
    value.formatVersion !== 1 ||
    value.state !== "draft" ||
    !isRecord(value.source) ||
    !hasExactKeys(value.source, [
      "legacyExtensionId",
      "legacySlug",
      "archiveDigest",
    ]) ||
    !isBoundedIdentity(value.source.legacyExtensionId) ||
    !(
      value.source.legacySlug === null ||
      isBoundedIdentity(value.source.legacySlug)
    ) ||
    typeof value.source.archiveDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.source.archiveDigest) ||
    !isRecord(value.target) ||
    !hasExactKeys(value.target, [
      "canonicalPackageId",
      "candidateContribution",
    ]) ||
    !isCanonicalPackageId(value.target.canonicalPackageId) ||
    !(
      value.target.candidateContribution === "command" ||
      value.target.candidateContribution === "file-editor"
    )
  ) {
    return invalidSchema()
  }

  const receipt = value as unknown as LegacyExtensionPortingReceiptV1
  const diagnostics: LegacyExtensionPortingReceiptDiagnostic[] = []
  if (
    options.expectedCanonicalPackageId &&
    receipt.target.canonicalPackageId !== options.expectedCanonicalPackageId
  ) {
    diagnostics.push({
      code: "porting-receipt-target-mismatch",
      message: `PORTING.json targets ${receipt.target.canonicalPackageId}, but the package ID is ${options.expectedCanonicalPackageId}`,
      pointer: "/target/canonicalPackageId",
    })
  }
  if (
    options.expectedCandidateContribution &&
    receipt.target.candidateContribution !==
      options.expectedCandidateContribution
  ) {
    diagnostics.push({
      code: "porting-receipt-target-mismatch",
      message: `PORTING.json declares a ${receipt.target.candidateContribution} candidate, but the package contribution is ${options.expectedCandidateContribution}`,
      pointer: "/target/candidateContribution",
    })
  }

  return {
    valid: diagnostics.length === 0,
    receipt: diagnostics.length === 0 ? receipt : undefined,
    diagnostics,
  }
}
