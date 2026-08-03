import {
  canonicalizeEidosFileJson,
  isCanonicalEidosFileJson,
  parseEidosFileJson,
} from "./canonical-json"
import type { EidosFileSqlPrimitive } from "./connection"
import { decodeEidosFileValues } from "./file-values"
import { isEidosFileUuid } from "./identifiers"
import type {
  ConversionPolicy,
  ScalarStoredFieldType,
  SchemaValueChangeCode,
  StoredFieldType,
} from "./runtime-contract"
import {
  isCanonicalEidosFileDate,
  isCanonicalEidosFileInstant,
} from "./temporal"

export type CanonicalConversionClassification =
  | "metadata-only"
  | "lossless-rewrite"
  | "explicit-lossy"
  | "forbidden"

export interface CanonicalConversionRow {
  id: string
  value: EidosFileSqlPrimitive
}

export interface CanonicalConvertedRow extends CanonicalConversionRow {
  changed: boolean
}

export interface CanonicalConversionPlan {
  classification: CanonicalConversionClassification
  rows: CanonicalConvertedRow[]
  affectedRows: string
  valueChanges: Array<{ code: SchemaValueChangeCode; rows: string }>
  error?: string
}

export interface CanonicalConversionInput {
  from: StoredFieldType
  to: StoredFieldType
  toNullable: boolean
  policies?: readonly ConversionPolicy[]
  rows: readonly CanonicalConversionRow[]
  relationIdValid?: (id: string) => boolean
  relationCardinality?: "one" | "many"
}

type Converted = {
  value: EidosFileSqlPrimitive
  class: 0 | 1 | 2
  code?: SchemaValueChangeCode
}

/**
 * Product defaults for conversions requested by the Eidos File editor.
 *
 * These policies are intentionally explicit: the Runtime still reports an
 * `explicit-lossy` preflight and requires confirmation whenever the values in
 * the current Field would actually lose information.
 */
export function recommendedEidosFileConversionPolicies(
  from: StoredFieldType,
  to: StoredFieldType
): ConversionPolicy[] {
  const policies: ConversionPolicy[] = []
  if (from === "json" && to !== "json" && to !== "text") {
    policies.push("json-null-to-sql-null")
  }
  if (from === "integer" && (to === "number" || to === "json")) {
    policies.push("round-binary64")
  }
  if (from === "number" && to === "integer") {
    policies.push("round-ties-even")
  }
  if ((from === "integer" || from === "number") && to === "checkbox") {
    policies.push("zero-false-nonzero-true")
  }
  if (from === "datetime" && to === "date") policies.push("utc-date")
  if (from === "multi-select" && to === "select") policies.push("first")
  if (!LIST_TYPES.has(from) && LIST_TYPES.has(to)) {
    policies.push("null-to-empty-list")
  }
  return policies
}

/** Returns the nullable shape used by editor-initiated conversions. */
export function eidosFileConversionTargetNullable(
  from: StoredFieldType,
  to: StoredFieldType,
  sourceNullable: boolean
): boolean {
  return (
    sourceNullable ||
    (from === "multi-select" && to === "select") ||
    (from === "json" && to !== "json" && to !== "text")
  )
}

const INT64_MIN = -9_223_372_036_854_775_808n
const INT64_MAX = 9_223_372_036_854_775_807n
const INT64 = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/u
const LIST_TYPES = new Set<StoredFieldType>([
  "multi-select",
  "file",
  "relation",
])
const TEXT_TYPES = new Set<StoredFieldType>([
  "text",
  "date",
  "datetime",
  "url",
  "select",
])
const SHARED_TEXT_COLUMN_TYPES = new Set<StoredFieldType>([
  "text",
  "select",
  "url",
])

/** True when a conversion can retain the exact nullable SQLite column DDL. */
export function eidosFileConversionCanReusePhysicalColumn(
  from: StoredFieldType,
  to: StoredFieldType,
  sourceNullable: boolean,
  targetNullable: boolean
): boolean {
  return (
    sourceNullable === targetNullable &&
    SHARED_TEXT_COLUMN_TYPES.has(from) &&
    SHARED_TEXT_COLUMN_TYPES.has(to)
  )
}

