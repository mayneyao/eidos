import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowValue,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileAttachmentPaths,
  decodeEidosFileJsonArray,
  decodeEidosFileMultiSelectValues,
  decodeEidosFileRelationDisplay,
} from "@eidos.space/eidos-file"

function scalarText(value: EidosFileRowValue | undefined): string {
  if (value === null || value === undefined || value === "") return "Empty"
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

function dateText(
  value: EidosFileRowValue | undefined,
  dateOnly: boolean
): string {
  if (typeof value !== "string" || value.length === 0) return "Empty"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return dateOnly ? parsed.toLocaleDateString() : parsed.toLocaleString()
}

export function eidosFileRecordFieldText(
  row: EidosFileRow,
  field: EidosFileFieldInfo
): string {
  const value = row[field.tableColumnName]
  if (field.type === "lookup" && field.storageCodec === "json_array") {
    const values = decodeEidosFileJsonArray(value)
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
    const values = decodeEidosFileMultiSelectValues(
      typeof value === "string" ? value : null
    )
    return values.length > 0 ? values.join(", ") : "Empty"
  }
  if (field.type === "link") {
    const display = decodeEidosFileRelationDisplay(
      row[`${field.tableColumnName}__display`]
    )
    return display.length > 0
      ? display.map((entry) => entry.title).join(", ")
      : "Empty"
  }
  if (field.type === "file") {
    const files = decodeEidosFileAttachmentPaths(value)
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

export function eidosFileRecordTitle(row: EidosFileRow): string {
  return scalarText(row.title)
}
