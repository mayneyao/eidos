"use client"

import { useCallback, useMemo } from "react"
import DataEditor, {
  type DataEditorProps,
  type GridCell,
  type GridColumn,
  GridCellKind,
  type Item,
} from "@glideapps/glide-data-grid"
import { useTheme } from "@/components/theme-provider"
import { useDynamicTheme } from "@/components/table/views/grid/theme"

import "@glideapps/glide-data-grid/dist/index.css"

export type DiffGridOp = "insert" | "delete" | "update"
type DiffGridRowKey = Record<string, string | number | null | { $blob: string }>

export interface DiffGridRow {
  id?: string
  op: DiffGridOp
  rowid?: number | string
  key?: DiffGridRowKey
  columns?: string[]
  values?: unknown[]
  before?: unknown[]
  after?: unknown[]
  status?: "resolved" | "unresolved" | string
  resolution?: "ours" | "theirs" | string
  table?: string
}

interface DiffDataGridProps {
  rows: DiffGridRow[]
  columns?: string[]
  maxVisibleRows?: number
  mode?: "diff" | "conflict"
  resolvingRowKey?: string | null
  disableActions?: boolean
  onResolveRow?: (row: DiffGridRow, resolution: "ours" | "theirs") => void
}

const OP_COLUMN_WIDTH = 92
const ROW_COLUMN_WIDTH = 64
const DEFAULT_COLUMN_WIDTH = 160
const MAX_COLUMN_WIDTH = 320
const ROW_HEIGHT = 34
const HEADER_HEIGHT = 34
const SCROLLBAR_HEIGHT_COMPENSATION = 20
const CHOICE_COLUMN_WIDTH = 112
const ACTION_COLUMN_WIDTH = 84

function arrayValueAt(values: unknown[] | undefined, index: number) {
  if (!Array.isArray(values) || index < 0 || index >= values.length) {
    return { present: false, value: undefined }
  }
  return { present: true, value: values[index] }
}

function formatValue(value: unknown): string {
  if (value === null) return "NULL"
  if (value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return Object.is(a, b)
  }
}

function getAllColumns(rows: DiffGridRow[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    for (const col of row.columns ?? []) {
      if (!seen.has(col)) seen.add(col)
    }
  }
  return [...seen]
}

function valueForColumn(row: DiffGridRow, column: string) {
  const index = row.columns?.indexOf(column) ?? -1
  if (index < 0) return { before: undefined, after: undefined, changed: false }

  const valuesAfter = arrayValueAt(row.values, index)
  const afterValue = arrayValueAt(row.after, index)
  const beforeValue = arrayValueAt(row.before, index)
  const deleteValue = arrayValueAt(row.values, index)
  const after = valuesAfter.present ? valuesAfter.value : afterValue.value
  const before = beforeValue.present
    ? beforeValue.value
    : row.op === "delete" && deleteValue.present
      ? deleteValue.value
      : undefined
  return {
    before,
    after,
    changed: row.op === "update" ? !sameValue(before, after) : false,
  }
}

function getUpdateChangedColumns(rows: DiffGridRow[]): Set<string> {
  const columns = new Set<string>()
  for (const row of rows) {
    if (row.op !== "update") continue
    for (const column of row.columns ?? []) {
      if (valueForColumn(row, column).changed) columns.add(column)
    }
  }
  return columns
}

function displayValue(row: DiffGridRow, column: string): string {
  const { before, after, changed } = valueForColumn(row, column)
  if (row.op === "update") {
    if (!changed) return formatValue(after)
    return `${formatValue(before)} -> ${formatValue(after)}`
  }
  return formatValue(row.op === "delete" ? before : after)
}

function updateCellTheme(isDark: boolean) {
  return {
    bgCell: isDark ? "#3a260f" : "#fff4d6",
    bgCellMedium: isDark ? "#4a300f" : "#fde68a",
    textDark: isDark ? "#ffedd5" : "#7c2d12",
    textMedium: isDark ? "#fed7aa" : "#9a3412",
    accentColor: isDark ? "#fb923c" : "#ea580c",
    accentLight: isDark ? "#7c2d12" : "#fed7aa",
  }
}

function deletedValueCellTheme(isDark: boolean) {
  return {
    bgCell: isDark ? "#2a1317" : "#fff1f2",
    bgCellMedium: isDark ? "#3a171d" : "#ffe4e6",
    textDark: isDark ? "#fecdd3" : "#7f1d1d",
    textMedium: isDark ? "#fda4af" : "#9f1239",
    accentColor: isDark ? "#fb7185" : "#e11d48",
    accentLight: isDark ? "#7f1d1d" : "#fecdd3",
  }
}