export function planCanonicalFieldConversion(
  input: CanonicalConversionInput
): CanonicalConversionPlan {
  const policies = new Set(input.policies ?? [])
  const sourceHasSqlNull = input.rows.some((row) => row.value === null)
  const sourceHasJsonNull = input.rows.some(
    (row) => input.from === "json" && row.value === "null"
  )
  const sourceHasEmptyList = input.rows.some((row) => {
    if (row.value === null || typeof row.value !== "string") return false
    return row.value === "[]"
  })
  const changes = new Map<SchemaValueChangeCode, number>()
  const rows: CanonicalConvertedRow[] = []
  let severity: 0 | 1 | 2 | 3 = 0
  let error: string | undefined

  for (const row of input.rows) {
    try {
      let converted: Converted
      if (row.value === null) {
        converted = convertNull(
          input,
          policies,
          sourceHasJsonNull,
          sourceHasEmptyList
        )
      } else {
        converted = convertNonNull(input, row.value, policies, {
          sourceHasSqlNull,
          sourceHasJsonNull,
        })
      }
      if (
        converted.value === null &&
        !input.toNullable &&
        !LIST_TYPES.has(input.to)
      ) {
        throw new Error("Destination non-nullability rejects SQL NULL")
      }
      validateDestination(input, converted.value)
      const changed =
        storageClass(input.from) !== storageClass(input.to) ||
        !sameStorageValue(row.value, converted.value)
      rows.push({ id: row.id, value: converted.value, changed })
      if (changed) {
        severity = Math.max(severity, converted.class) as 0 | 1 | 2 | 3
        changes.set(
          "value-reencoded",
          (changes.get("value-reencoded") ?? 0) + 1
        )
        if (converted.code) {
          changes.set(converted.code, (changes.get(converted.code) ?? 0) + 1)
        }
      }
    } catch (cause) {
      severity = 3
      error = cause instanceof Error ? cause.message : "Conversion is forbidden"
      break
    }
  }

  if (severity === 3) {
    return {
      classification: "forbidden",
      rows: [],
      affectedRows: "0",
      valueChanges: [],
      error,
    }
  }
  const affectedRows = rows.filter((row) => row.changed).length
  return {
    classification:
      severity === 2
        ? "explicit-lossy"
        : severity === 1
          ? "lossless-rewrite"
          : "metadata-only",
    rows,
    affectedRows: String(affectedRows),
    valueChanges: Array.from(changes, ([code, count]) => ({
      code,
      rows: String(count),
    })),
  }
}

function convertNull(
  input: CanonicalConversionInput,
  policies: ReadonlySet<ConversionPolicy>,
  sourceHasJsonNull: boolean,
  sourceHasEmptyList: boolean
): Converted {
  if (LIST_TYPES.has(input.to)) {
    if (!policies.has("null-to-empty-list")) {
      throw new Error(
        "SQL NULL requires null-to-empty-list for a list destination"
      )
    }
    return {
      value: "[]",
      class: sourceHasEmptyList ? 2 : 1,
      code: "null-to-empty-list",
    }
  }
  if (!input.toNullable) {
    throw new Error("Destination non-nullability rejects SQL NULL")
  }
  // SQL NULL is preserved. A JSON-literal-null policy affects only the JSON
  // literal and is classified there using the complete source domain.
  return {
    value: null,
    class: sourceHasJsonNull && policies.has("json-null-to-sql-null") ? 2 : 0,
  }
}

