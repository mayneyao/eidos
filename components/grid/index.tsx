import DataEditor, {
  DataEditorProps,
  DataEditorRef,
  HeaderClickedEventArgs,
} from "@glideapps/glide-data-grid"

import { useSpaceAppStore } from "@/app/[database]/store"

import "@glideapps/glide-data-grid/dist/index.css"
import React, { useEffect, useMemo, useRef } from "react"
import { useKeyPress, useSize } from "ahooks"
import { Plus } from "lucide-react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { useTable } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { Button } from "../ui/button"
import { customCells } from "./cells"
import { FieldEditor } from "./fields"
import { headerIcons } from "./fields/header-icons"
import { GridContextMenu } from "./grid-context-menu"
import { useColumns } from "./hooks/use-col"
import { useDataSource } from "./hooks/use-data-source"
import { useDrop } from "./hooks/use-drop"
import { useHover } from "./hooks/use-hover"
import { useTableAppStore } from "./store"
import "./styles.css"
import { IGridViewProperties, IView } from "@/lib/store/IView"

import { useCurrentView } from "../table/hooks"
import { useViewCount } from "../table/hooks/use-view-count"
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
  rowMarkers: "both",
  trailingRowOptions: {
    tint: false,
    hint: "New",
    sticky: true,
  },
  // auto handle copy and paste
  onPaste: true,
  headerIcons: headerIcons,
  experimental: {
    paddingBottom: 14,
    kineticScrollPerfHack: true,
  },
}

interface IGridProps {
  tableName: string
  databaseName: string
  view?: IView<IGridViewProperties>
  isEmbed?: boolean
  className?: string
}

export default function GridView(props: IGridProps) {
  const [showSearch, setShowSearch] = React.useState(false)
  const { tableName, databaseName } = props
  const { theme } = useTheme()
  const _theme = theme === "light" ? lightTheme : darkTheme
  const { setCurrentTableSchema } = useSpaceAppStore()
  const glideDataGridRef = useRef<DataEditorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { undo, redo } = useSqlite(databaseName)
  const size = useSize(containerRef)

  const { currentView } = useCurrentView()
  const { count: viewCount } = useViewCount(currentView)
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
  const { uiColumns, uiColumnMap, getFieldByIndex } = useUiColumns(
    tableName,
    databaseName
  )
  const { onColumnResize, columns } = useColumns(uiColumns, props.view!)

  const {
    getCellContent,
    onVisibleRegionChanged,
    onCellEdited,
    getCellsForSelection,
    handleAddRow,
    handleDelRows,
    getRowByIndex,
  } = useAsyncData<any>(
    tableName,
    50,
    5,
    getRowData,
    toCell,
    onEdited,
    glideDataGridRef,
    addRow,
    deleteRows,
    setCount,
    props.view?.query
  )

  const { setIsAddFieldEditorOpen, selection, setSelection, clearSelection } =
    useTableAppStore()

  // handle undo redo
  useKeyPress(["ctrl.z", "meta.z"], (e) => {
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
    const _config = props.isEmbed
      ? {
          // height: "100%",
          experimental: {
            paddingBottom: 0,
          },
        }
      : {}
    return {
      ...defaultConfig,
      freezeColumns,
      ..._config,
    }
  }, [freezeColumns, props.isEmbed])

  useEffect(() => {
    tableSchema && setCurrentTableSchema(tableSchema)
  }, [setCurrentTableSchema, tableSchema])

  useKeyPress(["ctrl.f", "meta.f"], (e) => {
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
    getCellContent,
    setCellValue: (col, row, value) => onCellEdited?.([col, row], value),
  })

  return (
    <div
      className={cn("mb-2 h-full w-full p-2 pb-7", props.className)}
      ref={containerRef}
    >
      <div className="relative flex h-full overflow-hidden rounded-md border-t">
        <GridContextMenu
          deleteRows={handleDelRows}
          getRowByIndex={getRowByIndex}
          getFieldByIndex={getFieldByIndex}
        >
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
              // maxColumnAutoWidth={500}
              maxColumnWidth={2000}
              fillHandle={true}
              columns={columns ?? []}
              rows={viewCount}
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
        </GridContextMenu>
        <FieldEditor tableName={tableName} databaseName={databaseName} />
      </div>
      <div id="portal" />
    </div>
  )
}
