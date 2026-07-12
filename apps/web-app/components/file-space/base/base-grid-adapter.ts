import type {
  BaseFieldInfo,
  BaseRowValue,
  BaseSqlPrimitive,
} from "@eidos.space/base"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "@eidos.space/base"
import {
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
} from "@glideapps/glide-data-grid"

import { baseFileDisplayData, type BaseFileCell } from "./base-file-cell"

interface BaseSelectOption {
  id: string
  name: string
  color: string
}

function scalarText(value: BaseRowValue | undefined): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

function dateValue(value: BaseRowValue | undefined): Date | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3])
      )
    : new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function visibleBaseFields(
  fields: BaseFieldInfo[],
  hiddenFields: readonly string[] = []
): BaseFieldInfo[] {
  const hidden = new Set(hiddenFields)
  return fields.filter(
    (field) =>
      !field.isHidden &&
      !hidden.has(field.tableColumnName) &&
      (field.tableColumnName === "title" || field.valueKind === "source")
  )
}

export function baseGridColumn(field: BaseFieldInfo): GridColumn {
  return {
    id: field.tableColumnName,
    title: field.name,
    width: field.type === "title" ? 280 : 180,
    icon: field.type,
    hasMenu: true,
  }
}

export function baseSelectOptions(field: BaseFieldInfo): BaseSelectOption[] {
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

function multiSelectValues(value: BaseRowValue | undefined): string[] {
  if (typeof value !== "string" || value.length === 0) return []
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is string => typeof entry === "string"
        )
      }
    } catch {
      // Fall back to the v1 csv_ids representation.
    }
  }
  return value.split(",").filter(Boolean)
}

export function baseValueToGridCell(
  field: BaseFieldInfo,
  value: BaseRowValue | undefined,
  readonly = false
): GridCell {
  if (field.type === "file") {
    const paths = decodeBaseFilePaths(value)
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: encodeBaseFilePaths(paths) ?? "",
      data: {
        kind: "base-file-cell",
        paths,
        displayData: baseFileDisplayData(paths),
      },
    } satisfies BaseFileCell
  }
  if (field.type === "select") {
    const selected = typeof value === "string" ? value : null
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: selected ?? "",
      data: {
        kind: "select-cell",
        value: selected,
        allowedValues: baseSelectOptions(field),
        readonly,
      },
    }
  }
  if (field.type === "multi-select") {
    const values = multiSelectValues(value)
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: values.join(","),
      data: {
        kind: "multi-select-cell",
        values,
        allowedValues: baseSelectOptions(field),
        readonly,
      },
    }
  }
  if (field.type === "checkbox") {
    return {
      kind: GridCellKind.Boolean,
      allowOverlay: false,
      readonly,
      data: value === true || value === 1 || value === "1",
    }
  }
  if (field.type === "rating") {
    const rating = typeof value === "number" ? value : Number(value)
    const normalized = Number.isFinite(rating) ? rating : 0
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: String(normalized),
      data: { kind: "rating-cell", rating: normalized },
    }
  }
  if (field.type === "date" || field.type === "datetime") {
    const date = dateValue(value)
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: typeof value === "string" ? value : "",
      data: {
        kind: "date-picker-cell",
        date,
        displayDate: date
          ? field.type === "date"
            ? date.toLocaleDateString()
            : date.toLocaleString()
          : "",
        format: field.type === "date" ? "date" : "datetime-local",
      },
    }
  }
  if (field.type === "number") {
    const number = typeof value === "number" ? value : Number(value)
    const data = Number.isFinite(number) ? number : undefined
    return {
      kind: GridCellKind.Number,
      allowOverlay: true,
      readonly,
      data,
      displayData: data === undefined ? "" : String(data),
    }
  }
  const text = scalarText(value)
  if (field.type === "url") {
    return {
      kind: GridCellKind.Uri,
      allowOverlay: true,
      readonly,
      data: text,
    }
  }
  return {
    kind: GridCellKind.Text,
    allowOverlay: true,
    readonly,
    data: text,
    displayData: text,
  }
}

export function gridCellToBaseValue(
  field: BaseFieldInfo,
  cell: EditableGridCell
): BaseSqlPrimitive {
  if (cell.kind === GridCellKind.Custom) {
    const data = cell.data as Record<string, unknown>
    if (data.kind === "select-cell") {
      return typeof data.value === "string" && data.value.length > 0
        ? data.value
        : null
    }
    if (data.kind === "multi-select-cell") {
      const values = Array.isArray(data.values)
        ? data.values.filter(
            (entry): entry is string => typeof entry === "string"
          )
        : []
      return values.length > 0 ? values.join(",") : null
    }
    if (data.kind === "base-file-cell") {
      const paths = Array.isArray(data.paths)
        ? data.paths.filter(
            (entry): entry is string => typeof entry === "string"
          )
        : []
      return encodeBaseFilePaths(paths)
    }
    if (data.kind === "rating-cell") {
      return typeof data.rating === "number" ? data.rating : null
    }
    if (data.kind === "date-picker-cell") {
      if (!(data.date instanceof Date) || Number.isNaN(data.date.getTime())) {
        return null
      }
      return field.type === "date"
        ? localDateString(data.date)
        : data.date.toISOString()
    }
    return null
  }
  if (cell.kind === GridCellKind.Boolean) {
    return cell.data === true ? 1 : 0
  }
  if (cell.kind === GridCellKind.Number) {
    return cell.data ?? null
  }
  if (
    cell.kind === GridCellKind.Text ||
    cell.kind === GridCellKind.Uri ||
    cell.kind === GridCellKind.Markdown
  ) {
    return cell.data === "" ? null : cell.data
  }
  const raw = "data" in cell ? cell.data : null
  return typeof raw === "string" || typeof raw === "number" ? raw : null
}