function convertNonNull(
  input: CanonicalConversionInput,
  value: Exclude<EidosFileSqlPrimitive, null>,
  policies: ReadonlySet<ConversionPolicy>,
  domain: { sourceHasSqlNull: boolean; sourceHasJsonNull: boolean }
): Converted {
  const { from, to } = input
  if (from === to) return { value, class: 0 }

  if (TEXT_TYPES.has(from) && TEXT_TYPES.has(to)) {
    if (to === "datetime" && from === "date") {
      return { value: `${asText(value)}T00:00:00.000Z`, class: 1 }
    }
    if (to === "date" && from === "datetime") {
      const text = asText(value)
      if (text.endsWith("T00:00:00.000Z")) {
        return { value: text.slice(0, 10), class: 1 }
      }
      if (!policies.has("utc-date")) {
        throw new Error("Datetime with a time component requires utc-date")
      }
      return { value: text.slice(0, 10), class: 2, code: "datetime-to-date" }
    }
    return { value: asText(value), class: 0 }
  }

  if (to === "text") {
    if (from === "number")
      return { value: canonicalNumber(asNumber(value)), class: 1 }
    if (from === "integer") return { value: String(asInteger(value)), class: 1 }
    if (from === "checkbox")
      return { value: asCheckbox(value) ? "true" : "false", class: 1 }
    if (from === "json" || LIST_TYPES.has(from))
      return { value: asText(value), class: 0 }
  }

  if (to === "select") {
    if (from === "number")
      return { value: canonicalNumber(asNumber(value)), class: 1 }
    if (from === "integer") return { value: String(asInteger(value)), class: 1 }
    if (from === "checkbox")
      return { value: asCheckbox(value) ? "true" : "false", class: 1 }
    if (from === "multi-select") {
      const list = parseStringList(value)
      if (list.length === 1) return { value: list[0]!, class: 1 }
      if (!policies.has("first")) {
        throw new Error("Multi-select to Select requires a singleton or first")
      }
      if (list.length === 0) {
        if (!input.toNullable)
          throw new Error("Empty list requires nullable Select")
        return { value: null, class: 1, code: "list-empty-to-null" }
      }
      return { value: list[0]!, class: 2, code: "list-tail-dropped" }
    }
    if (from === "json")
      return unwrapJsonScalar(value, "select", policies, domain)
  }

  if (to === "number") {
    if (from === "integer") {
      const integer = asInteger(value)
      const number = Number(integer)
      if (Number.isInteger(number) && BigInt(number) === integer) {
        return { value: number, class: 1 }
      }
      if (!policies.has("round-binary64") || !Number.isFinite(number)) {
        throw new Error("Integer is not exactly representable as binary64")
      }
      return { value: number, class: 2, code: "binary64-rounded" }
    }
    if (from === "checkbox")
      return { value: asCheckbox(value) ? 1 : 0, class: 1 }
    if (from === "text" || from === "select") {
      const text = asText(value)
      const number = Number(text)
      if (!Number.isFinite(number) || canonicalNumber(number) !== text) {
        throw new Error("Text is not the exact inverse binary64 spelling")
      }
      return { value: number, class: 1 }
    }
    if (from === "json")
      return unwrapJsonScalar(value, "number", policies, domain)
  }

  if (to === "integer") {
    if (from === "checkbox")
      return { value: asCheckbox(value) ? 1n : 0n, class: 0 }
    if (from === "text" || from === "select") {
      return { value: parseInt64(asText(value)), class: 1 }
    }
    if (from === "number") return numberToInteger(asNumber(value), policies)
    if (from === "json")
      return unwrapJsonScalar(value, "integer", policies, domain)
  }

  if (to === "checkbox") {
    if (from === "text" || from === "select") {
      const text = asText(value)
      if (text === "true") return { value: 1n, class: 1 }
      if (text === "false") return { value: 0n, class: 1 }
      throw new Error("Text is not lowercase true or false")
    }
    if (from === "integer") {
      const integer = asInteger(value)
      if (integer === 0n || integer === 1n) return { value: integer, class: 0 }
      if (!policies.has("zero-false-nonzero-true")) {
        throw new Error("Integer Checkbox conversion requires exact 0/1")
      }
      return {
        value: integer === 0n ? 0n : 1n,
        class: 2,
        code: "numeric-to-checkbox",
      }
    }
    if (from === "number") {
      const number = asNumber(value)
      if (number === 0 || number === 1)
        return { value: BigInt(number), class: 1 }
      if (!policies.has("zero-false-nonzero-true")) {
        throw new Error("Number Checkbox conversion requires exact 0.0/1.0")
      }
      return {
        value: number === 0 ? 0n : 1n,
        class: 2,
        code: "numeric-to-checkbox",
      }
    }
    if (from === "json")
      return unwrapJsonScalar(value, "checkbox", policies, domain)
  }

  if (to === "date" || to === "datetime" || to === "url") {
    if (from === "json") return unwrapJsonScalar(value, to, policies, domain)
  }

  if (to === "json") {
    if (from === "json" || LIST_TYPES.has(from))
      return { value: asText(value), class: 0 }
    if (TEXT_TYPES.has(from)) {
      return { value: canonicalizeEidosFileJson(asText(value)), class: 1 }
    }
    if (from === "number") {
      return { value: canonicalizeEidosFileJson(asNumber(value)), class: 1 }
    }
    if (from === "integer") {
      const integer = asInteger(value)
      const number = Number(integer)
      if (Number.isInteger(number) && BigInt(number) === integer) {
        return { value: canonicalizeEidosFileJson(number), class: 1 }
      }
      if (!policies.has("round-binary64") || !Number.isFinite(number)) {
        throw new Error("Integer JSON conversion requires round-binary64")
      }
      return {
        value: canonicalizeEidosFileJson(number),
        class: 2,
        code: "binary64-rounded",
      }
    }
    if (from === "checkbox") {
      return { value: asCheckbox(value) ? "true" : "false", class: 1 }
    }
  }

  if (LIST_TYPES.has(to)) {
    if (from === "select" && to === "multi-select") {
      return { value: canonicalizeEidosFileJson([asText(value)]), class: 1 }
    }
    if (from === "text" && to === "multi-select") {
      return { value: canonicalizeEidosFileJson([asText(value)]), class: 1 }
    }
    if (
      from === "json" ||
      (from === "multi-select" && to === "relation") ||
      (from === "relation" && to === "multi-select") ||
      from === to
    ) {
      return { value: asText(value), class: 0 }
    }
  }

  throw new Error(`Conversion from ${from} to ${to} is forbidden`)
}

