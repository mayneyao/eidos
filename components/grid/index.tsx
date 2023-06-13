import DataEditor, {
  DataEditorProps,
  DataEditorRef,
  EditableGridCell,
  GridCell,
  GridCellKind,
  GridColumn,
  GridMouseEventArgs,
  Item,
} from "@glideapps/glide-data-grid"

import { cn } from "@/lib/utils"
import { tableInterface2GridColumn } from "@/components/grid/helper"
import { useDatabaseAppStore } from "@/app/[database]/store"

import "@glideapps/glide-data-grid/dist/index.css"
import React, { useCallback, useEffect, useMemo, useRef } from "react"
import { GetRowThemeCallback } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-render"
import { useClickAway, useKeyPress, useSize } from "ahooks"
import { Plus } from "lucide-react"
import { useTheme } from "next-themes"

import { useSqlite } from "@/hooks/use-sqlite"
import { useTable } from "@/hooks/use-table"

import { Button } from "../ui/button"
import { FieldAppendPanel } from "./field-append-panel"
import { ContextMenuDemo } from "./grid-context-menu"
import { useTableAppStore } from "./store"
import { darkTheme } from "./theme"

const defaultConfig: Partial<DataEditorProps> = {
  smoothScrollX: true,
  smoothScrollY: true,
  getCellsForSelection: true,
  width: "100%",
  freezeColumns: 1,
  rowMarkers: "clickable-visible" as any,
  trailingRowOptions: {
    tint: true,
    hint: "New",
  },
  // auto handle copy and paste
  onPaste: true,
  // experimental: {
  //   paddingBottom: 300
  // }
}

const oddRowOrHoverRowThemeOverride = (isDarkMode: boolean) => {
  if (isDarkMode) {
    return {
      bgCell: "#2d2d2d",
      bgCellMedium: "#3a3a3a",
    }
  }
  return {
    bgCell: "#f7f7f7",
    bgCellMedium: "#f0f0f0",
  }
}

interface IGridProps {
  tableName: string
  databaseName: string
}

