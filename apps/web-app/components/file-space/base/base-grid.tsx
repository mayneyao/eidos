import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseSqlPrimitive,
  BaseTableSnapshot,
} from "@eidos.space/base"
import DataEditor, {
  type DataEditorProps,
  type DataEditorRef,
  type EditableGridCell,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid"
import { useTheme } from "@/components/theme-provider"

import { useCurrentTheme } from "@/apps/web-app/hooks/use-current-theme"
import MultiSelectCell from "@/components/table/views/grid/cells/multi-select-cell"
import SelectCell from "@/components/table/views/grid/cells/select-cell"
import { defaultConfig } from "@/components/table/views/grid/grid-default-config"
import { useDynamicTheme } from "@/components/table/views/grid/theme"

import {
  baseGridColumn,
  baseValueToGridCell,
  gridCellToBaseValue,
  visibleBaseFields,
} from "./base-grid-adapter"

import "@glideapps/glide-data-grid/dist/index.css"

interface BaseGridProps {
  table: BaseTableSnapshot
  disabled?: boolean
  onAddRow: () => Promise<void> | void
  onCellEdit: (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => Promise<void> | void
}

function sameFields(left: BaseFieldInfo[], right: BaseFieldInfo[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (field, index) => field.tableColumnName === right[index]?.tableColumnName
    )
  )
}

export function BaseGrid({
  table,
  disabled = false,
  onAddRow,
  onCellEdit,
}: BaseGridProps) {
  const { resolvedTheme } = useTheme()
  const { css: spaceThemeCss } = useCurrentTheme()
  const theme = useDynamicTheme(resolvedTheme, spaceThemeCss)
  const gridRef = useRef<DataEditorRef>(null)
  const availableFields = useMemo(
    () => visibleBaseFields(table.fields),
    [table.fields]
  )
  const [fields, setFields] = useState(availableFields)
  const [widths, setWidths] = useState<Record<string, number>>({})

  useEffect(() => {
    setFields((current) =>
      sameFields(current, availableFields) ? current : availableFields
    )
  }, [availableFields])

  const columns = useMemo(
    () =>
      fields.map((field) => {
        const column = baseGridColumn(field)
        return {
          ...column,
          width: widths[field.tableColumnName] ?? column.width,
        }
      }),
    [fields, widths]
  )

  const getCellContent = useCallback<
    NonNullable<DataEditorProps["getCellContent"]>
  >(
    ([columnIndex, rowIndex]) => {
      const field = fields[columnIndex]
      const row = table.rows[rowIndex]
      if (!field || !row) {
        return {
          kind: "loading",
          allowOverlay: false,
        } as ReturnType<NonNullable<DataEditorProps["getCellContent"]>>
      }
      return baseValueToGridCell(field, row[field.tableColumnName], disabled)
    },
    [disabled, fields, table.rows]
  )

  const commitCell = useCallback(
    (location: Item, nextCell: EditableGridCell) => {
      if (disabled) return
      const [columnIndex, rowIndex] = location
      const field = fields[columnIndex]
      const row = table.rows[rowIndex]
      if (!field || !row) return
      const nextValue = gridCellToBaseValue(field, nextCell)
      if (Object.is(row[field.tableColumnName], nextValue)) return
      void onCellEdit(row, field, nextValue)
    },
    [disabled, fields, onCellEdit, table.rows]
  )

  const onCellsEdited = useCallback<
    NonNullable<DataEditorProps["onCellsEdited"]>
  >(
    (edits) => {
      edits.forEach((edit) => commitCell(edit.location, edit.value))
      return true
    },
    [commitCell]
  )

  const onColumnResize = useCallback(
    (column: GridColumn, _newSize: number, _index: number, newSize: number) => {
      const id = typeof column.id === "string" ? column.id : column.title
      setWidths((current) => ({ ...current, [id]: newSize }))
    },
    []
  )

  const onColumnMoved = useCallback((from: number, to: number) => {
    setFields((current) => {
      const next = [...current]
      const [moved] = next.splice(from, 1)
      if (!moved) return current
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <DataEditor
        {...defaultConfig}
        ref={gridRef}
        theme={theme}
        columns={columns}
        rows={table.rows.length}
        getCellContent={getCellContent}
        customRenderers={[SelectCell, MultiSelectCell]}
        fillHandle={!disabled}
        onCellEdited={disabled ? undefined : commitCell}
        onCellsEdited={disabled ? undefined : onCellsEdited}
        onColumnResize={onColumnResize}
        onColumnMoved={onColumnMoved}
        onRowAppended={
          disabled
            ? undefined
            : async () => {
                await onAddRow()
                return "bottom"
              }
        }
      />
    </div>
  )
}
