import DataEditor, {
  DataEditorProps,
  DataEditorRef,
  EditableGridCell,
  GridCell,
  GridCellKind,
  HeaderClickedEventArgs,
  Item,
  Rectangle
} from "@glideapps/glide-data-grid"

import { useDatabaseAppStore } from "@/app/[database]/store"
import { columnsHandleMap } from "@/components/grid/helper"

import "@glideapps/glide-data-grid/dist/index.css"
import { useKeyPress, useSize } from "ahooks"
import { Plus } from "lucide-react"
import { useTheme } from "next-themes"
import React, { useCallback, useEffect, useMemo, useRef } from "react"
import "./styles.css"

import { useSqlite } from "@/hooks/use-sqlite"
import { useTable } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { Button } from "../ui/button"
import { FieldAppendPanel } from "./field-append-panel"
import { FieldEditorDropdown } from "./field-editor-dropdown"
import { ContextMenuDemo } from "./grid-context-menu"
import { useColumns } from "./hooks/use-col"
import { useDrop } from "./hooks/use-drop"
import { useHover } from "./hooks/use-hover"
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
  const { onColumnResize, columns } = useColumns(uiColumns)
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

  const { onItemHovered, getRowThemeOverride } = useHover({ theme })
  const { onDragLeave, onDrop, onDragOverCell, highlights } = useDrop({
    getCellContent: (cell) => {
      const [col, row] = cell
      const field = columns[col]
      const uiCol = uiColumnMap.get(field.title)
      return { kind: (uiCol?.type as any) ?? GridCellKind.Text }
    },
    setCellValue: updateCell,
  })

  return (
    <div className="h-full p-2" ref={containerRef}>
      <div className="flex h-full overflow-hidden rounded-md">
        <ContextMenuDemo deleteRows={deleteRows}>
          {Boolean(uiColumns.length) && (
            <DataEditor
              {...config}
              ref={glideDataGridRef}
              theme={_theme}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragOverCell={onDragOverCell}
              highlightRegions={highlights}
              showSearch={showSearch}
              gridSelection={selection}
              onItemHovered={onItemHovered}
              getRowThemeOverride={getRowThemeOverride}
              onHeaderClicked={onHeaderClicked}
              onGridSelectionChange={setSelection}
              onColumnResize={onColumnResize}
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
