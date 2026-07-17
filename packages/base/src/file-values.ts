import type { BaseRowValue } from "./types"
import { decodeBaseStringArray } from "./json-array-values"

const EXTERNAL_REFERENCE = /^(?:https?:|data:)/i

export function normalizeBaseFilePath(value: string): string | null {
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

export function decodeBaseFilePaths(value: BaseRowValue | undefined): string[] {
  const candidates = decodeBaseStringArray(value)
  const seen = new Set<string>()
  return candidates.flatMap((candidate) => {
    const normalized = normalizeBaseFilePath(candidate)
    if (!normalized || seen.has(normalized)) return []
    seen.add(normalized)
    return [normalized]
  })
}

export function encodeBaseFilePaths(paths: readonly string[]): string | null {
  const normalized = decodeBaseFilePaths(JSON.stringify(paths))
  return normalized.length > 0 ? JSON.stringify(normalized) : null
}
