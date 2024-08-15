import DataEditor, {
  DataEditorProps,
  DataEditorRef,
  HeaderClickedEventArgs,
} from "@glideapps/glide-data-grid"

import { useSpaceAppStore } from "@/apps/web-app/[database]/store"

import "@glideapps/glide-data-grid/dist/index.css"
import React, { useCallback, useEffect, useMemo, useRef } from "react"
import { useKeyPress, useSize } from "ahooks"
import { Plus } from "lucide-react"
import { useTheme } from "next-themes"

import { IGridViewProperties, IView } from "@/lib/store/IView"
import { cn, getRawTableNameById } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { useTableOperation } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { Button } from "../../../ui/button"
import { useCurrentView } from "../../hooks"
import { useViewCount } from "../../hooks/use-view-count"
import { AITools } from "./ai-tools"
import { customCells } from "./cells"
import { headerIcons } from "./fields/header-icons"
import { GridContextMenu } from "./grid-context-menu"
import { useAsyncData } from "./hooks/use-async-data"
import { useColumns } from "./hooks/use-col"
import { useDataSource } from "./hooks/use-data-source"
import { useDrop } from "./hooks/use-drop"
import { useHover } from "./hooks/use-hover"
import { useTableAppStore } from "./store"
import "./styles.css"
import { MsgType } from "@/lib/const"
import { getWorker } from "@/lib/sqlite/worker"

import { TwinkleSparkle } from "../../../loading"
import { getScrollbarWidth } from "./helper"
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
    kineticScrollPerfHack: true,
  },
}

interface IGridProps {
  tableName: string
  databaseName: string
  view?: IView<IGridViewProperties>
  isEmbed?: boolean
  isEditable?: boolean
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
  const aiContainerRef = useRef<HTMLDivElement>(null)
  const [aiHighlightRegions, setAIHighlightRegions] = React.useState<
    DataEditorProps["highlightRegions"]
  >([])

  const [customHighlightRegions, setCustomHighlightRegions] = React.useState<
    DataEditorProps["highlightRegions"]
  >([])

  const r = containerRef.current?.querySelector(".dvn-scroll-inner")
  const hasScroll = r && r?.scrollWidth > r?.clientWidth

  const { currentView } = useCurrentView({
    space: databaseName,
    tableName,
    viewId: props.view?.id,
  })
  const { count: viewCount } = useViewCount(currentView)
  const { tableSchema, getRowData, getRowDataById } = useTableOperation(
    tableName,
    databaseName
  )
  const { toCell } = useDataSource(tableName, databaseName)
  const { uiColumns } = useUiColumns(tableName, databaseName)
  const { onColumnResize, columns, showColumns, onColumnMoved } = useColumns(
    uiColumns,
    currentView
  )

  const getFieldByIndex = useCallback(
    (index: number) => {
      return showColumns[index]
    },
    [showColumns]
  )

  const {
    getCellContent,
    onVisibleRegionChanged,
    onCellEdited,
    onCellsEdited,
    getCellsForSelection,
    handleAddRow,
    handleDelRows,
    getRowByIndex,
    getIndexByRowId,
  } = useAsyncData<any>({
    tableName,
    pageSize: 100,
    maxConcurrency: 5,
    getRowData,
    getRowDataById,
    toCell,
    gridRef: glideDataGridRef,
    viewCount,
    view: currentView,
  })

  const { setIsAddFieldEditorOpen, selection, setSelection, clearSelection } =
    useTableAppStore()
  const [isAItoolsOpen, setIsAItoolsOpen] = React.useState(false)

  useEffect(() => {
    const worker = getWorker()
    function subscribeHighlightRow(e: MessageEvent<any>) {
      const { type, payload } = e.data
      if (type === MsgType.HighlightRow) {
        const { tableId, rowId, fieldName } = payload
        if (tableName !== getRawTableNameById(tableId)) return
        const index = getIndexByRowId(rowId)
        // highlight row
        if (fieldName) {
          const colIndex = showColumns.findIndex((c) => c.name === fieldName)
          if (colIndex > -1) {
            setCustomHighlightRegions([
              {
                color: "rgba(0, 0, 255, 0.1)",
                range: { x: colIndex, y: index, width: 1, height: 1 },
              },
            ])
          }
        } else {
          setCustomHighlightRegions([
            {
              color: "rgba(0, 0, 255, 0.1)",
              range: { x: 0, y: index, width: showColumns.length, height: 1 },
            },
          ])
        }
      }
    }
    worker.addEventListener("message", subscribeHighlightRow)
    return () => worker.removeEventListener("message", subscribeHighlightRow)
  }, [getIndexByRowId, showColumns, tableName])

