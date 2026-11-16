import { EidosFileError } from "./errors"
import { normalizeEidosFileInstant } from "./temporal"

/** Exact comparison key for external RFC 3339 source values, never API input. */
export function sourceInstantComparisonKey(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== "string")
    throw new EidosFileError(
      "invalid-value",
      "Source timestamp must be RFC 3339 text"
    )
  const parts =
    /^(\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/.exec(
      value
    )
  if (!parts)
    throw new EidosFileError(
      "invalid-value",
      "Source timestamp must be RFC 3339 text"
    )
  // Normalize only the whole second. Retain the entire fractional decimal
  // separately so neither Date nor a floating-point epoch can round it.
  const second = normalizeEidosFileInstant(
    `${parts[1]}.000${parts[3]}`,
    "Source timestamp"
  )
  const fraction = (parts[2] ?? "").replace(/0+$/, "").padEnd(9, "0")
  return `${second.slice(0, 19)}.${fraction}`
}
