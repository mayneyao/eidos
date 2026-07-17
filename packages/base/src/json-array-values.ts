import type { BaseRowValue } from "./types"

export type BaseJsonArrayValue = string | number | boolean | null

export function decodeBaseJsonArray(
  value: BaseRowValue | undefined
): BaseJsonArrayValue[] {
  if (typeof value !== "string" || value.length === 0) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is BaseJsonArrayValue =>
        entry === null ||
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean"
    )
  } catch {
    return []
  }
}

export function decodeBaseStringArray(
  value: BaseRowValue | undefined
): string[] {
  return decodeBaseJsonArray(value).filter(
    (entry): entry is string => typeof entry === "string"
  )
}

export function encodeBaseJsonArray(
  values: readonly BaseJsonArrayValue[]
): string | null {
  return values.length > 0 ? JSON.stringify(values) : null
}