  useEffect(() => {
    if (!selection.current) {
      closeAItools()
    }
    const bounds = glideDataGridRef.current?.getBounds(
      selection.current?.cell[0],
      selection.current?.cell[1]
    )
    if (aiContainerRef.current && bounds) {
      aiContainerRef.current.style.left = `${bounds.x + bounds.width}px`
      aiContainerRef.current.style.top = `${bounds.y}px`
    }
  }, [selection])

  const isSm = size?.width ?? 0 < 768
  const freezeColumns = isSm ? 0 : 1

  const config = useMemo(() => {
    let conf = {
      ...defaultConfig,
      freezeColumns,
    }
    const sw = getScrollbarWidth()
    if (!hasScroll) {
      conf = {
        ...conf,
        experimental: {
          ...conf.experimental,
          scrollbarWidthOverride: sw,
          paddingBottom: sw || 0,
        },
      }
    }
    return conf
  }, [freezeColumns, hasScroll])

  useEffect(() => {
    tableSchema && setCurrentTableSchema(tableSchema)
  }, [setCurrentTableSchema, tableSchema])

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

  const closeAItools = () => {
    setIsAItoolsOpen(false)
    glideDataGridRef.current?.focus()
  }
  const highlightRegions = useMemo(() => {
    return [
      ...(highlights ?? []),
      ...(aiHighlightRegions ?? []),
      ...(customHighlightRegions ?? []),
    ]
  }, [highlights, aiHighlightRegions, customHighlightRegions])

  const { showAILoading, positionStyle } = useMemo(() => {
    if (aiHighlightRegions?.length) {
      const bounds = glideDataGridRef.current?.getBounds(
        aiHighlightRegions[0].range.x,
        aiHighlightRegions[0].range.y
      )
      if (bounds) {
        return {
          showAILoading: true,
          positionStyle: {
            left: bounds.x + bounds.width - 30,
            top: bounds.y + 4,
          },
        }
      }
    }
    return {
      showAILoading: false,
      positionStyle: {},
    }
  }, [aiHighlightRegions])

  useKeyPress(["ctrl.f", "meta.f"], (e) => {
    e.preventDefault()
    setShowSearch(!showSearch)
  })

  useKeyPress("alt.i", (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAItoolsOpen((prev) => !prev)
  })

  // handle undo redo
  useKeyPress(["ctrl.z", "meta.z"], (e) => {
    e.preventDefault()
    if (e.shiftKey) {
      redo()
    } else {
      undo()
    }
  })

  return (
    <div
      className={cn("h-full w-full p-2 pt-0", props.className)}
      ref={containerRef}
    >
      <div
        className={cn(
          "flex h-full w-full overflow-hidden rounded-md border-t",
          {
            "pb-8": !props.isEmbed,
          }
        )}
      >
        <GridContextMenu
          handleDelRows={handleDelRows}
          getRowByIndex={getRowByIndex}
          getFieldByIndex={getFieldByIndex}
          openAItools={() => setIsAItoolsOpen(true)}
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
              highlightRegions={highlightRegions}
              // showSearch={showSearch}
              gridSelection={selection}
              onItemHovered={onItemHovered}
              // getRowThemeOverride={getRowThemeOverride}
              onHeaderClicked={onHeaderClicked}
              onHeaderContextMenu={onHeaderClicked}
              onGridSelectionChange={setSelection}
              onColumnResize={onColumnResize}
              onColumnMoved={onColumnMoved}
              getCellContent={getCellContent}
              // maxColumnAutoWidth={500}
              maxColumnWidth={2000}
              fillHandle={true}
              columns={columns ?? []}
              rows={viewCount}
              rightElement={
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex w-full justify-start rounded-none"
                  onClick={() => {
                    setIsAddFieldEditorOpen(true)
                  }}
                >
                  <Plus size={16} />
                </Button>
              }
              rightElementProps={{
                // sticky: true,
                fill: true,
              }}
              onCellEdited={onCellEdited}
              onCellsEdited={onCellsEdited}
              onRowAppended={handleAddRow}
            />
          )}
        </GridContextMenu>
        <div ref={aiContainerRef} className=" fixed">
          {isAItoolsOpen && (
            <AITools
              close={closeAItools}
              fields={showColumns}
              getRowByIndex={getRowByIndex}
              getFieldByIndex={getFieldByIndex}
              selection={selection}
              setAIHighlightRegions={setAIHighlightRegions}
            />
          )}
        </div>
        {showAILoading && (
          <div style={positionStyle} className="fixed">
            <TwinkleSparkle />
          </div>
        )}
      </div>
    </div>
  )
}
