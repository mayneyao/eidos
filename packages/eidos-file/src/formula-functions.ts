import type { EidosFileConnection, EidosFileSqlPrimitive } from "./connection"

const INT64_MIN = -9_223_372_036_854_775_808n
const INT64_MAX = 9_223_372_036_854_775_807n

export function registerEidosFormulaFunctions(
  connection: EidosFileConnection
): void {
  const fixed = (
    name: string,
    arity: number,
    operation: (...values: EidosFileSqlPrimitive[]) => EidosFileSqlPrimitive
  ) => connection.registerFunction(name, operation, arity)
  fixed("eidos_formula_int_add", 2, (a, b) => intBinary(a, b, (x, y) => x + y))
  fixed("eidos_formula_int_sub", 2, (a, b) => intBinary(a, b, (x, y) => x - y))
  fixed("eidos_formula_int_mul", 2, (a, b) => intBinary(a, b, (x, y) => x * y))
  fixed("eidos_formula_int_mod", 2, (a, b) => {
    if (a === null || b === null) return null
    const left = asInteger(a)
    const right = asInteger(b)
    return right === 0n ? null : left % right
  })
  fixed("eidos_formula_int_neg", 1, (value) => {
    if (value === null) return null
    const integer = asInteger(value)
    return integer === INT64_MIN ? null : -integer
  })
  fixed("eidos_formula_int_abs", 1, (value) => {
    if (value === null) return null
    const integer = asInteger(value)
    return integer === INT64_MIN ? null : integer < 0n ? -integer : integer
  })
  fixed("eidos_formula_num_add", 2, (a, b) =>
    numberBinary(a, b, (x, y) => x + y)
  )
  fixed("eidos_formula_num_sub", 2, (a, b) =>
    numberBinary(a, b, (x, y) => x - y)
  )
  fixed("eidos_formula_num_mul", 2, (a, b) =>
    numberBinary(a, b, (x, y) => x * y)
  )
  fixed("eidos_formula_num_div", 2, (a, b) =>
    numberBinary(a, b, (x, y) => x / y)
  )
  fixed("eidos_formula_num_neg", 1, (value) => {
    if (value === null) return null
    return finiteNumber(-asNumber(value))
  })
  fixed("eidos_formula_num_abs", 1, (value) => {
    if (value === null) return null
    return finiteNumber(Math.abs(asNumber(value)))
  })
  fixed("eidos_formula_floor", 1, (value) => roundedInteger(value, Math.floor))
  fixed("eidos_formula_ceil", 1, (value) => roundedInteger(value, Math.ceil))
  for (const [suffix, predicate] of [
    ["eq", (order: number) => order === 0],
    ["ne", (order: number) => order !== 0],
    ["lt", (order: number) => order < 0],
    ["lte", (order: number) => order <= 0],
    ["gt", (order: number) => order > 0],
    ["gte", (order: number) => order >= 0],
  ] as const) {
    fixed(`eidos_formula_numeric_${suffix}`, 2, (a, b) => {
      if (a === null || b === null) return null
      return predicate(compareNumeric(a, b)) ? 1n : 0n
    })
  }
  for (let arity = 2; arity <= 16; arity += 1) {
    fixed("eidos_formula_numeric_min", arity, (...values) =>
      numericExtreme(values, "min")
    )
    fixed("eidos_formula_numeric_max", arity, (...values) =>
      numericExtreme(values, "max")
    )
  }
  fixed("eidos_formula_substr2", 2, (text, start) =>
    scalarSubstring(text, start)
  )
  fixed("eidos_formula_substr3", 3, (text, start, length) =>
    scalarSubstring(text, start, length)
  )
  fixed("eidos_formula_length", 1, (value) => {
    if (value === null) return null
    if (typeof value !== "string") throw new TypeError("LENGTH expected text")
    return BigInt(Array.from(value).length)
  })
  fixed("eidos_formula_lower_ascii", 1, (value) => asciiCase(value, "lower"))
  fixed("eidos_formula_upper_ascii", 1, (value) => asciiCase(value, "upper"))
  fixed("eidos_formula_date_add_days", 2, dateAddDays)
  fixed("eidos_formula_date_diff_days", 2, dateDiffDays)
  fixed("eidos_formula_datetime_add_milliseconds", 2, datetimeAddMilliseconds)
  fixed("eidos_formula_datetime_diff_milliseconds", 2, datetimeDiffMilliseconds)
}

function asciiCase(
  value: EidosFileSqlPrimitive,
  kind: "lower" | "upper"
): string | null {
  if (value === null) return null
  if (typeof value !== "string") throw new TypeError("ASCII case expected text")
  return value.replace(kind === "lower" ? /[A-Z]/g : /[a-z]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) + (kind === "lower" ? 32 : -32))
  )
}

