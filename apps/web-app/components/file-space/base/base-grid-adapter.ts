import type {
  BaseFieldInfo,
  BaseRowValue,
  BaseSqlPrimitive,
} from "@eidos.space/base"
import {
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
} from "@glideapps/glide-data-grid"

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

export function visibleBaseFields(fields: BaseFieldInfo[]): BaseFieldInfo[] {
  return fields.filter(
    (field) =>
      !field.isHidden &&
      (field.tableColumnName === "title" || field.valueKind === "source")
  )
}

export function baseGridColumn(field: BaseFieldInfo): GridColumn {
  return {
    id: field.tableColumnName,
    title: field.name,
    width: field.type === "title" ? 280 : 180,
    icon: field.type,
    hasMenu: false,
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
  if (field.type === "number" || field.type === "rating") {
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
