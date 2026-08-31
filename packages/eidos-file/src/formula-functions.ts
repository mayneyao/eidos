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
  const fixedWhenMissing = (
    name: string,
    arity: number,
    operation: (...values: EidosFileSqlPrimitive[]) => EidosFileSqlPrimitive
  ) => {
    try {
      connection.get(`SELECT ${name}(1.5) AS value`)
    } catch {
      fixed(name, arity, operation)
    }
  }
  fixedWhenMissing("floor", 1, (value) =>
    sqliteIntegralBoundary(value, Math.floor)
  )
  fixedWhenMissing("ceil", 1, (value) =>
    sqliteIntegralBoundary(value, Math.ceil)
  )
  fixedWhenMissing("ceiling", 1, (value) =>
    sqliteIntegralBoundary(value, Math.ceil)
  )
  fixedWhenMissing("sign", 1, sqliteSign)
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
}

function sqliteIntegralBoundary(
  value: EidosFileSqlPrimitive,
  operation: (value: number) => number
): bigint | number | null {
  if (value === null) return null
  if (typeof value === "bigint") return value
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError("SQLite math function expected numeric input")
  return operation(value)
}

function sqliteSign(value: EidosFileSqlPrimitive): bigint | null {
  if (value === null) return null
  if (typeof value === "bigint") return value < 0n ? -1n : value > 0n ? 1n : 0n
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError("SQLite SIGN expected numeric input")
  return value < 0 ? -1n : value > 0 ? 1n : 0n
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