function insertedValueCellTheme(isDark: boolean) {
  return {
    bgCell: isDark ? "#0f241b" : "#ecfdf3",
    bgCellMedium: isDark ? "#143322" : "#dcfce7",
    textDark: isDark ? "#bbf7d0" : "#14532d",
    textMedium: isDark ? "#86efac" : "#166534",
    accentColor: isDark ? "#4ade80" : "#16a34a",
    accentLight: isDark ? "#14532d" : "#bbf7d0",
  }
}

function changedCellTheme(before: unknown, after: unknown, isDark: boolean) {
  if (after === null && before !== null) return deletedValueCellTheme(isDark)
  if (before === null && after !== null) return insertedValueCellTheme(isDark)
  return updateCellTheme(isDark)
}

function updateOpTheme(isDark: boolean) {
  return {
    bgCell: isDark ? "#241a0b" : "#fffbeb",
    bgCellMedium: isDark ? "#34260d" : "#fef3c7",
    textDark: isDark ? "#fde68a" : "#78350f",
    textMedium: isDark ? "#fcd34d" : "#92400e",
  }
}

function opLabel(op: DiffGridOp): string {
  if (op === "insert") return "+ INSERT"
  if (op === "delete") return "- DELETE"
  return "~ UPDATE"
}

function conflictChoiceLabel(row: DiffGridRow): string {
  if (row.resolution === "ours") return "OURS"
  if (row.resolution === "theirs") return "THEIRS"
  return "UNRESOLVED"
}

function conflictChoiceTheme(row: DiffGridRow, isDark: boolean) {
  if (row.resolution === "ours") {
    return {
      bgCell: isDark ? "#0f241b" : "#ecfdf3",
      bgCellMedium: isDark ? "#143322" : "#dcfce7",
      textDark: isDark ? "#bbf7d0" : "#14532d",
      textMedium: isDark ? "#86efac" : "#166534",
      accentColor: isDark ? "#4ade80" : "#16a34a",
      accentLight: isDark ? "#14532d" : "#bbf7d0",
    }
  }
  if (row.resolution === "theirs") {
    return {
      bgCell: isDark ? "#172033" : "#eff6ff",
      bgCellMedium: isDark ? "#1e2a44" : "#dbeafe",
      textDark: isDark ? "#bfdbfe" : "#1e3a8a",
      textMedium: isDark ? "#93c5fd" : "#1d4ed8",
      accentColor: isDark ? "#60a5fa" : "#2563eb",
      accentLight: isDark ? "#1e3a8a" : "#bfdbfe",
    }
  }
  return {
    bgCell: isDark ? "#2b220d" : "#fffbeb",
    bgCellMedium: isDark ? "#3a2d10" : "#fef3c7",
    textDark: isDark ? "#fde68a" : "#78350f",
    textMedium: isDark ? "#fcd34d" : "#92400e",
    accentColor: isDark ? "#fbbf24" : "#d97706",
    accentLight: isDark ? "#78350f" : "#fde68a",
  }
}

function rowTheme(op: DiffGridOp, isDark: boolean) {
  if (op === "insert") {
    return {
      bgCell: isDark ? "#0f241b" : "#ecfdf3",
      bgCellMedium: isDark ? "#143322" : "#dcfce7",
      textDark: isDark ? "#bbf7d0" : "#14532d",
      textMedium: isDark ? "#86efac" : "#166534",
    }
  }
  if (op === "delete") {
    return {
      bgCell: isDark ? "#2a1317" : "#fff1f2",
      bgCellMedium: isDark ? "#3a171d" : "#ffe4e6",
      textDark: isDark ? "#fecdd3" : "#7f1d1d",
      textMedium: isDark ? "#fda4af" : "#9f1239",
    }
  }
  return {
    bgCell: isDark ? "#261c0b" : "#fffbeb",
    bgCellMedium: isDark ? "#34260d" : "#fef3c7",
    textDark: isDark ? "#fde68a" : "#78350f",
    textMedium: isDark ? "#fcd34d" : "#92400e",
  }
}

