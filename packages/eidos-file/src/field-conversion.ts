import type { EidosFileSqlPrimitive } from "./connection"
import {
  decodeEidosFileAttachmentPaths,
  encodeEidosFileAttachmentPaths,
} from "./file-values"
import {
  decodeEidosFileJsonArray,
  decodeEidosFileStringArray,
  encodeEidosFileJsonArray,
} from "./json-array-values"
import { parseEidosFileSelectOptions } from "./select-options"
import type {
  EidosFileFieldInfo,
  EidosFileFieldType,
  EidosFileSelectOption,
  EidosFileStorageCodec,
} from "./types"

export const MUTABLE_BASE_FIELD_TYPES = [
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "file",
  "multi-select",
  "rating",
  "select",
  "url",
] as const satisfies readonly EidosFileFieldType[]

export type MutableEidosFileFieldType =
  (typeof MUTABLE_BASE_FIELD_TYPES)[number]

const MUTABLE_TYPE_SET = new Set<EidosFileFieldType>(MUTABLE_BASE_FIELD_TYPES)
const OPTION_COLORS = [
  "gray",
  "brown",
  "pink",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
]

export interface EidosFileFieldValueRow {
  id: string
  value: EidosFileSqlPrimitive
}

export interface EidosFileFieldConversionPlan {
  property: Record<string, unknown> | null
  storageCodec: EidosFileStorageCodec
  values: Array<{ id: string; value: EidosFileSqlPrimitive }>
}

export function isMutableEidosFileFieldType(
  type: EidosFileFieldType
): type is MutableEidosFileFieldType {
  return MUTABLE_TYPE_SET.has(type)
}

export function decodeEidosFileMultiSelectValues(
  value: EidosFileSqlPrimitive
): string[] {
  return Array.from(new Set(decodeEidosFileStringArray(value).filter(Boolean)))
}

export function encodeEidosFileMultiSelectValues(
  values: readonly string[]
): string | null {
  return encodeEidosFileJsonArray(Array.from(new Set(values.filter(Boolean))))
}

export function eidosFileFieldDisplayValues(
  field: EidosFileFieldInfo,
  value: EidosFileSqlPrimitive | boolean
): string[] {
  if (value === null) return []
  const primitiveValue: EidosFileSqlPrimitive =
    typeof value === "boolean" ? (value ? 1 : 0) : value
  if (field.type === "file")
    return decodeEidosFileAttachmentPaths(primitiveValue)
  if (field.type === "select") {
    return [String(primitiveValue)].filter(Boolean)
  }
  if (field.type === "multi-select") {
    return decodeEidosFileMultiSelectValues(primitiveValue)
  }
  if (field.storageCodec === "json_array") {
    return decodeEidosFileJsonArray(primitiveValue).flatMap((entry) =>
      entry === null ? [] : [String(entry)]
    )
  }
  if (field.type === "checkbox") {
    return [value === true || value === 1 || value === "1" ? "true" : "false"]
  }
  if (primitiveValue instanceof Uint8Array) return []
  const text = String(primitiveValue).trim()
  return text ? [text] : []
}

function optionPlan(
  field: EidosFileFieldInfo,
  rows: EidosFileFieldValueRow[]
): EidosFileSelectOption[] {
  const existingByName = new Map(
    parseEidosFileSelectOptions(field.property).map((option) => [
      option.value,
      option,
    ])
  )
  const names = Array.from(
    new Set(
      rows.flatMap((row) => eidosFileFieldDisplayValues(field, row.value))
    )
  )
  return names.map(
    (name, index) =>
      existingByName.get(name) ?? {
        value: name,
        color: OPTION_COLORS[index % OPTION_COLORS.length],
      }
  )
}

function defaultProperty(
  type: MutableEidosFileFieldType,
  options: EidosFileSelectOption[]
): Record<string, unknown> | null {
  if (type === "select" || type === "multi-select") return { options }
  if (type === "number") {
    return {
      format: "number",
      showAs: "number",
      color: "purple",
      divideBy: 100,
      showNumber: true,
    }
  }
  return null
}

function storageCodec(type: MutableEidosFileFieldType): EidosFileStorageCodec {
  if (type === "multi-select" || type === "file") return "json_array"
  return "scalar"
}

function numericValue(values: string[]): number | null {
  if (values.length === 0) return null
  const parsed = Number(values[0])
  return Number.isFinite(parsed) ? parsed : null
}

function checkboxValue(
  sourceValue: EidosFileSqlPrimitive,
  values: string[]
): number | null {
  if (sourceValue === null) return null
  if (typeof sourceValue === "number" || typeof sourceValue === "bigint") {
    return sourceValue === 0 || sourceValue === 0n ? 0 : 1
  }
  const normalized = values[0]?.trim().toLowerCase()
  if (!normalized) return 0
  if (["0", "false", "no", "off", "unchecked"].includes(normalized)) return 0
  return 1
}

function convertedValue(
  type: MutableEidosFileFieldType,
  sourceValue: EidosFileSqlPrimitive,
  values: string[]
): EidosFileSqlPrimitive {
  if (sourceValue === null) return null
  if (type === "number") return numericValue(values)
  if (type === "checkbox") return checkboxValue(sourceValue, values)
  if (type === "rating") {
    const value = numericValue(values)
    return value === null ? null : Math.min(5, Math.max(0, Math.round(value)))
  }
  if (type === "file") return encodeEidosFileAttachmentPaths(values)
  if (type === "select") {
    return values[0] || null
  }
  if (type === "multi-select") {
    return encodeEidosFileMultiSelectValues(values)
  }
  return values.length > 0 ? values.join(", ") : null
}

export function planEidosFileFieldConversion(
  field: EidosFileFieldInfo,
  rows: EidosFileFieldValueRow[],
  targetType: MutableEidosFileFieldType
): EidosFileFieldConversionPlan {
  const options =
    targetType === "select" || targetType === "multi-select"
      ? optionPlan(field, rows)
      : []
  return {
    property: defaultProperty(targetType, options),
    storageCodec: storageCodec(targetType),
    values: rows.map((row) => {
      const values = eidosFileFieldDisplayValues(field, row.value)
      return {
        id: row.id,
        value: convertedValue(targetType, row.value, values),
      }
    }),
  }
}
