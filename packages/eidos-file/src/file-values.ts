import { canonicalizeEidosFileJson, parseEidosFileJson } from "./canonical-json"
import { EidosFileError } from "./errors"
import { createEidosFileUuid, isEidosFileUuid } from "./identifiers"
import type { EidosFileFileValue, EidosFileRowValue } from "./types"

const MAX_FILE_VALUES = 10_000
const MAX_FILE_JSON_BYTES = 16 * 1_024 * 1_024
const MAX_INLINE_IMAGE_BYTES = 1_048_576n
const NON_NEGATIVE_INT64 = /^(?:0|[1-9][0-9]*)$/u
const MEDIA_TYPE_RESTRICTED_NAME = /^[0-9A-Za-z][!#$&+.^_0-9A-Za-z-]{0,126}$/u
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u
const URI_REFERENCE_ASCII =
  /^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/?#\[\]]|%[0-9A-Fa-f]{2})*$/u
const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n
const encoder = new TextEncoder()

export type EidosFileUriClass = "relative" | "https" | "data"

function hasHttpsAuthorityWithoutUrl(uri: string): boolean {
  const authorityAndRest = uri.slice("https://".length)
  const authorityEnd = authorityAndRest.search(/[/?#]/u)
  const authority =
    authorityEnd < 0
      ? authorityAndRest
      : authorityAndRest.slice(0, authorityEnd)
  if (authority.length === 0) return false

  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1)
  if (hostAndPort.length === 0) return false
  if (hostAndPort.startsWith("[")) {
    const closingBracket = hostAndPort.indexOf("]")
    if (closingBracket <= 1) return false
    const suffix = hostAndPort.slice(closingBracket + 1)
    return suffix === "" || /^:[0-9]+$/u.test(suffix)
  }

  const separator = hostAndPort.lastIndexOf(":")
  const host = separator < 0 ? hostAndPort : hostAndPort.slice(0, separator)
  const port = separator < 0 ? "" : hostAndPort.slice(separator + 1)
  return (
    host.length > 0 &&
    !host.includes(":") &&
    (separator < 0 || /^[0-9]+$/u.test(port))
  )
}

function isEidosFileMediaType(value: string): boolean {
  const separator = value.indexOf("/")
  return (
    separator > 0 &&
    separator === value.lastIndexOf("/") &&
    MEDIA_TYPE_RESTRICTED_NAME.test(value.slice(0, separator)) &&
    MEDIA_TYPE_RESTRICTED_NAME.test(value.slice(separator + 1))
  )
}

function decodedBase64Size(payload: string): bigint | null {
  if (
    payload.length === 0 ||
    payload.length % 4 !== 0 ||
    !CANONICAL_BASE64.test(payload)
  ) {
    return null
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  if (padding === 2) {
    const last = alphabet.indexOf(payload[payload.length - 3] ?? "")
    if (last < 0 || (last & 0b1111) !== 0) return null
  } else if (padding === 1) {
    const last = alphabet.indexOf(payload[payload.length - 2] ?? "")
    if (last < 0 || (last & 0b11) !== 0) return null
  }
  return BigInt(payload.length / 4) * 3n - BigInt(padding)
}

function inlineImageDataUrl(
  uri: string
): { mediaType: string; decodedSize: bigint } | null {
  if (!uri.startsWith("data:")) return null
  const marker = ";base64,"
  const markerIndex = uri.indexOf(marker, 5)
  if (markerIndex < 0 || uri.indexOf(marker, markerIndex + 1) >= 0) return null
  const mediaType = uri.slice(5, markerIndex)
  const payload = uri.slice(markerIndex + marker.length)
  if (
    !mediaType.startsWith("image/") ||
    mediaType !== mediaType.toLowerCase() ||
    !isEidosFileMediaType(mediaType)
  ) {
    return null
  }
  const decodedSize = decodedBase64Size(payload)
  if (
    decodedSize === null ||
    decodedSize < 1n ||
    decodedSize > MAX_INLINE_IMAGE_BYTES
  ) {
    return null
  }
  return { mediaType, decodedSize }
}

function isContainedRelativeUri(uri: string): boolean {
  if (
    !URI_REFERENCE_ASCII.test(uri) ||
    uri.includes("\0") ||
    uri.includes("\\") ||
    uri.startsWith("/") ||
    URI_SCHEME.test(uri)
  ) {
    return false
  }
  const pathEnd = uri.search(/[?#]/u)
  const path = pathEnd < 0 ? uri : uri.slice(0, pathEnd)
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return false
  }
  if (decoded.startsWith("/") || decoded.includes("\\")) return false
  let depth = 0
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (depth === 0) return false
      depth -= 1
    } else {
      depth += 1
    }
  }
  return true
}

export function eidosFileUriClass(uri: string): EidosFileUriClass | null {
  if (uri.startsWith("data:")) return inlineImageDataUrl(uri) ? "data" : null
  if (/^https:\/\//iu.test(uri)) {
    if (!URI_REFERENCE_ASCII.test(uri)) return null
    if (typeof URL === "undefined") {
      return hasHttpsAuthorityWithoutUrl(uri) ? "https" : null
    }
    try {
      const parsed = new URL(uri)
      return parsed.protocol === "https:" && parsed.hostname.length > 0
        ? "https"
        : null
    } catch {
      return null
    }
  }
  return isContainedRelativeUri(uri) ? "relative" : null
}

export function isSafeEidosFileUri(uri: string): boolean {
  return eidosFileUriClass(uri) !== null
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
  let canonicalBytes = 2
  return value.map((entry, index) => {
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
      typeof candidate.name !== "string" ||
      candidate.name.length === 0 ||
      candidate.name.includes("\u0000") ||
      typeof candidate.mediaType !== "string" ||
      !isEidosFileMediaType(candidate.mediaType) ||
      typeof candidate.size !== "string" ||
      !NON_NEGATIVE_INT64.test(candidate.size) ||
      BigInt(candidate.size) > MAX_SIGNED_INT64
    ) {
      throw new EidosFileError(
        "invalid-value",
        "File value contains an invalid entry"
      )
    }
    const uriClass = eidosFileUriClass(candidate.uri)
    const inline =
      uriClass === "data" ? inlineImageDataUrl(candidate.uri) : null
    if (
      !uriClass ||
      (inline !== null &&
        (inline.mediaType !== candidate.mediaType ||
          inline.decodedSize !== BigInt(candidate.size)))
    ) {
      throw new EidosFileError(
        "invalid-value",
        "File value contains an invalid entry"
      )
    }
    ids.add(candidate.id)
    const validated = {
      ...candidate,
      id: candidate.id,
      uri: candidate.uri,
      name: candidate.name,
      mediaType: candidate.mediaType,
      size: candidate.size,
    } as EidosFileFileValue
    let entryBytes: number
    try {
      entryBytes = encoder.encode(
        canonicalizeEidosFileJson(validated)
      ).byteLength
    } catch {
      throw new EidosFileError(
        "invalid-value",
        "File value contains an invalid entry"
      )
    }
    canonicalBytes += entryBytes + (index === 0 ? 0 : 1)
    if (canonicalBytes > MAX_FILE_JSON_BYTES) {
      throw new EidosFileError(
        "resource-limit",
        "File value exceeds the 16 MiB canonical JSON limit"
      )
    }
    return validated
  })
}

export function decodeEidosFileValues(
  value: EidosFileRowValue | undefined
): EidosFileFileValue[] {
  if (value === undefined || value === null) return []
  if (typeof value !== "string") {
    throw new EidosFileError(
      "invalid-value",
      "File value must be canonical JSON"
    )
  }
  if (encoder.encode(value).byteLength > MAX_FILE_JSON_BYTES) {
    throw new EidosFileError(
      "resource-limit",
      "File value exceeds the 16 MiB canonical JSON limit"
    )
  }
  let parsed: unknown
  try {
    parsed = parseEidosFileJson(value)
  } catch {
    throw new EidosFileError("invalid-value", "File value must be valid JSON")
  }
  let canonical: string
  try {
    canonical = canonicalizeEidosFileJson(parsed)
  } catch {
    throw new EidosFileError(
      "invalid-value",
      "File value must be canonical JSON"
    )
  }
  if (canonical !== value) {
    throw new EidosFileError(
      "invalid-value",
      "File value must be canonical JSON"
    )
  }
  return assertEidosFileValues(parsed)
}

export function encodeEidosFileValues(
  values: readonly EidosFileFileValue[]
): string {
  return canonicalizeEidosFileJson(assertEidosFileValues([...values]))
}

export function normalizeEidosFileAttachmentPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes("\0")) return null
  if (/^https:\/\//iu.test(trimmed)) {
    return isSafeEidosFileUri(trimmed) ? trimmed : null
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(trimmed) || trimmed.startsWith("/")) {
    return null
  }
  const parts = trimmed.replace(/\\/g, "/").split("/")
  const normalized: string[] = []
  for (const part of parts) {
    if (!part || part === ".") continue
    let decoded: string
    try {
      decoded = decodeURIComponent(part)
    } catch {
      return null
    }
    if (decoded === "..") {
      if (normalized.length === 0) return null
      normalized.pop()
      continue
    }
    if (decoded === ".") continue
    normalized.push(encodeURIComponent(decoded))
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
    const encodedName = uri.split(/[/?#]/u).at(-1)
    let pathName = encodedName
    try {
      pathName = encodedName ? decodeURIComponent(encodedName) : encodedName
    } catch {
      // normalizeEidosFileAttachmentPath already validated percent encoding.
    }
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
