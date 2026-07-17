import type { BaseFieldInfo, BaseRow, BaseRowValue } from "@eidos.space/base"
import {
  decodeBaseFilePaths,
  decodeBaseRelationDisplay,
} from "@eidos.space/base"

import { baseSelectOptions } from "./base-grid-adapter"

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

function multiSelectIds(value: BaseRowValue | undefined): string[] {
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
      // Fall through to the v1 comma-separated representation.
    }
  }
  return value.split(",").filter(Boolean)
}

export function baseRecordFieldText(
  row: BaseRow,
  field: BaseFieldInfo
): string {
  const value = row[field.tableColumnName]
  if (field.type === "checkbox") {
    return value === true || value === 1 || value === "1"
      ? "Checked"
      : "Unchecked"
  }
  if (field.type === "select") {
    const selected = typeof value === "string" ? value : ""
    return (
      baseSelectOptions(field).find((option) => option.id === selected)?.name ??
      scalarText(value)
    )
  }
  if (field.type === "multi-select") {
    const names = new Map(
      baseSelectOptions(field).map((option) => [option.id, option.name])
    )
    const values = multiSelectIds(value).map((id) => names.get(id) ?? id)
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