function unwrapJsonScalar(
  value: Exclude<EidosFileSqlPrimitive, null>,
  to: ScalarStoredFieldType,
  policies: ReadonlySet<ConversionPolicy>,
  domain: { sourceHasSqlNull: boolean; sourceHasJsonNull: boolean }
): Converted {
  const parsed = parseEidosFileJson(asText(value))
  if (parsed === null) {
    if (!policies.has("json-null-to-sql-null")) {
      throw new Error("JSON literal null requires json-null-to-sql-null")
    }
    return {
      value: null,
      class: domain.sourceHasSqlNull && domain.sourceHasJsonNull ? 2 : 1,
      code: "json-null-to-sql-null",
    }
  }
  if (to === "number" && typeof parsed === "number") {
    return { value: parsed, class: 1 }
  }
  if (to === "integer" && typeof parsed === "number") {
    return numberToInteger(parsed, policies)
  }
  if (to === "checkbox" && typeof parsed === "boolean") {
    return { value: parsed ? 1n : 0n, class: 1 }
  }
  if (
    ["text", "date", "datetime", "url", "select"].includes(to) &&
    typeof parsed === "string"
  ) {
    return { value: parsed, class: 1 }
  }
  throw new Error(`JSON root is incompatible with ${to}`)
}

function numberToInteger(
  number: number,
  policies: ReadonlySet<ConversionPolicy>
): Converted {
  let result = number
  let code: SchemaValueChangeCode | undefined
  let classification: 1 | 2 = 1
  if (!Number.isInteger(result)) {
    if (policies.has("truncate-toward-zero")) {
      result = Math.trunc(result)
      code = "fraction-truncated"
    } else if (policies.has("round-ties-even")) {
      result = roundTiesEven(result)
      code = "integer-rounded"
    } else {
      throw new Error("Fractional Number requires an Integer rounding policy")
    }
    classification = 2
  }
  if (!Number.isInteger(result)) {
    throw new Error("Integer result is not integral")
  }
  const integer = BigInt(result)
  if (integer < INT64_MIN || integer > INT64_MAX) {
    throw new Error("Integer result is outside signed int64")
  }
  return { value: integer, class: classification, ...(code ? { code } : {}) }
}