function asInteger(value: EidosFileSqlPrimitive): bigint {
  if (typeof value === "bigint") return value
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value)
  throw new TypeError("Formula expected an Integer")
}

function asNumber(value: EidosFileSqlPrimitive): number {
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new TypeError("Formula expected a Number")
}

function boundedInteger(value: bigint): bigint | null {
  return value < INT64_MIN || value > INT64_MAX ? null : value
}

function intBinary(
  left: EidosFileSqlPrimitive,
  right: EidosFileSqlPrimitive,
  operation: (left: bigint, right: bigint) => bigint
): bigint | null {
  if (left === null || right === null) return null
  return boundedInteger(operation(asInteger(left), asInteger(right)))
}

function finiteNumber(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Object.is(value, -0) ? 0 : value
}

function numberBinary(
  left: EidosFileSqlPrimitive,
  right: EidosFileSqlPrimitive,
  operation: (left: number, right: number) => number
): number | null {
  if (left === null || right === null) return null
  return finiteNumber(operation(asNumber(left), asNumber(right)))
}

function roundedInteger(
  value: EidosFileSqlPrimitive,
  operation: (value: number) => number
): bigint | null {
  if (value === null) return null
  const rounded = operation(asNumber(value))
  if (!Number.isFinite(rounded) || !Number.isInteger(rounded)) return null
  return boundedInteger(BigInt(rounded))
}

function numericExtreme(
  values: EidosFileSqlPrimitive[],
  kind: "min" | "max"
): EidosFileSqlPrimitive {
  if (values.some((value) => value === null)) return null
  let selected = values[0]!
  for (const value of values.slice(1)) {
    const order = compareNumeric(value!, selected)
    if ((kind === "min" && order < 0) || (kind === "max" && order > 0)) {
      selected = value!
    }
  }
  return values.some((value) => typeof value === "number")
    ? finiteNumber(asNumber(selected))
    : selected
}

function compareNumeric(
  left: EidosFileSqlPrimitive,
  right: EidosFileSqlPrimitive
): number {
  if (typeof left === "bigint" && typeof right === "bigint") {
    return left < right ? -1 : left > right ? 1 : 0
  }
  if (typeof left === "number" && typeof right === "number") {
    return left < right ? -1 : left > right ? 1 : 0
  }
  if (typeof left === "bigint" && typeof right === "number") {
    return compareIntegerAndNumber(left, right)
  }
  if (typeof left === "number" && typeof right === "bigint") {
    return -compareIntegerAndNumber(right, left)
  }
  throw new TypeError("Formula expected numeric operands")
}

function compareIntegerAndNumber(integer: bigint, number: number): number {
  if (!Number.isFinite(number))
    throw new TypeError("Formula Number is non-finite")
  const { numerator, denominator } = binary64Rational(number)
  const scaled = integer * denominator
  return scaled < numerator ? -1 : scaled > numerator ? 1 : 0
}

function binary64Rational(value: number): {
  numerator: bigint
  denominator: bigint
} {
  if (value === 0) return { numerator: 0n, denominator: 1n }
  const bytes = new ArrayBuffer(8)
  const view = new DataView(bytes)
  view.setFloat64(0, value, false)
  const bits = view.getBigUint64(0, false)
  const negative = bits >> 63n === 1n
  const exponentBits = Number((bits >> 52n) & 0x7ffn)
  const fraction = bits & ((1n << 52n) - 1n)
  const significand = exponentBits === 0 ? fraction : (1n << 52n) | fraction
  const exponent = (exponentBits === 0 ? -1022 : exponentBits - 1023) - 52
  const signed = negative ? -significand : significand
  return exponent >= 0
    ? { numerator: signed << BigInt(exponent), denominator: 1n }
    : { numerator: signed, denominator: 1n << BigInt(-exponent) }
}

function scalarSubstring(
  text: EidosFileSqlPrimitive,
  start: EidosFileSqlPrimitive,
  length?: EidosFileSqlPrimitive
): string | null {
  if (text === null || start === null || length === null) return null
  if (typeof text !== "string") throw new TypeError("SUBSTR expected text")
  const scalars = Array.from(text)
  const rawStart = asInteger(start)
  const clampedStart =
    rawStart < 0n
      ? BigInt(scalars.length) + rawStart < 0n
        ? 0n
        : BigInt(scalars.length) + rawStart
      : rawStart
  if (clampedStart > BigInt(Number.MAX_SAFE_INTEGER)) return ""
  if (length === undefined) return scalars.slice(Number(clampedStart)).join("")
  const count = asInteger(length)
  if (count < 0n) return null
  if (count > BigInt(Number.MAX_SAFE_INTEGER)) {
    return scalars.slice(Number(clampedStart)).join("")
  }
  return scalars
    .slice(Number(clampedStart), Number(clampedStart + count))
    .join("")
}

