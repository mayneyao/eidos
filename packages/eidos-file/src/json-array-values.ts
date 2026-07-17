import type { EidosFileRowValue } from "./types"

export type EidosFileJsonArrayValue = string | number | boolean | null

export function decodeEidosFileJsonArray(
  value: EidosFileRowValue | undefined
): EidosFileJsonArrayValue[] {
  if (typeof value !== "string" || value.length === 0) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is EidosFileJsonArrayValue =>
        entry === null ||
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean"
    )
  } catch {
    return []
  }
}

export function decodeEidosFileStringArray(
  value: EidosFileRowValue | undefined
): string[] {
  return decodeEidosFileJsonArray(value).filter(
    (entry): entry is string => typeof entry === "string"
  )
}

export function encodeEidosFileJsonArray(
  values: readonly EidosFileJsonArrayValue[]
): string | null {
  return values.length > 0 ? JSON.stringify(values) : null
}
