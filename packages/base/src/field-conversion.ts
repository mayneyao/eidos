import type { BaseSqlPrimitive } from "./connection"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "./file-values"
import { createBaseId } from "./identifiers"
import type { BaseFieldInfo, BaseFieldType, BaseStorageCodec } from "./types"

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
] as const satisfies readonly BaseFieldType[]

export type MutableBaseFieldType = (typeof MUTABLE_BASE_FIELD_TYPES)[number]

const MUTABLE_TYPE_SET = new Set<BaseFieldType>(MUTABLE_BASE_FIELD_TYPES)
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

interface BaseSelectOption {
  id: string
  name: string
  color: string
}

export interface BaseFieldValueRow {
  id: string
  value: BaseSqlPrimitive
}

export interface BaseFieldConversionPlan {
  property: Record<string, unknown> | null
  storageCodec: BaseStorageCodec
  values: Array<{ id: string; value: BaseSqlPrimitive }>
}

export function isMutableBaseFieldType(
  type: BaseFieldType
): type is MutableBaseFieldType {
  return MUTABLE_TYPE_SET.has(type)
}

function selectOptions(field: BaseFieldInfo): BaseSelectOption[] {
  const options = field.property?.options
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (
      typeof option !== "object" ||
      option === null ||
      !("id" in option) ||
      !("name" in option) ||
      typeof option.id !== "string" ||
      typeof option.name !== "string"
    ) {
      return []
    }
    return [
      {
        id: option.id,
        name: option.name,
        color:
          "color" in option && typeof option.color === "string"
            ? option.color
            : "default",
      },
    ]
  })
}

export function decodeBaseMultiSelectIds(value: BaseSqlPrimitive): string[] {
  if (typeof value !== "string" || value.length === 0) return []
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (candidate): candidate is string => typeof candidate === "string"
        )
      }
    } catch {
      // Fall through to the v1 csv_ids representation.
    }
  }
  return value.split(",").filter(Boolean)
}

export function encodeBaseMultiSelectIds(ids: string[]): string | null {
  return ids.length > 0 ? ids.join(",") : null
}

export function baseFieldDisplayValues(
  field: BaseFieldInfo,
  value: BaseSqlPrimitive | boolean
): string[] {
  if (value === null) return []
  const primitiveValue: BaseSqlPrimitive =
    typeof value === "boolean" ? (value ? 1 : 0) : value
  if (field.type === "file") return decodeBaseFilePaths(primitiveValue)
  const options = selectOptions(field)
  const nameById = new Map(options.map((option) => [option.id, option.name]))
  if (field.type === "select") {
    const id = String(primitiveValue)
    return [nameById.get(id) ?? id].filter(Boolean)
  }
  if (field.type === "multi-select") {
    return decodeBaseMultiSelectIds(primitiveValue)
      .map((id) => nameById.get(id) ?? id)
      .filter(Boolean)
  }
  if (field.type === "checkbox") {
    return [value === true || value === 1 || value === "1" ? "true" : "false"]
  }
  if (primitiveValue instanceof Uint8Array) return []
  const text = String(primitiveValue).trim()
  return text ? [text] : []
}

function optionPlan(
  field: BaseFieldInfo,
  rows: BaseFieldValueRow[]
): BaseSelectOption[] {
  const existingByName = new Map(
    selectOptions(field).map((option) => [option.name, option])
  )
  const names = Array.from(
    new Set(rows.flatMap((row) => baseFieldDisplayValues(field, row.value)))
  )
  return names.map(
    (name, index) =>
      existingByName.get(name) ?? {
        id: createBaseId("option"),
        name,
        color: OPTION_COLORS[index % OPTION_COLORS.length],
      }
  )
}

function defaultProperty(
  type: MutableBaseFieldType,
  options: BaseSelectOption[]
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

function storageCodec(type: MutableBaseFieldType): BaseStorageCodec {
  if (type === "multi-select") return "csv_ids"
  if (type === "file") return "json_array"
  return "scalar"
}

function numericValue(values: string[]): number | null {
  if (values.length === 0) return null
  const parsed = Number(values[0])
  return Number.isFinite(parsed) ? parsed : null
}

function checkboxValue(
  sourceValue: BaseSqlPrimitive,
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
  type: MutableBaseFieldType,
  sourceValue: BaseSqlPrimitive,
  values: string[],
  optionIdByName: Map<string, string>
): BaseSqlPrimitive {
  if (sourceValue === null) return null
  if (type === "number") return numericValue(values)
  if (type === "checkbox") return checkboxValue(sourceValue, values)
  if (type === "rating") {
    const value = numericValue(values)
    return value === null ? null : Math.min(5, Math.max(0, Math.round(value)))
  }
  if (type === "file") return encodeBaseFilePaths(values)
  if (type === "select") {
    const name = values[0]
    return name ? (optionIdByName.get(name) ?? null) : null
  }
  if (type === "multi-select") {
    const ids = values.flatMap((name) => {
      const id = optionIdByName.get(name)
      return id ? [id] : []
    })
    return encodeBaseMultiSelectIds(ids)
  }
  return values.length > 0 ? values.join(", ") : null
}

export function planBaseFieldConversion(
  field: BaseFieldInfo,
  rows: BaseFieldValueRow[],
  targetType: MutableBaseFieldType
): BaseFieldConversionPlan {
  const options =
    targetType === "select" || targetType === "multi-select"
      ? optionPlan(field, rows)
      : []
  const optionIdByName = new Map(
    options.map((option) => [option.name, option.id])
  )
  return {
    property: defaultProperty(targetType, options),
    storageCodec: storageCodec(targetType),
    values: rows.map((row) => {
      const values = baseFieldDisplayValues(field, row.value)
      return {
        id: row.id,
        value: convertedValue(targetType, row.value, values, optionIdByName),
      }
    }),
  }
}
