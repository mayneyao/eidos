import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowValue,
  BaseSqlPrimitive,
} from "@eidos.space/base"
import {
  decodeBaseFilePaths,
  decodeBaseJsonArray,
  decodeBaseMultiSelectValues,
  decodeBaseRelationDisplay,
  decodeBaseRelationIds,
  encodeBaseFilePaths,
  encodeBaseMultiSelectValues,
  encodeBaseRelationIds,
} from "@eidos.space/base"
import {
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
} from "@glideapps/glide-data-grid"
import type { RangeCell } from "./cells/range-cell"

import { baseNumberProperty, baseSelectOptions } from "./base-field-properties"
import { baseFieldDisplayName } from "./base-field-visibility"
import { baseFileDisplayData, type BaseFileCell } from "./base-file-cell"
import type { BaseRelationCell } from "./base-relation-cell"

export { visibleBaseFields } from "./base-field-visibility"

/** Glide cell option shape derived from a direct Base option value. */
export interface BaseGridSelectOption {
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

function formatBaseNumber(value: number, format: string): string {
  if (format === "percent") {
    return new Intl.NumberFormat(undefined, {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(value)
  }
  if (format === "currency") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value)
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 12,
  }).format(value)
}

export function baseGridColumn(field: BaseFieldInfo): GridColumn {
  return {
    id: field.tableColumnName,
    title: baseFieldDisplayName(field),
    width: field.type === "title" ? 280 : 180,
    icon: field.type,
    hasMenu: true,
  }
}

export function baseGridSelectOptions(
  field: BaseFieldInfo
): BaseGridSelectOption[] {
  return baseSelectOptions(field).map((option) => ({
    id: option.value,
    name: option.value,
    color: option.color,
  }))
}

export function baseValueToGridCell(
  field: BaseFieldInfo,
  value: BaseRowValue | undefined,
  readonly = false,
  row?: BaseRow
): GridCell {
  if (field.type === "lookup" && field.storageCodec === "json_array") {
    const values = decodeBaseJsonArray(value)
    const displayData = values
      .flatMap((entry) => (entry === null ? [] : [String(entry)]))
      .join(", ")
    return {
      kind: GridCellKind.Text,
      allowOverlay: true,
      readonly: true,
      data: typeof value === "string" ? value : "[]",
      displayData,
    }
  }
  if (field.type === "formula" || field.type === "lookup") {
    const displayType = field.property?.displayType
    const supported = new Set([
      "text",
      "number",
      "checkbox",
      "date",
      "datetime",
      "url",
    ])
    return baseValueToGridCell(
      {
        ...field,
        type:
          typeof displayType === "string" && supported.has(displayType)
            ? (displayType as BaseFieldInfo["type"])
            : "text",
      },
      value,
      true,
      row
    )
  }
  if (field.type === "link") {
    const ids = decodeBaseRelationIds(value)
    const display = decodeBaseRelationDisplay(
      row?.[`${field.tableColumnName}__display`]
    )
    const titleById = new Map(display.map((entry) => [entry.id, entry.title]))
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: encodeBaseRelationIds(ids) ?? "",
      data: {
        kind: "base-relation-cell",
        values: ids.map((id) => ({ id, title: titleById.get(id) ?? id })),
        multiple: field.property?.multiple !== false,
      },
    } satisfies BaseRelationCell
  }
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
        allowedValues: baseGridSelectOptions(field),
        allowCreate: false,
        readonly,
      },
    }
  }
  if (field.type === "multi-select") {
    const values = decodeBaseMultiSelectValues(
      typeof value === "boolean" ? null : (value ?? null)
    )
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: values.join(","),
      data: {
        kind: "multi-select-cell",
        values,
        allowedValues: baseGridSelectOptions(field),
        allowCreate: false,
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
  if (
    field.type === "date" ||
    field.type === "datetime" ||
    field.type === "created-time" ||
    field.type === "last-edited-time"
  ) {
    const date = dateValue(value)
    const dateOnly = field.type === "date"
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly: readonly || field.valueKind === "system",
      copyData: typeof value === "string" ? value : "",
      data: {
        kind: "date-picker-cell",
        date,
        displayDate: date
          ? dateOnly
            ? date.toLocaleDateString()
            : date.toLocaleString()
          : "",
        format: dateOnly ? "date" : "datetime-local",
      },
    }
  }
  if (field.type === "number") {
    const number = typeof value === "number" ? value : Number(value)
    const data = Number.isFinite(number) ? number : undefined
    const property = baseNumberProperty(field)
    if (data !== undefined && property.showAs === "bar") {
      return {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        readonly,
        copyData: String(data),
        data: {
          kind: "range-cell",
          min: 0,
          max: property.divideBy,
          step: 1,
          value: data,
          label: property.showNumber
            ? formatBaseNumber(data, property.format)
            : undefined,
          color: property.color,
        },
      } satisfies RangeCell
    }
    return {
      kind: GridCellKind.Number,
      allowOverlay: true,
      readonly,
      data,
      displayData:
        data === undefined ? "" : formatBaseNumber(data, property.format),
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
    readonly: readonly || field.valueKind === "system",
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
      return encodeBaseMultiSelectValues(values)
    }
    if (data.kind === "base-file-cell") {
      const paths = Array.isArray(data.paths)
        ? data.paths.filter(
            (entry): entry is string => typeof entry === "string"
          )
        : []
      return encodeBaseFilePaths(paths)
    }
    if (data.kind === "base-relation-cell") {
      const values = Array.isArray(data.values)
        ? data.values.flatMap((entry) => {
            if (
              typeof entry === "object" &&
              entry !== null &&
              "id" in entry &&
              typeof entry.id === "string"
            ) {
              return [entry.id]
            }
            return []
          })
        : []
      return encodeBaseRelationIds(values)
    }
    if (data.kind === "rating-cell") {
      return typeof data.rating === "number" ? data.rating : null
    }
    if (data.kind === "range-cell") {
      return typeof data.value === "number" ? data.value : null
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
