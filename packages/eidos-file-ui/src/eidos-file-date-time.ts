export interface EidosFileDateTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0")
}

function numericPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): number {
  return Number(parts.find((part) => part.type === type)?.value ?? "0")
}

/** Returns wall-clock parts in the selected zone, or in the system zone. */
export function eidosFileDateTimeParts(
  date: Date,
  timeZone?: string
): EidosFileDateTimeParts {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    }
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  return {
    year: numericPart(parts, "year"),
    month: numericPart(parts, "month"),
    day: numericPart(parts, "day"),
    hour: numericPart(parts, "hour"),
    minute: numericPart(parts, "minute"),
    second: numericPart(parts, "second"),
  }
}

export function eidosFileDateKey(date: Date, timeZone?: string): string {
  const parts = eidosFileDateTimeParts(date, timeZone)
  return `${String(parts.year).padStart(4, "0")}-${twoDigits(parts.month)}-${twoDigits(parts.day)}`
}

export function eidosFileDateTimeText(date: Date, timeZone?: string): string {
  const parts = eidosFileDateTimeParts(date, timeZone)
  return `${String(parts.year).padStart(4, "0")}-${twoDigits(parts.month)}-${twoDigits(parts.day)} ${twoDigits(parts.hour)}:${twoDigits(parts.minute)}:${twoDigits(parts.second)}`
}

export function eidosFileDateTimeInputValue(
  date: Date,
  timeZone?: string,
  includeSeconds = false
): string {
  const text = eidosFileDateTimeText(date, timeZone).replace(" ", "T")
  return includeSeconds ? text : text.slice(0, 16)
}

/** Parses an HTML date/datetime-local value without applying a time zone. */
export function eidosFileWallDateFromInputValue(
  value: string
): Date | undefined {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/u.exec(
      value
    )
  if (!match) return undefined
  const millisecond = Number((match[7] ?? "0").padEnd(3, "0"))
  const target: EidosFileDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
  }
  const date = new Date(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
    millisecond
  )
  const localParts: EidosFileDateTimeParts = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  }
  return !Number.isNaN(date.getTime()) &&
    date.getMilliseconds() === millisecond &&
    sameParts(localParts, target)
    ? date
    : undefined
}

/** Parses an instant or interprets an HTML datetime-local value in a zone. */
export function eidosFileInstantFromInputValue(
  value: string,
  timeZone?: string
): Date | undefined {
  if (/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    const instant = new Date(value)
    return Number.isNaN(instant.getTime()) ? undefined : instant
  }
  const wallDate = eidosFileWallDateFromInputValue(value)
  return wallDate ? eidosFileInstantFromWallDate(wallDate, timeZone) : undefined
}

/**
 * Produces a local Date whose visible fields match the selected zone. This is
 * presentation-only and is useful for calendar controls that operate on local
 * year/month/day fields.
 */
export function eidosFileWallDate(date: Date, timeZone?: string): Date {
  const parts = eidosFileDateTimeParts(date, timeZone)
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
}

function sameParts(
  left: EidosFileDateTimeParts,
  right: EidosFileDateTimeParts
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  )
}

function offsetAt(instantMs: number, timeZone: string): number {
  const date = new Date(instantMs)
  const parts = eidosFileDateTimeParts(date, timeZone)
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return wallAsUtc - Math.trunc(instantMs / 1_000) * 1_000
}

/**
 * Interprets the local fields of `wallDate` in an IANA zone. DST gaps and
 * overlaps return undefined instead of silently choosing a different instant.
 */
export function eidosFileInstantFromWallDate(
  wallDate: Date,
  timeZone?: string
): Date | undefined {
  const resolvedTimeZone = eidosFileResolvedTimeZone(timeZone)
  const target: EidosFileDateTimeParts = {
    year: wallDate.getFullYear(),
    month: wallDate.getMonth() + 1,
    day: wallDate.getDate(),
    hour: wallDate.getHours(),
    minute: wallDate.getMinutes(),
    second: wallDate.getSeconds(),
  }
  const wallAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
    wallDate.getMilliseconds()
  )
  const sampleOffsets = new Set(
    [-36, -12, 0, 12, 36].map((hours) =>
      offsetAt(wallAsUtc + hours * 60 * 60 * 1_000, resolvedTimeZone)
    )
  )
  const matches = [...sampleOffsets]
    .map((offset) => new Date(wallAsUtc - offset))
    .filter(
      (candidate) =>
        sameParts(
          eidosFileDateTimeParts(candidate, resolvedTimeZone),
          target
        ) && candidate.getMilliseconds() === wallDate.getMilliseconds()
    )
  return matches.length === 1 ? matches[0] : undefined
}

export function eidosFileResolvedTimeZone(timeZone?: string): string {
  return timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"
}
