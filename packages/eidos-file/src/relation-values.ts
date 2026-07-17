import type { EidosFileRelationValue, EidosFileRowValue } from "./types"
import { decodeEidosFileStringArray } from "./json-array-values"

const MAX_RELATION_VALUES = 500

export function decodeEidosFileRelationIds(
  value: EidosFileRowValue | undefined
): string[] {
  return Array.from(
    new Set(
      decodeEidosFileStringArray(value)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, MAX_RELATION_VALUES)
    )
  )
}

export function encodeEidosFileRelationIds(
  ids: readonly string[]
): string | null {
  const normalized = Array.from(
    new Set(ids.map((id) => id.trim()).filter(Boolean))
  ).slice(0, MAX_RELATION_VALUES)
  return normalized.length > 0 ? JSON.stringify(normalized) : null
}

export function decodeEidosFileRelationDisplay(
  value: EidosFileRowValue | undefined
): EidosFileRelationValue[] {
  if (typeof value !== "string" || value.length === 0) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_RELATION_VALUES).flatMap((entry) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("id" in entry) ||
        !("title" in entry) ||
        typeof entry.id !== "string" ||
        typeof entry.title !== "string"
      ) {
        return []
      }
      return [{ id: entry.id, title: entry.title }]
    })
  } catch {
    return []
  }
}
