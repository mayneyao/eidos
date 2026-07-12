import type { BaseRelationValue, BaseRowValue } from "./types"

const MAX_RELATION_VALUES = 500

export function decodeBaseRelationIds(
  value: BaseRowValue | undefined
): string[] {
  if (typeof value !== "string" || value.trim().length === 0) return []
  const trimmed = value.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => entry.trim())
              .filter(Boolean)
              .slice(0, MAX_RELATION_VALUES)
          )
        )
      }
    } catch {
      // Fall through to the legacy comma-separated representation.
    }
  }
  return Array.from(
    new Set(
      trimmed
        .split(",")
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
