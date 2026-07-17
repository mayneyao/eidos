import type { BaseFieldInfo, BaseRow, BaseRowValue } from "@eidos.space/base"
import {
  decodeBaseFilePaths,
  decodeBaseJsonArray,
  decodeBaseMultiSelectValues,
  decodeBaseRelationDisplay,
} from "@eidos.space/base"

function scalarText(value: BaseRowValue | undefined): string {
  if (value === null || value === undefined || value === "") return "Empty"
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

function dateText(value: BaseRowValue | undefined, dateOnly: boolean): string {
  if (typeof value !== "string" || value.length === 0) return "Empty"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return dateOnly ? parsed.toLocaleDateString() : parsed.toLocaleString()
}

export function baseRecordFieldText(
  row: BaseRow,
  field: BaseFieldInfo
): string {
  const value = row[field.tableColumnName]
  if (field.type === "lookup" && field.storageCodec === "json_array") {
    const values = decodeBaseJsonArray(value)
    return values.length > 0
      ? values
          .flatMap((entry) => (entry === null ? [] : [String(entry)]))
          .join(", ")
      : "Empty"
  }
  if (field.type === "checkbox") {
    return value === true || value === 1 || value === "1"
      ? "Checked"
      : "Unchecked"
  }
  if (field.type === "select") {
    return scalarText(value)
  }
  if (field.type === "multi-select") {
    const values = decodeBaseMultiSelectValues(
      typeof value === "string" ? value : null
    )
    return values.length > 0 ? values.join(", ") : "Empty"
  }
  if (field.type === "link") {
    const display = decodeBaseRelationDisplay(
      row[`${field.tableColumnName}__display`]
    )
    return display.length > 0
      ? display.map((entry) => entry.title).join(", ")
      : "Empty"
  }
  if (field.type === "file") {
    const files = decodeBaseFilePaths(value)
    return files.length > 0 ? files.join(", ") : "Empty"
  }
  if (field.type === "date") return dateText(value, true)
  if (
    field.type === "datetime" ||
    field.type === "created-time" ||
    field.type === "last-edited-time"
  ) {
    return dateText(value, false)
  }
  return scalarText(value)
}

export function baseRecordTitle(row: BaseRow): string {
  return scalarText(row.title)
}