function dateAddDays(
  date: EidosFileSqlPrimitive,
  amount: EidosFileSqlPrimitive
): string | null {
  if (date === null || amount === null) return null
  const parts = parseDate(date)
  const target =
    daysFromCivil(parts.year, parts.month, parts.day) + asInteger(amount)
  const result = civilFromDays(target)
  return result.year < 1n || result.year > 9999n ? null : formatDate(result)
}

function dateDiffDays(
  left: EidosFileSqlPrimitive,
  right: EidosFileSqlPrimitive
): bigint | null {
  if (left === null || right === null) return null
  const a = parseDate(left)
  const b = parseDate(right)
  return boundedInteger(
    daysFromCivil(a.year, a.month, a.day) -
      daysFromCivil(b.year, b.month, b.day)
  )
}

function datetimeAddMilliseconds(
  datetime: EidosFileSqlPrimitive,
  amount: EidosFileSqlPrimitive
): string | null {
  if (datetime === null || amount === null) return null
  return formatInstant(parseInstant(datetime) + asInteger(amount))
}

function datetimeDiffMilliseconds(
  left: EidosFileSqlPrimitive,
  right: EidosFileSqlPrimitive
): bigint | null {
  if (left === null || right === null) return null
  return boundedInteger(parseInstant(left) - parseInstant(right))
}

function parseDate(value: EidosFileSqlPrimitive): {
  year: bigint
  month: bigint
  day: bigint
} {
  if (typeof value !== "string") throw new TypeError("Formula expected a date")
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new TypeError("Formula date is not canonical")
  return {
    year: BigInt(match[1]!),
    month: BigInt(match[2]!),
    day: BigInt(match[3]!),
  }
}

function parseInstant(value: EidosFileSqlPrimitive): bigint {
  if (typeof value !== "string")
    throw new TypeError("Formula expected a datetime")
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value)
  if (!match) throw new TypeError("Formula datetime is not canonical")
  const date = {
    year: BigInt(match[1]!),
    month: BigInt(match[2]!),
    day: BigInt(match[3]!),
  }
  return (
    daysFromCivil(date.year, date.month, date.day) * 86_400_000n +
    BigInt(match[4]!) * 3_600_000n +
    BigInt(match[5]!) * 60_000n +
    BigInt(match[6]!) * 1_000n +
    BigInt(match[7]!)
  )
}

function formatInstant(milliseconds: bigint): string | null {
  let days = milliseconds / 86_400_000n
  let remainder = milliseconds % 86_400_000n
  if (remainder < 0n) {
    days -= 1n
    remainder += 86_400_000n
  }
  const date = civilFromDays(days)
  if (date.year < 1n || date.year > 9999n) return null
  const hour = remainder / 3_600_000n
  remainder %= 3_600_000n
  const minute = remainder / 60_000n
  remainder %= 60_000n
  const second = remainder / 1_000n
  const millisecond = remainder % 1_000n
  return `${formatDate(date)}T${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}.${pad(millisecond, 3)}Z`
}

function daysFromCivil(year: bigint, month: bigint, day: bigint): bigint {
  const adjustedYear = year - (month <= 2n ? 1n : 0n)
  const era = floorDiv(adjustedYear, 400n)
  const yearOfEra = adjustedYear - era * 400n
  const shiftedMonth = month + (month > 2n ? -3n : 9n)
  const dayOfYear = (153n * shiftedMonth + 2n) / 5n + day - 1n
  const dayOfEra =
    yearOfEra * 365n + yearOfEra / 4n - yearOfEra / 100n + dayOfYear
  return era * 146_097n + dayOfEra - 719_468n
}

function civilFromDays(days: bigint): {
  year: bigint
  month: bigint
  day: bigint
} {
  const shifted = days + 719_468n
  const era = floorDiv(shifted, 146_097n)
  const dayOfEra = shifted - era * 146_097n
  const yearOfEra =
    (dayOfEra - dayOfEra / 1_460n + dayOfEra / 36_524n - dayOfEra / 146_096n) /
    365n
  let year = yearOfEra + era * 400n
  const dayOfYear =
    dayOfEra - (365n * yearOfEra + yearOfEra / 4n - yearOfEra / 100n)
  const monthPrime = (5n * dayOfYear + 2n) / 153n
  const day = dayOfYear - (153n * monthPrime + 2n) / 5n + 1n
  const month = monthPrime + (monthPrime < 10n ? 3n : -9n)
  year += month <= 2n ? 1n : 0n
  return { year, month, day }
}

function floorDiv(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor
  return value < 0n && value % divisor !== 0n ? quotient - 1n : quotient
}

function formatDate(value: {
  year: bigint
  month: bigint
  day: bigint
}): string {
  return `${pad(value.year, 4)}-${pad(value.month, 2)}-${pad(value.day, 2)}`
}

function pad(value: bigint, width: number): string {
  return value.toString().padStart(width, "0")
}
