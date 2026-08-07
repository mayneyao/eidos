import { canonicalizeEidosFileJson } from "./canonical-json"
import type { EidosFileConnection, EidosFileSqlPrimitive } from "./connection"

const INT64_MIN = -9_223_372_036_854_775_808n
const INT64_MAX = 9_223_372_036_854_775_807n

type LookupAtom =
  | null
  | bigint
  | number
  | boolean
  | string
  | Record<string, unknown>

export function registerEidosLookupFunctions(
  connection: EidosFileConnection
): void {
  connection.registerFunction(
    "eidos_lookup_aggregate",
    (payload, aggregate, distinct, elementType) =>
      lookupAggregate(payload, aggregate, distinct, elementType),
    4
  )
}

function lookupAggregate(
  payloadValue: EidosFileSqlPrimitive,
  aggregateValue: EidosFileSqlPrimitive,
  distinctValue: EidosFileSqlPrimitive,
  elementTypeValue: EidosFileSqlPrimitive
): EidosFileSqlPrimitive {
  if (
    typeof payloadValue !== "string" ||
    typeof aggregateValue !== "string" ||
    typeof elementTypeValue !== "string"
  )
    return null
  try {
    const parsed = JSON.parse(payloadValue) as Array<{ v: unknown }>
    if (!Array.isArray(parsed)) return null
    let values = parsed.map((entry) =>
      decodeLookupAtom(entry?.v, elementTypeValue)
    )
    if (distinctValue === 1 || distinctValue === 1n) {
      const seen = new Set<string>()
      values = values.filter((value) => {
        const key = lookupAtomKey(value, elementTypeValue)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
    if (aggregateValue === "values") {
      return canonicalizeEidosFileJson(
        values.map((value) => publicLookupAtom(value, elementTypeValue))
      )
    }
    if (aggregateValue === "first")
      return values.length === 0
        ? null
        : sqlLookupAtom(values[0]!, elementTypeValue)
    const nonNull = values.filter(
      (value): value is Exclude<LookupAtom, null> => value !== null
    )
    if (aggregateValue === "count") return BigInt(nonNull.length)
    if (aggregateValue === "sum") {
      if (nonNull.length === 0) return null
      if (elementTypeValue === "integer") {
        const result = nonNull.reduce<bigint>(
          (sum, value) => sum + (value as bigint),
          0n
        )
        return boundedInteger(result)
      }
      return finiteNumber(pairwiseBinary64(nonNull as number[]))
    }
    if (aggregateValue === "average") {
      if (nonNull.length === 0) return null
      const result =
        elementTypeValue === "integer"
          ? rationalToBinary64(
              nonNull.reduce<bigint>(
                (sum, value) => sum + (value as bigint),
                0n
              ),
              BigInt(nonNull.length)
            )
          : pairwiseBinary64(nonNull as number[]) / nonNull.length
      return finiteNumber(result)
    }
    if (aggregateValue === "min" || aggregateValue === "max") {
      if (nonNull.length === 0) return null
      let selected = nonNull[0]!
      for (const candidate of nonNull.slice(1)) {
        const order = compareLookupAtoms(candidate, selected, elementTypeValue)
        if (
          (aggregateValue === "min" && order < 0) ||
          (aggregateValue === "max" && order > 0)
        )
          selected = candidate
      }
      return sqlLookupAtom(selected, elementTypeValue)
    }
    return null
  } catch {
    return null
  }
}

function decodeLookupAtom(value: unknown, type: string): LookupAtom {
  if (value === null) return null
  if (type === "integer") return BigInt(String(value))
  if (type === "number") {
    const number = Number(value)
    if (!Number.isFinite(number)) throw new TypeError("Invalid Number")
    return Object.is(number, -0) ? 0 : number
  }
  if (type === "checkbox") return value === true || value === 1
  if (type === "file-entry") {
    const object =
      typeof value === "string" ? (JSON.parse(value) as unknown) : value
    if (!object || typeof object !== "object" || Array.isArray(object))
      throw new TypeError("Invalid File entry")
    return JSON.parse(canonicalizeEidosFileJson(object)) as Record<
      string,
      unknown
    >
  }
  if (typeof value !== "string") throw new TypeError("Invalid text atom")
  return value
}

function publicLookupAtom(value: LookupAtom, type: string): unknown {
  if (value === null) return null
  if (type === "integer") return String(value)
  return value
}

function sqlLookupAtom(value: LookupAtom, type: string): EidosFileSqlPrimitive {
  if (value === null) return null
  if (type === "checkbox") return value === true ? 1n : 0n
  if (type === "file-entry") return canonicalizeEidosFileJson(value)
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  )
    return value
  return null
}

function lookupAtomKey(value: LookupAtom, type: string): string {
  if (value === null) return "null"
  if (type === "number") return `number:${numberKey(value as number)}`
  if (type === "integer") return `integer:${String(value)}`
  if (type === "checkbox") return `checkbox:${value === true ? 1 : 0}`
  if (type === "file-entry")
    return `file-entry:${canonicalizeEidosFileJson(value)}`
  return `${type}:${String(value)}`
}

function numberKey(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  view.setFloat64(0, normalized, false)
  return view.getBigUint64(0, false).toString(16).padStart(16, "0")
}

function compareLookupAtoms(
  left: Exclude<LookupAtom, null>,
  right: Exclude<LookupAtom, null>,
  type: string
): number {
  if (type === "integer" || type === "number")
    return left < right ? -1 : left > right ? 1 : 0
  if (type === "checkbox") return left === right ? 0 : left ? 1 : -1
  return compareUtf8(String(left), String(right))
}

function compareUtf8(left: string, right: string): number {
  const encoder = new TextEncoder()
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0
}

function boundedInteger(value: bigint): bigint | null {
  return value < INT64_MIN || value > INT64_MAX ? null : value
}

function finiteNumber(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Object.is(value, -0) ? 0 : value
}

function pairwiseBinary64(values: number[]): number {
  let level = values.slice()
  while (level.length > 1) {
    const next: number[] = []
    for (let index = 0; index < level.length; index += 2) {
      next.push(
        index + 1 < level.length
          ? level[index]! + level[index + 1]!
          : level[index]!
      )
    }
    level = next
  }
  return level[0] ?? 0
}

function rationalToBinary64(numerator: bigint, denominator: bigint): number {
  if (numerator === 0n) return 0
  const negative = numerator < 0n
  const absolute = negative ? -numerator : numerator
  let exponent = bitLength(absolute) - bitLength(denominator)
  if (exponent >= 0) {
    if (absolute < denominator << BigInt(exponent)) exponent -= 1
  } else if (absolute << BigInt(-exponent) < denominator) exponent -= 1
  let result: number
  if (exponent >= -1022) {
    const shift = 52 - exponent
    const scaledNumerator = shift >= 0 ? absolute << BigInt(shift) : absolute
    const scaledDenominator =
      shift >= 0 ? denominator : denominator << BigInt(-shift)
    let significand = divideRoundTiesEven(scaledNumerator, scaledDenominator)
    if (significand === 9_007_199_254_740_992n) {
      significand >>= 1n
      exponent += 1
    }
    result = Number(significand) * 2 ** (exponent - 52)
  } else {
    result =
      Number(divideRoundTiesEven(absolute << 1074n, denominator)) * 2 ** -1074
  }
  return negative ? -result : result
}

function bitLength(value: bigint): number {
  return value.toString(2).length
}

function divideRoundTiesEven(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const doubled = remainder * 2n
  return doubled > denominator ||
    (doubled === denominator && quotient % 2n !== 0n)
    ? quotient + 1n
    : quotient
}
