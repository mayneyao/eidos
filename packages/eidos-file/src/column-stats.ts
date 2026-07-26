import { EidosFileError } from "./errors"
import { quoteIdentifier } from "./identifiers"
import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatType,
  EidosFileFieldInfo,
} from "./types"

const COMMON_STATS: readonly EidosFileColumnStatType[] = [
  "count-all",
  "count-non-null",
  "count-distinct",
  "count-empty",
]

const NUMERIC_STATS: readonly EidosFileColumnStatType[] = [
  ...COMMON_STATS,
  "sum",
  "average",
  "min",
  "max",
]

const DATE_STATS: readonly EidosFileColumnStatType[] = [
  ...COMMON_STATS,
  "min",
  "max",
]

const CHECKBOX_STATS: readonly EidosFileColumnStatType[] = [
  ...COMMON_STATS,
  "percent-checked",
  "percent-unchecked",
]

const MULTI_VALUE_STATS: readonly EidosFileColumnStatType[] = [...COMMON_STATS]

const RELATION_STATS: readonly EidosFileColumnStatType[] = [
  ...MULTI_VALUE_STATS,
  "relation-value-count",
  "relation-row-count",
  "relation-distinct-target-count",
]

const LABELS: Record<EidosFileColumnStatType, string> = {
  "count-all": "Count all",
  "count-non-null": "Count non-null",
  "count-distinct": "Count distinct",
  "count-empty": "Count empty",
  "percent-checked": "Percent checked",
  "percent-unchecked": "Percent unchecked",
  sum: "Sum",
  average: "Average",
  min: "Minimum",
  max: "Maximum",
  "relation-value-count": "Relation value count",
  "relation-row-count": "Relation row count",
  "relation-distinct-target-count": "Distinct Relation targets",
}

function displayType(
  field: EidosFileFieldInfo
): EidosFileFieldInfo["type"] | string {
  if (
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
  ) {
    return field.property.displayType
  }
  return field.type
}

export function eidosFileColumnStatTypesForField(
  field: EidosFileFieldInfo
): readonly EidosFileColumnStatType[] {
  const type = displayType(field)
  if (type === "number" || type === "rating") return NUMERIC_STATS
  if (
    type === "date" ||
    type === "datetime" ||
    type === "created-time" ||
    type === "last-edited-time"
  ) {
    return DATE_STATS
  }
  if (type === "checkbox") return CHECKBOX_STATS
  if (type === "relation") return RELATION_STATS
  if (type === "file" || type === "multi-select") {
    return MULTI_VALUE_STATS
  }
  return COMMON_STATS
}

export function eidosFileColumnStatLabel(
  type: EidosFileColumnStatType
): string {
  return LABELS[type]
}

export function normalizeEidosFileColumnStatConfigs(
  value: unknown,
  fields: EidosFileFieldInfo[]
): EidosFileColumnStatConfig[] {
  if (!Array.isArray(value)) {
    throw new EidosFileError(
      "invalid-query",
      "Eidos File column stats must be an array"
    )
  }
  if (value.length > 64) {
    throw new EidosFileError(
      "invalid-query",
      "Eidos File column stats cannot contain more than 64 calculations"
    )
  }
  const byId = new Map(
    fields.flatMap((field) => (field.id ? [[field.id, field]] : []))
  )
  return value.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { fieldId?: unknown }).fieldId !== "string" ||
      typeof (entry as { type?: unknown }).type !== "string"
    ) {
      throw new EidosFileError(
        "invalid-query",
        "Invalid Eidos File column stat"
      )
    }
    const config = entry as EidosFileColumnStatConfig
    const field = byId.get(config.fieldId)
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        `Eidos File field not found: ${config.fieldId}`
      )
    }
    if (!eidosFileColumnStatTypesForField(field).includes(config.type)) {
      throw new EidosFileError(
        "invalid-query",
        `${eidosFileColumnStatLabel(config.type)} is not supported for ${field.name}`
      )
    }
    return { fieldId: field.id!, type: config.type }
  })
}

export function compileEidosFileColumnStatExpression(
  field: EidosFileFieldInfo,
  type: EidosFileColumnStatType
): string {
  const column = quoteIdentifier(field.tableColumnName)
  const isArrayCodec =
    field.storageCodec === "json_array" || field.storageCodec === "relation"
  const empty = isArrayCodec
    ? `(${column} IS NULL OR (json_valid(${column}) AND json_type(${column}) = 'array' AND json_array_length(${column}) = 0))`
    : `(${column} IS NULL)`
  const present = `NOT ${empty}`

  switch (type) {
    case "count-all":
      return "COUNT(*)"
    case "count-non-null":
      return `COUNT(${column})`
    case "count-distinct":
      return `COUNT(DISTINCT CASE WHEN ${present} THEN ${column} END)`
    case "count-empty":
      return `COUNT(CASE WHEN ${empty} THEN 1 END)`
    case "percent-checked":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${column} = 1 THEN 1 END) / COUNT(*), 2) END`
    case "percent-unchecked":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${column} = 1 THEN NULL ELSE 1 END) / COUNT(*), 2) END`
    case "sum":
      return `SUM(CASE WHEN ${present} THEN CAST(${column} AS REAL) END)`
    case "average":
      return `AVG(CASE WHEN ${present} THEN CAST(${column} AS REAL) END)`
    case "min":
      return `MIN(CASE WHEN ${present} THEN ${column} END)`
    case "max":
      return `MAX(CASE WHEN ${present} THEN ${column} END)`
    case "relation-value-count":
      return `COALESCE(SUM(json_array_length(${column})), 0)`
    case "relation-row-count":
      return `COUNT(CASE WHEN json_array_length(${column}) > 0 THEN 1 END)`
    case "relation-distinct-target-count":
      return `COUNT(DISTINCT ${column})`
  }
}
