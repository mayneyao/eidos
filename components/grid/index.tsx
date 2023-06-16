import DataEditor, {
  DataEditorProps,
  DataEditorRef,
  EditableGridCell,
  GridCell,
  GridCellKind,
  GridColumn,
  GridMouseEventArgs,
  HeaderClickedEventArgs,
  Item,
  Rectangle,
} from "@glideapps/glide-data-grid"

import { columnsHandleMap, getColumns } from "@/components/grid/helper"
import { useDatabaseAppStore } from "@/app/[database]/store"

import "./styles.css"
import "@glideapps/glide-data-grid/dist/index.css"
import React, { useCallback, useEffect, useMemo, useRef } from "react"
import { GetRowThemeCallback } from "@glideapps/glide-data-grid/dist/ts/data-grid/data-grid-render"
import { useKeyPress, useSize } from "ahooks"
import { Plus } from "lucide-react"
import { useTheme } from "next-themes"

import { useSqlite } from "@/hooks/use-sqlite"
import { useTable } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { Button } from "../ui/button"
import { FieldAppendPanel } from "./field-append-panel"
import { FieldEditorDropdown } from "./field-editor-dropdown"
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
    sticky: true,
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
    tableSchema,
    updateCell,
    deleteFieldByColIndex,
    addField,
    addRow,
    deleteRows,
  } = useTable(tableName, databaseName)

  const { uiColumns, uiColumnMap } = useUiColumns(tableName, databaseName)
  const {
    isAddFieldEditorOpen,
    setIsAddFieldEditorOpen,
    selection,
    setSelection,
    clearSelection,
  } = useTableAppStore()

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

  const hasResized = React.useRef(new Set<number>())
  const [columns, setColumns] = React.useState<GridColumn[]>([])

  useEffect(() => {
    setColumns(getColumns(uiColumns))
  }, [uiColumns])

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
      const emptyCell: GridCell = {
        kind: GridCellKind.Text,
        data: content,
        displayData: `${content}`,
        allowOverlay: true,
      }
      if (!field) {
        return emptyCell
      }
      const uiCol = uiColumnMap.get(field.title)
      if (!uiCol) {
        return emptyCell
      }
      const colHandle = columnsHandleMap[uiCol.type]
      return colHandle.getContent(content)
    },
    [data, columns, uiColumnMap]
  )

  // event handle
  const onCellEdited = React.useCallback(
    async (cell: Item, newValue: EditableGridCell) => {
      updateCell(cell[0], cell[1], newValue.data)
    },
    [updateCell]
  )

  const [menu, setMenu] = React.useState<{
    col: number
    bounds: Rectangle
  }>()

  const onHeaderClicked = React.useCallback(
    (col: number, e: HeaderClickedEventArgs) => {
      setMenu({
        col,
        bounds: e.bounds,
      })
    },
    []
  )

  return (
    <div className="h-full p-2" ref={containerRef}>
      <div className="flex h-full overflow-hidden rounded-md">
        <ContextMenuDemo deleteRows={deleteRows}>
          {Boolean(uiColumns.length) && (
            <DataEditor
              {...config}
              ref={glideDataGridRef}
              theme={_theme}
              showSearch={showSearch}
              gridSelection={selection}
              onItemHovered={onItemHovered}
              getRowThemeOverride={getRowThemeOverride}
              onHeaderClicked={onHeaderClicked}
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
                  }}
                >
                  <Plus size={16} />
                </Button>
              }
              rightElementProps={{
                sticky: true,
                fill: false,
              }}
              onCellEdited={onCellEdited}
              onRowAppended={() => {
                addRow()
              }}
            />
          )}
        </ContextMenuDemo>
        {isAddFieldEditorOpen && (
          <FieldAppendPanel addField={addField} uiColumns={uiColumns} />
        )}
        <FieldEditorDropdown
          menu={menu}
          setMenu={setMenu}
          deleteFieldByColIndex={deleteFieldByColIndex}
        />
      </div>
      <div id="portal" />
    </div>
  )
}
