import { EidosFileError } from "./errors"

const CANONICAL_DATE = /^\d{4}-\d{2}-\d{2}$/
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const RFC3339_INSTANT =
  /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|([+-])(\d{2}):(\d{2}))$/

function validCalendarDate(value: string): boolean {
  if (!CANONICAL_DATE.test(value) || value.startsWith("0000-")) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

/** Returns whether a value is the canonical Eidos File calendar date. */
export function isCanonicalEidosFileDate(value: unknown): value is string {
  return typeof value === "string" && validCalendarDate(value)
}

/** Returns whether a value is the canonical 24-octet Eidos File instant. */
export function isCanonicalEidosFileInstant(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_INSTANT.test(value)) return false
  const match = RFC3339_INSTANT.exec(value)
  if (!match || !validCalendarDate(match[1]!)) return false
  const hour = Number(match[2])
  const minute = Number(match[3])
  const second = Number(match[4])
  if (hour > 23 || minute > 59 || second > 59) return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

/** Validates an exact `YYYY-MM-DD` API/storage value. */
export function normalizeEidosFileDate(value: string, label = "date"): string {
  if (!isCanonicalEidosFileDate(value)) {
    throw new EidosFileError(
      "invalid-value",
      `${label} must use canonical YYYY-MM-DD text`
    )
  }
  return value
}

/**
 * Normalizes RFC 3339 API input to the canonical UTC millisecond form.
 * Precision beyond milliseconds is rejected instead of silently truncated.
 */
export function normalizeEidosFileInstant(
  value: string,
  label = "instant"
): string {
  const match = RFC3339_INSTANT.exec(value)
  if (!match || !validCalendarDate(match[1]!)) {
    throw new EidosFileError(
      "invalid-value",
      `${label} must be an RFC 3339 instant`
    )
  }
  const fraction = match[5] ?? ""
  if (fraction.length > 3) {
    throw new EidosFileError(
      "invalid-value",
      `${label} has sub-millisecond precision; lossy conversion was not requested`
    )
  }
  const hour = Number(match[2])
  const minute = Number(match[3])
  const second = Number(match[4])
  const offsetHour = match[8] === undefined ? 0 : Number(match[8])
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9])
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new EidosFileError(
      "invalid-value",
      `${label} must be an RFC 3339 instant`
    )
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    throw new EidosFileError(
      "invalid-value",
      `${label} must be an RFC 3339 instant`
    )
  }
  const canonical = new Date(timestamp).toISOString()
  if (!isCanonicalEidosFileInstant(canonical)) {
    throw new EidosFileError(
      "invalid-value",
      `${label} must resolve to a UTC year from 0001 through 9999`
    )
  }
  return canonical
}

/** Returns the current canonical UTC instant. */
export function currentEidosFileInstant(now = new Date()): string {
  const value = now.toISOString()
  if (!isCanonicalEidosFileInstant(value)) {
    throw new EidosFileError(
      "invalid-value",
      "Current time is outside the canonical Eidos File instant range"
    )
  }
  return value
}

/** SQLite CHECK body for a nullable canonical date expression. */
export function eidosFileDateSqlCheck(expression: string): string {
  return `${expression} IS NULL OR (
    length(CAST(${expression} AS BLOB)) = 10
    AND ${expression} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND substr(${expression}, 1, 4) <> '0000'
    AND coalesce(strftime('%Y-%m-%d', ${expression}, '+0 days') = ${expression}, 0)
  )`
}

/** SQLite CHECK body for a nullable canonical instant expression. */
export function eidosFileInstantSqlCheck(expression: string): string {
  return `${expression} IS NULL OR (
    length(CAST(${expression} AS BLOB)) = 24
    AND ${expression} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    AND substr(${expression}, 1, 4) <> '0000'
    AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', ${expression}, '+0 seconds') = ${expression}, 0)
  )`
}
