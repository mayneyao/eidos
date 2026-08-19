import type {
  FileEntry,
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowValue,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileValues,
  decodeEidosFileJsonArray,
  decodeEidosFileMultiSelectValues,
  decodeEidosFileRelationDisplay,
  decodeEidosFileRelationIds,
  encodeEidosFileValues,
  encodeEidosFileMultiSelectValues,
  encodeEidosFileRelationIds,
} from "@eidos.space/eidos-file"
import {
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
} from "@glideapps/glide-data-grid"
import type { RangeCell } from "./cells/range-cell"

import {
  eidosFileFieldDisplaysUrl,
  eidosFileNumberProperty,
  eidosFileSelectOptions,
  eidosFileUrlDisplaysImage,
} from "./eidos-file-field-properties"
import {
  eidosFileFieldDisplayName,
  isOptionalEidosFileSystemField,
} from "./eidos-file-field-visibility"
import { formatEidosFileGridDate } from "./eidos-file-grid-date-format"
import type { EidosFileAttachmentCell } from "./eidos-file-attachment-cell"
import type { EidosFileRelationCell } from "./eidos-file-relation-cell"
import type { EidosFileUrlImageCell } from "./eidos-file-url-image-cell"

export { visibleEidosFileFields } from "./eidos-file-field-visibility"

/** Glide cell option shape derived from a direct Eidos File option value. */
export interface EidosFileGridSelectOption {
  id: string
  name: string
  color: string
}

const EIDOS_FILE_GRID_MONO_FONT_FAMILY =
  '"SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace'

function scalarText(value: EidosFileRowValue | undefined): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`
  return String(value)
}

function dateValue(value: EidosFileRowValue | undefined): Date | undefined {
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

function formatEidosFileNumber(value: number, format: string): string {
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

export function eidosFileGridColumn(field: EidosFileFieldInfo): GridColumn {
  return {
    id: field.tableColumnName,
    title: eidosFileFieldDisplayName(field),
    width: field.isRecordLabel ? 280 : 180,
    icon: field.type,
    hasMenu: true,
  }
}

export function eidosFileGridSelectOptions(
  field: EidosFileFieldInfo
): EidosFileGridSelectOption[] {
  return eidosFileSelectOptions(field).map((option) => ({
    id: option.value,
    name: option.value,
    color: option.color,
  }))
}

export function eidosFileValueToGridCell(
  field: EidosFileFieldInfo,
  value: EidosFileRowValue | undefined,
  readonly = false,
  row?: EidosFileRow,
  unavailableRelationTitle = "Unavailable record",
  allowWrapping = false
): GridCell {
  if (field.type === "lookup" && field.storageCodec === "json_array") {
    const values = decodeEidosFileJsonArray(value)
    const displayData = values
      .flatMap((entry) => (entry === null ? [] : [String(entry)]))
      .join(", ")
    return {
      kind: GridCellKind.Text,
      allowOverlay: true,
      allowWrapping,
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
    return eidosFileValueToGridCell(
      {
        ...field,
        type:
          typeof displayType === "string" && supported.has(displayType)
            ? (displayType as EidosFileFieldInfo["type"])
            : "text",
      },
      value,
      true,
      row,
      unavailableRelationTitle,
      allowWrapping
    )
  }
  if (field.type === "relation") {
    const ids = decodeEidosFileRelationIds(value)
    const display = decodeEidosFileRelationDisplay(
      row?.[`${field.tableColumnName}__display`]
    )
    const titleById = new Map(display.map((entry) => [entry.id, entry.title]))
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: encodeEidosFileRelationIds(ids) ?? "",
      data: {
        kind: "eidos-file-relation-cell",
        values: ids.map((id) => ({
          id,
          title: titleById.get(id) ?? unavailableRelationTitle,
        })),
        multiple: field.property?.multiple !== false,
      },
    } satisfies EidosFileRelationCell
  }
  if (field.type === "file") {
    const entries = decodeEidosFileValues(value)
    return {
      kind: GridCellKind.Custom,
      allowOverlay: true,
      readonly,
      copyData: typeof value === "string" ? value : "",
      data: {
        kind: "eidos-file-file-cell",
        entries,
      },
    } satisfies EidosFileAttachmentCell
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
        allowedValues: eidosFileGridSelectOptions(field),
        allowCreate: false,
        readonly,
      },
    }
  }
  if (field.type === "multi-select") {
    const values = decodeEidosFileMultiSelectValues(
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
        allowedValues: eidosFileGridSelectOptions(field),
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
    const cellReadonly = readonly || isOptionalEidosFileSystemField(field)
    return {
      kind: GridCellKind.Custom,
      allowOverlay: !cellReadonly,
      readonly: cellReadonly,
      copyData: typeof value === "string" ? value : "",
      themeOverride: { fontFamily: EIDOS_FILE_GRID_MONO_FONT_FAMILY },
      data: {
        kind: "date-picker-cell",
        date,
        displayDate: date
          ? formatEidosFileGridDate(date, dateOnly ? "date" : "datetime-local")
          : "",
        format: dateOnly ? "date" : "datetime-local",
      },
    }
  }
  if (field.type === "number") {
    const number =
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim().length === 0)
        ? undefined
        : typeof value === "number"
          ? value
          : Number(value)
    const data =
      number !== undefined && Number.isFinite(number) ? number : undefined
    const property = eidosFileNumberProperty(field)
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
            ? formatEidosFileNumber(data, property.format)
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
        data === undefined ? "" : formatEidosFileNumber(data, property.format),
    }
  }
  const text = scalarText(value)
  if (eidosFileFieldDisplaysUrl(field)) {
    if (eidosFileUrlDisplaysImage(field)) {
      return {
        kind: GridCellKind.Custom,
        allowOverlay: true,
        readonly,
        copyData: text,
        data: {
          kind: "eidos-file-url-image-cell",
          uri: text,
        },
      } satisfies EidosFileUrlImageCell
    }
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
    allowWrapping,
    readonly: readonly || isOptionalEidosFileSystemField(field),
    data: text,
    displayData: text,
    themeOverride:
      field.type === "row-id"
        ? { fontFamily: EIDOS_FILE_GRID_MONO_FONT_FAMILY }
        : undefined,
  }
}

export function gridCellToEidosFileValue(
  field: EidosFileFieldInfo,
  cell: EditableGridCell
): EidosFileSqlPrimitive {
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
      return encodeEidosFileMultiSelectValues(values)
    }
    if (data.kind === "eidos-file-file-cell") {
      const entries = Array.isArray(data.entries)
        ? data.entries.filter(
            (entry): entry is FileEntry =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as { id?: unknown }).id === "string"
          )
        : []
      return entries.length > 0 ? encodeEidosFileValues(entries) : null
    }
    if (data.kind === "eidos-file-relation-cell") {
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
      return encodeEidosFileRelationIds(values)
    }
    if (data.kind === "rating-cell") {
      return typeof data.rating === "number" ? data.rating : null
    }
    if (data.kind === "range-cell") {
      return typeof data.value === "number" ? data.value : null
    }
    if (data.kind === "eidos-file-url-image-cell") {
      return typeof data.uri === "string" && data.uri !== "" ? data.uri : null
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
