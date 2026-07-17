import type { BaseRelationValue, BaseRowValue } from "./types"
import { decodeBaseStringArray } from "./json-array-values"

const MAX_RELATION_VALUES = 500

export function decodeBaseRelationIds(
  value: BaseRowValue | undefined
): string[] {
  return Array.from(
    new Set(
      decodeBaseStringArray(value)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, MAX_RELATION_VALUES)
    )
  )
}

export function encodeBaseRelationIds(ids: readonly string[]): string | null {
  const normalized = Array.from(
    new Set(ids.map((id) => id.trim()).filter(Boolean))
  ).slice(0, MAX_RELATION_VALUES)
  return normalized.length > 0 ? JSON.stringify(normalized) : null
}

export function decodeBaseRelationDisplay(
  value: BaseRowValue | undefined
): BaseRelationValue[] {
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
