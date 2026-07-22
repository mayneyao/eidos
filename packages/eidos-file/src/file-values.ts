import { canonicalizeEidosFileJson, parseEidosFileJson } from "./canonical-json"
import { EidosFileError } from "./errors"
import { createEidosFileUuid, isEidosFileUuid } from "./identifiers"
import type { EidosFileFileValue, EidosFileRowValue } from "./types"

const MAX_FILE_VALUES = 10_000
const NON_NEGATIVE_INT64 = /^(?:0|[1-9][0-9]*)$/u
const MEDIA_TYPE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u
const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n

export function isSafeEidosFileUri(uri: string): boolean {
  if (!uri || uri.includes("\0") || uri.includes("\\")) return false
  if (uri.startsWith("https://")) {
    try {
      return new URL(uri).protocol === "https:"
    } catch {
      return false
    }
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(uri) || uri.startsWith("/")) {
    return false
  }
  try {
    const decoded = decodeURIComponent(uri)
    return (
      !decoded.startsWith("/") &&
      !decoded.includes("\\") &&
      !decoded.split(/[/?#]/u).includes("..")
    )
  } catch {
    return false
  }
}

export function assertEidosFileValues(value: unknown): EidosFileFileValue[] {
  if (!Array.isArray(value)) {
    throw new EidosFileError("invalid-value", "File value must be a JSON array")
  }
  if (value.length > MAX_FILE_VALUES) {
    throw new EidosFileError(
      "resource-limit",
      "File value contains too many entries"
    )
  }
  const ids = new Set<string>()
  return value.map((entry) => {
    if (!entry || Array.isArray(entry) || typeof entry !== "object") {
      throw new EidosFileError(
        "invalid-value",
        "File value contains an invalid entry"
      )
    }
    const candidate = entry as Record<string, unknown>
    if (
      typeof candidate.id !== "string" ||
      !isEidosFileUuid(candidate.id) ||
      ids.has(candidate.id) ||
      typeof candidate.uri !== "string" ||
      !isSafeEidosFileUri(candidate.uri) ||
      typeof candidate.name !== "string" ||
      candidate.name.length === 0 ||
      candidate.name.includes("\u0000") ||
      typeof candidate.mediaType !== "string" ||
      !MEDIA_TYPE.test(candidate.mediaType) ||
      typeof candidate.size !== "string" ||
      !NON_NEGATIVE_INT64.test(candidate.size) ||
      BigInt(candidate.size) > MAX_SIGNED_INT64
    ) {
      throw new EidosFileError(
        "invalid-value",
        "File value contains an invalid entry"
      )
    }
    ids.add(candidate.id)
    return {
      ...candidate,
      id: candidate.id,
      uri: candidate.uri,
      name: candidate.name,
      mediaType: candidate.mediaType,
      size: candidate.size,
    } as EidosFileFileValue
  })
}

export function decodeEidosFileValues(
  value: EidosFileRowValue | undefined
): EidosFileFileValue[] {
  if (value === undefined || value === null || value === "") return []
  if (typeof value !== "string") {
    throw new EidosFileError(
      "invalid-value",
      "File value must be canonical JSON"
    )
  }
  return assertEidosFileValues(parseEidosFileJson(value))
}

export function encodeEidosFileValues(
  values: readonly EidosFileFileValue[]
): string {
  return canonicalizeEidosFileJson(assertEidosFileValues([...values]))
}

export function normalizeEidosFileAttachmentPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes("\0")) return null
  if (trimmed.startsWith("https://")) {
    return isSafeEidosFileUri(trimmed) ? trimmed : null
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(trimmed) || trimmed.startsWith("/")) {
    return null
  }
  const parts = trimmed.replace(/\\/g, "/").split("/")
  const normalized: string[] = []
  for (const part of parts) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (normalized.length === 0) return null
      normalized.pop()
      continue
    }
    normalized.push(part)
  }
  const uri = normalized.join("/")
  return isSafeEidosFileUri(uri) ? uri : null
}

export function decodeEidosFileAttachmentPaths(
  value: EidosFileRowValue | undefined
): string[] {
  return decodeEidosFileValues(value).map((file) => file.uri)
}

/**
 * Compatibility helper for path-oriented host pickers. Existing File IDs are
 * retained by URI; new attachments receive UUIDv7 identities.
 */
export function encodeEidosFileAttachmentPaths(
  paths: readonly string[],
  previousValue?: EidosFileRowValue
): string | null {
  const previous = new Map(
    decodeEidosFileValues(previousValue).map((file) => [file.uri, file])
  )
  const seen = new Set<string>()
  const values = paths.flatMap((path) => {
    const uri = normalizeEidosFileAttachmentPath(path)
    if (!uri || seen.has(uri)) return []
    seen.add(uri)
    const existing = previous.get(uri)
    if (existing) return [existing]
    const pathName = uri.split(/[/?#]/u).at(-1)
    return [
      {
        id: createEidosFileUuid(),
        uri,
        name: pathName || "attachment",
        mediaType: "application/octet-stream",
        size: "0",
      },
    ]
  })
  return values.length > 0 ? encodeEidosFileValues(values) : null
}
