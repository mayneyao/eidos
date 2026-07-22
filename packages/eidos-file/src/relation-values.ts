import { EidosFileError } from "./errors"
import { isEidosFileUuid } from "./identifiers"
import type { EidosFileRelationValue, EidosFileRowValue } from "./types"

const MAX_RELATION_VALUES = 10_000

function parseRelationIds(
  value: EidosFileRowValue | undefined
): unknown[] | null {
  if (typeof value !== "string") return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function decodeEidosFileRelationIds(
  value: EidosFileRowValue | undefined
): string[] {
  if (value === undefined || value === null) return []
  const parsed = parseRelationIds(value)
  if (!parsed) {
    throw new EidosFileError(
      "invalid-value",
      "Relation value must be a JSON array"
    )
  }
  if (parsed.length > MAX_RELATION_VALUES) {
    throw new EidosFileError(
      "resource-limit",
      "Relation contains too many targets"
    )
  }
  if (!parsed.every(isEidosFileUuid)) {
    throw new EidosFileError(
      "invalid-value",
      "Relation values must be lowercase hyphenated UUIDv7 strings"
    )
  }
  if (new Set(parsed).size !== parsed.length) {
    throw new EidosFileError(
      "invalid-value",
      "Relation target Row IDs must be unique"
    )
  }
  return parsed as string[]
}

export function encodeEidosFileRelationIds(ids: readonly string[]): string {
  if (ids.length > MAX_RELATION_VALUES) {
    throw new EidosFileError(
      "resource-limit",
      "Relation contains too many targets"
    )
  }
  if (!ids.every(isEidosFileUuid)) {
    throw new EidosFileError(
      "invalid-value",
      "Relation values must be lowercase hyphenated UUIDv7 strings"
    )
  }
  if (new Set(ids).size !== ids.length) {
    throw new EidosFileError(
      "invalid-value",
      "Relation target Row IDs must be unique"
    )
  }
  return JSON.stringify(ids)
}

/** Reads generated Relation presentation values, never canonical cells. */
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
        !isEidosFileUuid(entry.id) ||
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
