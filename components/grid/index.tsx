import DataEditor, {
  DataEditorProps,
  DataEditorRef,
  GridCellKind,
  HeaderClickedEventArgs,
} from "@platools/glide-data-grid"

import { useSpaceAppStore } from "@/app/[database]/store"

import "@glideapps/glide-data-grid-cells/dist/index.css"
import "@platools/glide-data-grid/dist/index.css"
import React, { useEffect, useMemo, useRef } from "react"
import { useKeyPress, useSize } from "ahooks"
import { Plus } from "lucide-react"
import { useTheme } from "next-themes"

import { useSqlite } from "@/hooks/use-sqlite"
import { useTable } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { Button } from "../ui/button"
import { customCells } from "./cells"
import { FieldEditor } from "./fields"
import { headerIcons } from "./fields/header-icons"
import { ContextMenuDemo } from "./grid-context-menu"
import { useColumns } from "./hooks/use-col"
import { useDataSource } from "./hooks/use-data-source"
import { useDrop } from "./hooks/use-drop"
import { useHover } from "./hooks/use-hover"
import { useTableAppStore } from "./store"
import "./styles.css"
import { useAsyncData } from "./hooks/use-async-data"
import { darkTheme, lightTheme } from "./theme"

const defaultConfig: Partial<DataEditorProps> = {
  smoothScrollX: true,
  smoothScrollY: true,
  getCellsForSelection: true,
  width: "100%",
  rowHeight: 36,
  headerHeight: 36,
  freezeColumns: 1,
  rowMarkers: "clickable-visible" as any,
  trailingRowOptions: {
    tint: false,
    hint: "New",
    sticky: true,
  },
  // auto handle copy and paste
  onPaste: true,
  headerIcons: headerIcons,
  // experimental: {
  //   paddingBottom: 14,
  // },
}

interface IGridProps {
  tableName: string
  databaseName: string
}

export default function Grid(props: IGridProps) {
  const [showSearch, setShowSearch] = React.useState(false)
  const { tableName, databaseName } = props
  const { theme } = useTheme()
  const _theme = theme === "light" ? lightTheme : darkTheme
  const { setCurrentTableSchema } = useSpaceAppStore()
  const glideDataGridRef = useRef<DataEditorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { undo, redo } = useSqlite(databaseName)
  const size = useSize(containerRef)

  const {
    count,
    tableSchema,
    // deleteFieldByColIndex,
    // addField,
    deleteRows,
    getRowData,
    addRow,
    setCount,
  } = useTable(tableName, databaseName)
  const { toCell, onEdited } = useDataSource(tableName, databaseName)
  const { uiColumns, uiColumnMap } = useUiColumns(tableName, databaseName)
  const { onColumnResize, columns } = useColumns(uiColumns)

  const {
    getCellContent,
    onVisibleRegionChanged,
    onCellEdited,
    getCellsForSelection,
    handleAddRow,
    handleDelRows,
  } = useAsyncData<any>(
    50,
    5,
    getRowData,
    toCell,
    onEdited,
    glideDataGridRef,
    addRow,
    deleteRows,
    setCount
  )

  const { setIsAddFieldEditorOpen, selection, setSelection, clearSelection } =
    useTableAppStore()

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
  // data handle
  // TODO: refactor

  const { menu, setMenu } = useTableAppStore()

  const onHeaderClicked = React.useCallback(
    (col: number, e: HeaderClickedEventArgs) => {
      setMenu({
        col,
        bounds: e.bounds,
      })
      e.preventDefault()
    },
    [setMenu]
  )

  const { onItemHovered, getRowThemeOverride } = useHover({ theme })
  const { onDragLeave, onDrop, onDragOverCell, highlights } = useDrop({
    getCellContent: (cell) => {
      const [col, row] = cell
      const field = columns[col]
      const uiCol = uiColumnMap.get(field.title)
      return { kind: (uiCol?.type as any) ?? GridCellKind.Text }
    },
    setCellValue: (col, row, value) => onCellEdited?.([col, row], value),
  })

  return (
    <div className="h-full p-2" ref={containerRef}>
      <div className="relative flex h-full overflow-hidden rounded-md">
        <ContextMenuDemo deleteRows={handleDelRows}>
          {Boolean(uiColumns.length) && (
            <DataEditor
              {...config}
              getCellsForSelection={getCellsForSelection}
              onVisibleRegionChanged={onVisibleRegionChanged}
              customRenderers={customCells}
              ref={glideDataGridRef}
              theme={_theme}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragOverCell={onDragOverCell}
              highlightRegions={highlights}
              showSearch={showSearch}
              gridSelection={selection}
              onItemHovered={onItemHovered}
              // getRowThemeOverride={getRowThemeOverride}
              onHeaderClicked={onHeaderClicked}
              onHeaderContextMenu={onHeaderClicked}
              onGridSelectionChange={setSelection}
              onColumnResize={onColumnResize}
              getCellContent={getCellContent}
              maxColumnAutoWidth={500}
              maxColumnWidth={2000}
              fillHandle={true}
              columns={columns ?? []}
              rows={count}
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
              onRowAppended={handleAddRow}
            />
          )}
        </ContextMenuDemo>
        <FieldEditor tableName={tableName} databaseName={databaseName} />
      </div>
      <div id="portal" />
    </div>
  )
}