function validateDestination(
  input: CanonicalConversionInput,
  value: EidosFileSqlPrimitive
): void {
  if (value === null) return
  switch (input.to) {
    case "number":
      asNumber(value)
      return
    case "integer":
      asInteger(value)
      return
    case "checkbox":
      asCheckbox(value)
      return
    case "date":
      if (!isCanonicalEidosFileDate(value))
        throw new Error("Invalid Date value")
      return
    case "datetime":
      if (!isCanonicalEidosFileInstant(value))
        throw new Error("Invalid Datetime value")
      return
    case "url":
      if (!isUriReference(asText(value)))
        throw new Error("Invalid URI-reference")
      return
    case "json":
      if (!isCanonicalEidosFileJson(asText(value)))
        throw new Error("Invalid canonical JSON")
      return
    case "multi-select":
      parseStringList(value)
      return
    case "file": {
      decodeEidosFileValues(asText(value))
      return
    }
    case "relation": {
      const ids = parseStringList(value)
      if (!ids.every(isEidosFileUuid))
        throw new Error("Invalid Relation Row ID")
      if (input.relationCardinality === "one" && ids.length > 1) {
        throw new Error(
          "One-cardinality Relation contains more than one Row ID"
        )
      }
      if (input.relationIdValid && !ids.every(input.relationIdValid)) {
        throw new Error("Relation Row ID does not resolve in the target Table")
      }
      return
    }
    case "text":
    case "select":
      asText(value)
      return
  }
}

function parseStringList(
  value: Exclude<EidosFileSqlPrimitive, null>
): string[] {
  const text = asText(value)
  if (!isCanonicalEidosFileJson(text))
    throw new Error("List is not canonical JSON")
  const parsed = parseEidosFileJson(text)
  if (
    !Array.isArray(parsed) ||
    !parsed.every((entry) => typeof entry === "string")
  ) {
    throw new Error("List must contain only strings")
  }
  if (new Set(parsed).size !== parsed.length) {
    throw new Error("List values must be unique")
  }
  return parsed
}

function asText(value: Exclude<EidosFileSqlPrimitive, null>): string {
  if (typeof value !== "string") throw new Error("Expected TEXT storage")
  return value
}

function asNumber(value: Exclude<EidosFileSqlPrimitive, null>): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expected finite REAL storage")
  }
  return Object.is(value, -0) ? 0 : value
}

function asInteger(value: Exclude<EidosFileSqlPrimitive, null>): bigint {
  if (typeof value === "bigint") {
    if (value < INT64_MIN || value > INT64_MAX)
      throw new Error("INTEGER outside int64")
    return value
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("Expected exact INTEGER storage")
  }
  return BigInt(value)
}

function asCheckbox(value: Exclude<EidosFileSqlPrimitive, null>): boolean {
  const integer = asInteger(value)
  if (integer !== 0n && integer !== 1n)
    throw new Error("Checkbox must be 0 or 1")
  return integer === 1n
}

function parseInt64(value: string): bigint {
  if (!INT64.test(value) || value === "-0")
    throw new Error("Invalid int64 spelling")
  const integer = BigInt(value)
  if (integer < INT64_MIN || integer > INT64_MAX)
    throw new Error("INTEGER outside int64")
  return integer
}

function canonicalNumber(value: number): string {
  return canonicalizeEidosFileJson(value)
}

function roundTiesEven(value: number): number {
  const floor = Math.floor(value)
  const fraction = value - floor
  if (fraction < 0.5) return floor
  if (fraction > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

function isUriReference(value: string): boolean {
  return (
    !/[\u0000-\u0020<>"{}|\\^`]/u.test(value) &&
    !/%(?![0-9A-Fa-f]{2})/u.test(value)
  )
}

function sameStorageValue(
  left: EidosFileSqlPrimitive,
  right: EidosFileSqlPrimitive
): boolean {
  if (left instanceof Uint8Array || right instanceof Uint8Array) {
    return (
      left instanceof Uint8Array &&
      right instanceof Uint8Array &&
      left.byteLength === right.byteLength &&
      left.every((byte, index) => byte === right[index])
    )
  }
  if (
    (typeof left === "bigint" ||
      (typeof left === "number" && Number.isSafeInteger(left))) &&
    (typeof right === "bigint" ||
      (typeof right === "number" && Number.isSafeInteger(right)))
  ) {
    return BigInt(left) === BigInt(right)
  }
  return typeof left === typeof right && Object.is(left, right)
}

function storageClass(type: StoredFieldType): "integer" | "real" | "text" {
  if (type === "integer" || type === "checkbox") return "integer"
  if (type === "number") return "real"
  return "text"
}
