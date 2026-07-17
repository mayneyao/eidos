import type { EidosFileRowValue } from "./types"
import { decodeEidosFileStringArray } from "./json-array-values"

const EXTERNAL_REFERENCE = /^(?:https?:|data:)/i

export function normalizeEidosFileAttachmentPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes("\0")) return null
  if (EXTERNAL_REFERENCE.test(trimmed)) return trimmed
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return null

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
  return normalized.length > 0 ? normalized.join("/") : null
}

export function decodeEidosFileAttachmentPaths(
  value: EidosFileRowValue | undefined
): string[] {
  const candidates = decodeEidosFileStringArray(value)
  const seen = new Set<string>()
  return candidates.flatMap((candidate) => {
    const normalized = normalizeEidosFileAttachmentPath(candidate)
    if (!normalized || seen.has(normalized)) return []
    seen.add(normalized)
    return [normalized]
  })
}

export function encodeEidosFileAttachmentPaths(
  paths: readonly string[]
): string | null {
  const normalized = decodeEidosFileAttachmentPaths(JSON.stringify(paths))
  return normalized.length > 0 ? JSON.stringify(normalized) : null
}
