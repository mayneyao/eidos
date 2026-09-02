import type {
  AtomicType,
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowValue,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileValues,
  decodeEidosFileJsonArray,
  decodeEidosFileMultiSelectValues,
  decodeEidosFileRelationDisplay,
} from "@eidos.space/eidos-file"

import { isEidosFileRecordLabelField } from "./eidos-file-field-visibility"

function scalarText(value: EidosFileRowValue | undefined): string {
  if (value === null || value === undefined || value === "") return "Empty"
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

function dateText(
  value: EidosFileRowValue | undefined,
  dateOnly: boolean,
  timeZone?: string
): string {
  if (typeof value !== "string" || value.length === 0) return "Empty"
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed =
    dateOnly && date
      ? new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]))
      : new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return dateOnly
    ? parsed.toLocaleDateString()
    : parsed.toLocaleString(undefined, timeZone ? { timeZone } : undefined)
}

export function eidosFileLookupListElementType(
  field: Pick<EidosFileFieldInfo, "type" | "property" | "storageCodec">
): AtomicType | null {
  if (field.type !== "lookup" || field.storageCodec !== "json_array") {
    return null
  }
  const valueType = field.property?.valueType
  const descriptor =
    valueType && typeof valueType === "object" && !Array.isArray(valueType)
      ? (valueType as Record<string, unknown>)
      : null
  if (
    !descriptor ||
    descriptor.kind !== "list" ||
    typeof descriptor.element !== "string"
  ) {
    return null
  }
  return descriptor.element as AtomicType
}

export function eidosFileLookupListText(
  row: EidosFileRow,
  field: EidosFileFieldInfo,
  timeZone?: string
): string {
  const value = row[field.tableColumnName]
  const elementType = eidosFileLookupListElementType(field)
  if (elementType === "file-entry") {
    return decodeEidosFileValues(value)
      .map((entry) => entry.name)
      .join(", ")
  }
  const values = decodeEidosFileJsonArray(value).flatMap((entry) =>
    entry === null ? [] : [entry]
  )
  if (elementType === "row-id") {
    const display = decodeEidosFileRelationDisplay(
      row[`${field.tableColumnName}__display`]
    )
    const titleById = new Map(display.map((entry) => [entry.id, entry.title]))
    return values
      .filter((entry): entry is string => typeof entry === "string")
      .map((id) => titleById.get(id) ?? id)
      .join(", ")
  }
  if (elementType === "checkbox") {
    return values
      .map((entry) => (entry === true || entry === 1 ? "Checked" : "Unchecked"))
      .join(", ")
  }
  if (elementType === "date" || elementType === "datetime") {
    return values
      .map((entry) =>
        dateText(
          typeof entry === "string" ? entry : String(entry),
          elementType === "date",
          timeZone
        )
      )
      .join(", ")
  }
  return values.map(String).join(", ")
}

export function eidosFileRecordFieldText(
  row: EidosFileRow,
  field: EidosFileFieldInfo,
  timeZone?: string
): string {
  const value = row[field.tableColumnName]
  const displayType =
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
      ? field.property.displayType
      : field.type
  if (field.type === "lookup" && field.storageCodec === "json_array") {
    return eidosFileLookupListText(row, field, timeZone) || "Empty"
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
  if (field.type === "relation") {
    const display = decodeEidosFileRelationDisplay(
      row[`${field.tableColumnName}__display`]
    )
    return display.length > 0
      ? display.map((entry) => entry.title).join(", ")
      : "Empty"
  }
  if (field.type === "file") {
    const files = decodeEidosFileValues(value)
    return files.length > 0
      ? files.map((entry) => entry.name).join(", ")
      : "Empty"
  }
  if (displayType === "date") return dateText(value, true)
  if (
    displayType === "datetime" ||
    displayType === "created-time" ||
    displayType === "last-edited-time"
  ) {
    return dateText(value, false, timeZone)
  }
  return scalarText(value)
}

export function eidosFileRecordTitle(
  row: EidosFileRow,
  fields: EidosFileFieldInfo[] = []
): string {
  const label = fields.find(isEidosFileRecordLabelField)
  return scalarText(label ? row[label.tableColumnName] : row.title)
}
