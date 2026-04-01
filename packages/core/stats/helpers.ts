import { ColumnStatType, type ColumnStatConfig } from "../types/IColumnStats"

/**
 * Check if field type is multi-value type
 */
export function isMultiValueField(fieldType: string): boolean {
  return ["multi-select", "created-by", "last-edited-by", "file"].includes(
    fieldType
  )
}

/**
 * Check if stat type returns date value
 */
function isDateStatType(type: ColumnStatType): boolean {
  return type === ColumnStatType.Min || type === ColumnStatType.Max
}

/**
 * Format stat value
 */
export function formatStatValue(
  value: number | string | null,
  config: ColumnStatConfig
): string {
  if (value === null || value === undefined) {
    return ""
  }

  const { type, precision = 2 } = config
  let valueStr: string

  // Special handling for date types (min/max on date fields)
  if (isDateStatType(type) && typeof value === "string") {
    return value
  }

  // Handle numeric values
  if (typeof value === "string") {
    value = parseFloat(value)
  }

  if (isNaN(value)) {
    return ""
  }

  // Special handling for percentages
  if (
    type === "percentEmpty" ||
    type === "percentNotEmpty" ||
    type === "percentChecked" ||
    type === "percentUnchecked"
  ) {
    valueStr = `${value.toFixed(precision)}%`
  }
  // Return directly for integer types
  else if (Number.isInteger(value) && type !== "avg" && type !== "median") {
    valueStr = value.toString()
  }
  // Number formatting
  else {
    valueStr = value.toFixed(precision)
  }

  return valueStr
}
