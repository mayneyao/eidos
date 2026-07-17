import { EidosFileError } from "./errors"
import { quoteIdentifier } from "./identifiers"
import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatType,
  EidosFileFieldInfo,
} from "./types"

const COMMON_STATS: readonly EidosFileColumnStatType[] = [
  "count-all",
  "count-values",
  "count-unique",
  "count-empty",
  "count-not-empty",
  "percent-empty",
  "percent-not-empty",
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
  "range",
]

const CHECKBOX_STATS: readonly EidosFileColumnStatType[] = [
  "count-all",
  "checked",
  "unchecked",
  "percent-checked",
  "percent-unchecked",
]

const MULTI_VALUE_STATS: readonly EidosFileColumnStatType[] = [
  "count-all",
  "count-values",
  "count-empty",
  "count-not-empty",
  "percent-empty",
  "percent-not-empty",
]

const LABELS: Record<EidosFileColumnStatType, string> = {
  "count-all": "Count all",
  "count-values": "Count values",
  "count-unique": "Count unique",
  "count-empty": "Count empty",
  "count-not-empty": "Count not empty",
  checked: "Checked",
  unchecked: "Unchecked",
  "percent-empty": "Percent empty",
  "percent-not-empty": "Percent not empty",
  "percent-checked": "Percent checked",
  "percent-unchecked": "Percent unchecked",
  sum: "Sum",
  average: "Average",
  min: "Minimum",
  max: "Maximum",
  range: "Date range",
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
  if (type === "file" || type === "multi-select" || type === "link") {
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
  const byColumn = new Map(
    fields.map((field) => [field.tableColumnName, field])
  )
  return value.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { columnName?: unknown }).columnName !== "string" ||
      typeof (entry as { type?: unknown }).type !== "string"
    ) {
      throw new EidosFileError(
        "invalid-query",
        "Invalid Eidos File column stat"
      )
    }
    const config = entry as EidosFileColumnStatConfig
    const field = byColumn.get(config.columnName)
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        `Eidos File field not found: ${config.columnName}`
      )
    }
    if (!eidosFileColumnStatTypesForField(field).includes(config.type)) {
      throw new EidosFileError(
        "invalid-query",
        `${eidosFileColumnStatLabel(config.type)} is not supported for ${field.name}`
      )
    }
    return { columnName: field.tableColumnName, type: config.type }
  })
}

export function compileEidosFileColumnStatExpression(
  field: EidosFileFieldInfo,
  type: EidosFileColumnStatType
): string {
  const column = quoteIdentifier(field.tableColumnName)
  const text = `CAST(${column} AS TEXT)`
  const isArrayCodec =
    field.storageCodec === "json_array" || field.storageCodec === "relation"
  const empty = isArrayCodec
    ? `(${column} IS NULL OR ${text} = '' OR (json_valid(${column}) AND json_type(${column}) = 'array' AND json_array_length(${column}) = 0))`
    : `(${column} IS NULL OR ${text} = '')`
  const present = `NOT ${empty}`
  const valueCount = isArrayCodec
    ? `CASE
         WHEN ${empty} THEN 0
         WHEN json_valid(${column}) AND json_type(${column}) = 'array'
           THEN json_array_length(${column})
         ELSE 0
       END`
    : null

  switch (type) {
    case "count-all":
      return "COUNT(*)"
    case "count-values":
      return valueCount
        ? `COALESCE(SUM(${valueCount}), 0)`
        : `COUNT(CASE WHEN ${present} THEN 1 END)`
    case "count-unique":
      return `COUNT(DISTINCT CASE WHEN ${present} THEN ${column} END)`
    case "count-empty":
      return `COUNT(CASE WHEN ${empty} THEN 1 END)`
    case "count-not-empty":
      return `COUNT(CASE WHEN ${present} THEN 1 END)`
    case "checked":
      return `COUNT(CASE WHEN ${column} = 1 THEN 1 END)`
    case "unchecked":
      return `COUNT(CASE WHEN ${column} = 0 OR ${column} IS NULL THEN 1 END)`
    case "percent-empty":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${empty} THEN 1 END) / COUNT(*), 2) END`
    case "percent-not-empty":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${present} THEN 1 END) / COUNT(*), 2) END`
    case "percent-checked":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${column} = 1 THEN 1 END) / COUNT(*), 2) END`
    case "percent-unchecked":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${column} = 0 OR ${column} IS NULL THEN 1 END) / COUNT(*), 2) END`
    case "sum":
      return `COALESCE(SUM(CASE WHEN ${present} THEN CAST(${column} AS REAL) END), 0)`
    case "average":
      return `AVG(CASE WHEN ${present} THEN CAST(${column} AS REAL) END)`
    case "min":
      return `MIN(CASE WHEN ${present} THEN ${column} END)`
    case "max":
      return `MAX(CASE WHEN ${present} THEN ${column} END)`
    case "range":
      return `CASE WHEN MIN(CASE WHEN ${present} THEN ${column} END) IS NULL THEN NULL ELSE JULIANDAY(MAX(CASE WHEN ${present} THEN ${column} END)) - JULIANDAY(MIN(CASE WHEN ${present} THEN ${column} END)) END`
  }
}