export default function Grid(props: IGridProps) {
  const [showSearch, setShowSearch] = React.useState(false)
  const { tableName, databaseName } = props
  const { theme } = useTheme()
  const _theme = theme === "light" ? {} : darkTheme
  const { setCurrentTableSchema } = useDatabaseAppStore()
  const glideDataGridRef = useRef<DataEditorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { undo, redo } = useSqlite(databaseName)
  const size = useSize(containerRef)

  const {
    data,
    schema,
    tableSchema,
    updateCell,
    addField,
    addRow,
    deleteRows,
  } = useTable(tableName, databaseName)
  const {
    isAddFieldEditorOpen,
    setIsAddFieldEditorOpen,
    selection,
    setSelection,
    clearSelection,
  } = useTableAppStore()
  const ref = useRef<HTMLDivElement>(null)

  // handle undo redo
  useKeyPress("ctrl.z", (e) => {
    e.preventDefault()
    if (e.shiftKey) {
      redo()
    } else {
      undo()
    }
  })

  const isSm = size?.width ?? 0 < 768
  const freezeColumns = isSm ? 0 : 1

  const config = useMemo(() => {
    return {
      ...defaultConfig,
      freezeColumns,
    }
  }, [freezeColumns])

  // handle column width
  const _columns = useMemo(() => {
    return tableInterface2GridColumn(schema[0])
  }, [schema])

  const hasResized = React.useRef(new Set<number>())
  const [columns, setColumns] = React.useState<GridColumn[]>(_columns)
  useEffect(() => {
    setColumns(_columns)
  }, [_columns])

  const onColumnResize = React.useCallback(
    (column: GridColumn, newSize: number) => {
      const index = columns.findIndex((ci) => ci.title === column.title)
      const newColumns = [...columns]
      newColumns.splice(index, 1, {
        ...columns[index],
        width: newSize,
      })
      // const _newColumns = newColumns.map((x, i) => ({ ...x, grow: hasResized.current.has(i) ? undefined : (5 + i) / 5 }));
      setColumns(newColumns)
    },
    [columns]
  )

  // effect
  useClickAway(() => {
    isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
  }, ref)

  useEffect(() => {
    tableSchema && setCurrentTableSchema(tableSchema)
  }, [setCurrentTableSchema, tableSchema])

  useKeyPress("ctrl.f", (e) => {
    e.preventDefault()
    setShowSearch(!showSearch)
  })

  useEffect(() => {
    clearSelection()
  }, [tableName, databaseName, clearSelection])

  // hover row style modification
  const [hoverRow, setHoverRow] = React.useState<number | undefined>(undefined)
  const onItemHovered = React.useCallback((args: GridMouseEventArgs) => {
    const [_, row] = args.location
    setHoverRow(args.kind !== "cell" ? undefined : row)
  }, [])

  const getRowThemeOverride = React.useCallback<GetRowThemeCallback>(
    (row) => {
      const isDarkMode = theme === "dark"
      const isOddRow = row % 2 === 1
      if (isOddRow) return oddRowOrHoverRowThemeOverride(isDarkMode)
      if (row !== hoverRow) return undefined
      return oddRowOrHoverRowThemeOverride(isDarkMode)
    },
    [hoverRow, theme]
  )

  // data handle
  const getData = useCallback(
    (cell: Item): GridCell => {
      const [columnIndex, rowIndex] = cell
      const content = data[rowIndex]?.[columnIndex] ?? ""
      const field = columns[columnIndex]
      let readonly = false
      if (field.title === "_id") {
        readonly = true
      }
      return {
        kind: GridCellKind.Text,
        allowOverlay: true,
        readonly,
        displayData: `${content}`,
        data: `${content}`,
      }
    },
    [data, columns]
  )

  // event handle
  const onCellEdited = React.useCallback(
    async (cell: Item, newValue: EditableGridCell) => {
      if (newValue.kind !== GridCellKind.Text) {
        // we only have text cells, might as well just die here.
        return
      }
      if (!columns) return
      updateCell(cell[0], cell[1], newValue.data)
    },
    [columns, updateCell]
  )

  return (
    <div className="h-full p-2" ref={containerRef}>
      <div className="flex h-full overflow-hidden rounded-md">
        <ContextMenuDemo deleteRows={deleteRows}>
          <DataEditor
            {...config}
            ref={glideDataGridRef}
            theme={_theme}
            showSearch={showSearch}
            gridSelection={selection}
            onItemHovered={onItemHovered}
            getRowThemeOverride={getRowThemeOverride}
            onGridSelectionChange={setSelection}
            onColumnResize={(col, _newSize, colIndex, newSizeWithGrow) => {
              hasResized.current.add(colIndex)
              onColumnResize(col, newSizeWithGrow)
            }}
            getCellContent={getData}
            maxColumnAutoWidth={500}
            maxColumnWidth={2000}
            fillHandle={true}
            columns={columns ?? []}
            rows={data.length}
            rightElement={
              <Button
                variant="ghost"
                onClick={() => {
                  setIsAddFieldEditorOpen(true)
                  addField(`newField${columns.length + 1}`, "text")
                }}
              >
                <Plus size={16} />
              </Button>
            }
            rightElementProps={{
              sticky: true,
              fill: true,
            }}
            onCellEdited={onCellEdited}
            onRowAppended={() => {
              addRow()
            }}
          />
        </ContextMenuDemo>
        {isAddFieldEditorOpen && (
          <div
            ref={ref}
            className={cn(
              "fixed right-0 z-50 h-screen w-[400px] bg-white shadow-lg"
            )}
          >
            <FieldAppendPanel />
          </div>
        )}
      </div>
      <div id="portal" />
    </div>
  )
}
