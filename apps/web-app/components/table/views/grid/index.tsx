import type { IGridViewProperties, IView } from "@/packages/core/types/IView"
import DataEditor, {
  type DataEditorProps,
  type DataEditorRef,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
} from "@glideapps/glide-data-grid"

import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"

import "@glideapps/glide-data-grid/dist/index.css"
import React, {
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { useKeyPress, useSize } from "ahooks"
import { Plus } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

import { cn } from "@/lib/utils"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { TwinkleSparkle } from "../../../loading"
import { Button } from "../../../ui/button"
import { TableContext, useCurrentView } from "../../hooks"
import { useViewCount } from "../../hooks/use-view-count"
import { useTableSearchStore, useTableStore } from "../../table-store-provider"
import { customCells } from "./cells"
import { GridContextMenu } from "./grid-context-menu"
import { defaultConfig, getScrollbarWidth } from "./helper"
import { useAsyncData } from "./hooks/use-async-data"
import { useColumns } from "./hooks/use-col"
import { useDataSource } from "./hooks/use-data-source"
import { useDrop } from "./hooks/use-drop"
import { ROW_NUMBER_COL_WIDTH, useFreezeLine } from "./hooks/use-freeze-line"
import { useGridSearch } from "./hooks/use-grid-search"
import { useHighlightRow } from "./hooks/use-highlight-row"
import { useHover } from "./hooks/use-hover"
// import { FormulaEditor } from "./plugins/formula-editor"
import { useFormulaEditor } from "./plugins/use-formula-editor"
import "./styles.css"
import { useUndoRedo } from "./hooks/use-undo-redo"
import { useDynamicTheme } from "./theme"
import { useCurrentTheme } from "@/apps/web-app/hooks/use-current-theme"

// lazy import FormulaEditor
const FormulaEditor = lazy(() => import("./plugins/formula-editor"))

interface IGridProps {
  tableName: string
  databaseName: string
  view?: IView<IGridViewProperties>
  isEmbed?: boolean
  isEditable?: boolean
  className?: string
}

export default function GridView(props: IGridProps) {
  const { tableName, databaseName } = props
  const { resolvedTheme } = useTheme()
  const { css: spaceThemeCss } = useCurrentTheme()
  const _theme = useDynamicTheme(resolvedTheme, spaceThemeCss)
  const { setCurrentTableSchema } = useSpaceAppStore()
  const glideDataGridRef = useRef<DataEditorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // const { undo, redo } = useSqlite(databaseName)
  const size = useSize(containerRef)
  const [aiHighlightRegions, setAIHighlightRegions] = React.useState<
    DataEditorProps["highlightRegions"]
  >([])

  const formulaEditorRef = useRef<HTMLDivElement>(null)
  const r = containerRef.current?.querySelector(".dvn-scroll-inner")
  const hasScroll = r && r?.scrollWidth > r?.clientWidth

  const { currentView: _currentView } = useCurrentView<IGridViewProperties>()
  const currentView = props.view || _currentView
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
  const getColumnIndexByColumnName = useCallback(
    (columnName: string) => {
      return (
        showColumns.findIndex((c) => c.table_column_name === columnName) + 1
      )
    },
    [showColumns]
  )
  const { isReadOnly } = useContext(TableContext)

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

  const {
    gridSelection,
    onCellEdited: onCellEditedUndoRedo,
    onGridSelectionChange,
    undo,
    canRedo,
    canUndo,
    redo,
    reset,
  } = useUndoRedo(glideDataGridRef, getCellContent, onCellEdited!)

  const { customHighlightRegions, setCustomHighlightRegions } = useHighlightRow(
    tableName,
    getIndexByRowId,
    showColumns
  )

  // Reset undo/redo stack when view changes
  useEffect(() => {
    reset()
  }, [currentView?.id, reset])

  const { setIsAddFieldEditorOpen, selection, setSelection, clearSelection } =
    useTableStore()

  const onSelectionChange = useCallback(
    (selection: GridSelection) => {
      setSelection(selection)
      onGridSelectionChange?.(selection)
    },
    [setSelection, onGridSelectionChange]
  )

  // Get search state from context
  const { searchQuery, showSearch } = useTableSearchStore()
  const { formattedSearchResults, currentCell } = useGridSearch(
    showColumns,
    getColumnIndexByColumnName
  )

  const {
    onCellActivated,
    showEditor,
    editorRef,
    closeEditor,
    formulaField,
    rowIndex,
    refreshEditorPosition,
  } = useFormulaEditor(
    showColumns,
    glideDataGridRef,
    formulaEditorRef,
    selection
  )

  useEffect(() => {
    if (showEditor) {
      refreshEditorPosition()
    }
  }, [size])

  const rowId = useMemo(() => {
    const row = rowIndex ? getRowByIndex(rowIndex) : null
    return row?._id
  }, [rowIndex, getRowByIndex])

  // Add state for search highlight
  const [searchHighlightRegion, setSearchHighlightRegion] = React.useState<
    DataEditorProps["highlightRegions"]
  >([])

  // when show search is false, clear search highlight
  useEffect(() => {
    if (!showSearch) {
      setSearchHighlightRegion([])
    }
  }, [showSearch])
  // Update the onSearchResultsChanged function
  const onSearchResultsChanged = useCallback((result: Item) => {
    if (result) {
      setTimeout(() => {
        if (glideDataGridRef.current) {
          const col = result[0] - 1
          const row = result[1]
          glideDataGridRef.current.scrollTo(col, row)
          setTimeout(() => {
            setSearchHighlightRegion([
              {
                color: "rgba(255, 255, 0, 0.3)",
                range: {
                  x: result[0] - 1,
                  y: result[1],
                  width: 1,
                  height: 1,
                },
              },
            ])
          }, 50)
        }
      }, 0)
    }
  }, [])

  useEffect(() => {
    if (showSearch && currentCell) {
      onSearchResultsChanged(currentCell)
    }
  }, [showSearch, searchQuery, currentCell, onSearchResultsChanged])

  // Use the hook to get the highlight regions:

  useEffect(() => {
    const bounds = glideDataGridRef.current?.getBounds(
      selection.current?.cell[0],
      selection.current?.cell[1]
    )
  }, [selection])

  const rowMarkersWidth = props.isEmbed ? 0 : ROW_NUMBER_COL_WIDTH
  // Use the new hook
  const {
    freezeHandleRef,
    freezeHandleLeft,
    freezeColumns,
    handleMouseDown,
    isDragging,
    previewLinePosition,
  } = useFreezeLine({
    currentView,
    columns, // Pass the columns array from useColumns
    gridRef: containerRef,
    rowMarkersWidth,
  })

  // Re-introduce the config calculation using freezeColumns from the hook
  const config = useMemo(() => {
    let conf = {
      ...defaultConfig,
      freezeColumns: freezeColumns, // Use freezeColumns state from the hook
      ...{
        rowMarkers: {
          kind: props.isEmbed ? "none" : "both",
          width: rowMarkersWidth,
        } as DataEditorProps["rowMarkers"],
      },
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
  }, [freezeColumns, hasScroll, rowMarkersWidth])

  useEffect(() => {
    tableSchema && setCurrentTableSchema(tableSchema)
  }, [setCurrentTableSchema, tableSchema])

  useEffect(() => {
    clearSelection()
  }, [tableName, databaseName, clearSelection])
  const { menu, setMenu } = useTableStore()

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

  const { onItemHovered, getRowThemeOverride } = useHover({
    theme: _theme.name,
  })
  const { onDragLeave, onDrop, onDragOverCell, highlights } = useDrop({
    getCellContent,
    setCellValue: (col, row, value) => onCellEdited?.([col, row], value),
  })

  const highlightRegions = useMemo(() => {
    return [
      ...(highlights ?? []),
      ...(aiHighlightRegions ?? []),
      ...(customHighlightRegions ?? []),
      ...(searchHighlightRegion ?? []),
    ]
  }, [
    highlights,
    aiHighlightRegions,
    customHighlightRegions,
    searchHighlightRegion,
  ])

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

  // useKeyPress(["ctrl.f", "meta.f"], (e) => {

  // handle undo redo
  useKeyPress(["ctrl.z", "meta.z"], (e) => {
    e.preventDefault()
    if (e.shiftKey) {
      redo()
    } else {
      undo()
    }
  })

  if (!columns || columns.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-center h-full w-full"></div>
      </div>
    )
  }
  return (
    <div
      className={cn("h-full w-full pt-0", props.className)}
      ref={containerRef}
    >
      <div
        className={cn("relative flex h-full w-full overflow-hidden rounded-md")}
      >
        {/* Static Freeze Column Line - Uses values from hook */}
        {columns && columns.length > 0 && freezeHandleLeft > 0 && (
          <div
            ref={freezeHandleRef}
            className="absolute top-0 bottom-0 z-10 w-[2px] cursor-col-resize hover:bg-primary pointer-events-auto"
            style={{ left: `${freezeHandleLeft}px` }}
            onMouseDown={handleMouseDown}
          />
        )}
        {/* Drag Preview Line */}
        {isDragging && previewLinePosition !== null && (
          <div
            className="absolute top-0 bottom-0 z-10 w-[2px] bg-primary/70 pointer-events-none"
            style={{ left: `${previewLinePosition}px` }}
          />
        )}
        <GridContextMenu
          handleDelRows={handleDelRows}
          getRowByIndex={getRowByIndex}
          getFieldByIndex={getFieldByIndex}
        >
          {Boolean(uiColumns.length) && (
            <DataEditor
              {...config}
              rowMarkerWidth={ROW_NUMBER_COL_WIDTH}
              searchResults={formattedSearchResults}
              getCellsForSelection={getCellsForSelection}
              onVisibleRegionChanged={onVisibleRegionChanged}
              customRenderers={customCells}
              ref={glideDataGridRef}
              theme={_theme}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragOverCell={onDragOverCell}
              highlightRegions={highlightRegions}
              gridSelection={gridSelection || selection}
              onItemHovered={onItemHovered}
              onHeaderClicked={onHeaderClicked}
              onHeaderContextMenu={onHeaderClicked}
              onGridSelectionChange={onSelectionChange}
              onColumnResize={onColumnResize}
              onColumnMoved={onColumnMoved}
              getCellContent={getCellContent}
              maxColumnWidth={2000}
              fillHandle={true}
              columns={columns ?? []}
              rows={viewCount}
              rightElement={
                !isReadOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "flex w-full justify-start rounded-none",
                      `h-[${defaultConfig.headerHeight}px]`
                    )}
                    onClick={() => {
                      setIsAddFieldEditorOpen(true)
                    }}
                  >
                    <Plus size={16} />
                  </Button>
                )
              }
              rightElementProps={{
                fill: true,
              }}
              onCellEdited={onCellEditedUndoRedo}
              onCellsEdited={onCellsEdited}
              onCellActivated={onCellActivated}
              onRowAppended={isReadOnly ? undefined : handleAddRow}
            />
          )}
        </GridContextMenu>
        <div className=" fixed"></div>
        {showAILoading && (
          <div style={positionStyle} className="fixed">
            <TwinkleSparkle />
          </div>
        )}
        <div ref={formulaEditorRef} className="fixed">
          {showEditor && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-4">
                  Loading Formula Editor...
                </div>
              }
            >
              <FormulaEditor
                editorRef={editorRef}
                closeEditor={closeEditor}
                formulaField={formulaField}
                uiColumns={uiColumns}
                rowId={rowId}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}