export function DiffDataGrid({
  rows,
  columns,
  maxVisibleRows = 12,
  mode = "diff",
  resolvingRowKey,
  disableActions,
  onResolveRow,
}: DiffDataGridProps) {
  const { resolvedTheme } = useTheme()
  const theme = useDynamicTheme(resolvedTheme || "light")
  const isDark = resolvedTheme === "dark"
  const dataColumns = useMemo(
    () => (columns?.length ? columns : getAllColumns(rows)),
    [columns, rows]
  )
  const updateChangedColumns = useMemo(
    () => getUpdateChangedColumns(rows),
    [rows]
  )
  const gridColumns = useMemo<GridColumn[]>(() => {
    const fixed: GridColumn[] = [
      { id: "__op", title: "op", width: OP_COLUMN_WIDTH },
      { id: "__row", title: "row", width: ROW_COLUMN_WIDTH },
    ]
    if (mode === "conflict") {
      fixed.push(
        { id: "__choice", title: "choice", width: CHOICE_COLUMN_WIDTH },
        { id: "__ours", title: "ours", width: ACTION_COLUMN_WIDTH },
        { id: "__theirs", title: "theirs", width: ACTION_COLUMN_WIDTH }
      )
    }
    return [
      ...fixed,
      ...dataColumns.map((column) => ({
        id: column,
        title: updateChangedColumns.has(column) ? `~ ${column}` : column,
        width: Math.min(
          MAX_COLUMN_WIDTH,
          Math.max(DEFAULT_COLUMN_WIDTH, column.length * 9 + 32)
        ),
      })),
    ]
  }, [dataColumns, mode, updateChangedColumns])

  const getCellContent = useCallback(
    ([col, rowIndex]: Item): GridCell => {
      const row = rows[rowIndex]
      if (!row) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        }
      }

      if (col === 0) {
        return {
          kind: GridCellKind.Text,
          data: row.op,
          displayData: opLabel(row.op),
          allowOverlay: false,
          readonly: true,
          themeOverride:
            row.op === "update" ? updateOpTheme(isDark) : undefined,
        }
      }

      if (col === 1) {
        const rowid =
          row.rowid == null
            ? row.key
              ? JSON.stringify(row.key)
              : ""
            : String(row.rowid)
        return {
          kind: GridCellKind.Text,
          data: rowid,
          displayData: rowid,
          allowOverlay: false,
          readonly: true,
        }
      }

      if (mode === "conflict") {
        if (col === 2) {
          const displayData = conflictChoiceLabel(row)
          return {
            kind: GridCellKind.Text,
            data: displayData,
            displayData,
            allowOverlay: false,
            readonly: true,
            themeOverride: conflictChoiceTheme(row, isDark),
          }
        }

        if (col === 3 || col === 4) {
          const resolution = col === 3 ? "ours" : "theirs"
          const rowKey =
            row.id ??
            `${row.table ?? ""}:${row.rowid ?? (row.key ? JSON.stringify(row.key) : rowIndex)}`
          const isActive = resolvingRowKey === `${resolution}:${rowKey}`
          const displayData = isActive
            ? "..."
            : row.resolution === resolution
              ? "Selected"
              : resolution === "ours"
                ? "Keep"
                : "Take"
          return {
            kind: GridCellKind.Text,
            data: displayData,
            displayData,
            allowOverlay: false,
            readonly: true,
            themeOverride:
              row.resolution === resolution
                ? conflictChoiceTheme(row, isDark)
                : undefined,
          }
        }
      }

      const dataColumnOffset = mode === "conflict" ? 5 : 2
      const column = dataColumns[col - dataColumnOffset]
      const value = valueForColumn(row, column)
      const displayData = displayValue(row, column)
      return {
        kind: GridCellKind.Text,
        data: displayData,
        displayData,
        allowOverlay: true,
        allowWrapping: false,
        readonly: true,
        style: row.op === "update" && !value.changed ? "faded" : "normal",
        themeOverride:
          row.op === "update" && value.changed
            ? changedCellTheme(value.before, value.after, isDark)
            : undefined,
      }
    },
    [dataColumns, isDark, mode, resolvingRowKey, rows]
  )

  const getRowThemeOverride = useCallback<
    NonNullable<DataEditorProps["getRowThemeOverride"]>
  >(
    (rowIndex) => {
      const row = rows[rowIndex]
      if (!row) return undefined
      if (row.op === "update") return undefined
      return rowTheme(row.op, isDark)
    },
    [isDark, rows]
  )

  const height = Math.max(
    HEADER_HEIGHT + ROW_HEIGHT,
    Math.min(rows.length, maxVisibleRows) * ROW_HEIGHT +
      HEADER_HEIGHT +
      SCROLLBAR_HEIGHT_COMPENSATION
  )

  return (
    <div
      className="overflow-hidden rounded-md border border-border/60 bg-background"
      style={{ height }}
    >
      <DataEditor
        width="100%"
        height="100%"
        theme={theme}
        rows={rows.length}
        columns={gridColumns}
        getCellContent={getCellContent}
        getRowThemeOverride={getRowThemeOverride}
        rowHeight={ROW_HEIGHT}
        headerHeight={HEADER_HEIGHT}
        freezeColumns={mode === "conflict" ? 5 : 2}
        onCellClicked={
          mode === "conflict" && onResolveRow
            ? ([col, rowIndex]) => {
                if (disableActions || resolvingRowKey) return
                const row = rows[rowIndex]
                if (!row) return
                if (col === 3) onResolveRow(row, "ours")
                if (col === 4) onResolveRow(row, "theirs")
              }
            : undefined
        }
        smoothScrollX
        smoothScrollY
        isDraggable={false}
        rowMarkers="none"
        maxColumnWidth={MAX_COLUMN_WIDTH}
        keybindings={{ search: true }}
      />
    </div>
  )
}
