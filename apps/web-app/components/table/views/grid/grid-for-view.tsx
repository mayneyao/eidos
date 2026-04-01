import type { IGridViewProperties, IView } from "@/packages/core/types/IView"
import DataEditor, {
  type DataEditorProps,
  type DataEditorRef,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid"

import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"

import "@glideapps/glide-data-grid/dist/index.css"
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/theme-provider"

import { cn } from "@/lib/utils"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { TableContext, useCurrentView } from "../../hooks"
import { useViewCount } from "../../hooks/use-view-count"
import { useTableSearchStore, useTableStore } from "../../table-store-provider"
import { customCells } from "./cells"
import { defaultConfig, getScrollbarWidth } from "./helper"
import { useAsyncDataForView } from "./hooks/use-async-data-for-view"
import { useColumns } from "./hooks/use-col"
import { useDataSource } from "./hooks/use-data-source"
import { useDrop } from "./hooks/use-drop"
import { ROW_NUMBER_COL_WIDTH, useFreezeLine } from "./hooks/use-freeze-line"
import { useGridSearch } from "./hooks/use-grid-search"
import { useHighlightRow } from "./hooks/use-highlight-row"
import { useHover } from "./hooks/use-hover"
import "./styles.css"
import { useDynamicTheme } from "./theme"
import { useCurrentTheme } from "@/hooks/use-current-theme"

import { useGridStats } from "./hooks/use-grid-stats"
import { calculatePaddingSpaces } from "@/lib/text-width"
import type { GridColumn } from "@glideapps/glide-data-grid"

interface IGridProps {
  tableName: string
  databaseName: string
  view?: IView<IGridViewProperties>
  isEmbed?: boolean
  isEditable?: boolean
  isPreview?: boolean
  className?: string
}

export function GridViewForView(props: IGridProps) {
  const { tableName, databaseName } = props
  const { resolvedTheme } = useTheme()
  const { css: spaceThemeCss } = useCurrentTheme()
  const _theme = useDynamicTheme(resolvedTheme, spaceThemeCss)
  const { setCurrentTableSchema } = useSpaceAppStore()
  const glideDataGridRef = useRef<DataEditorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const aiContainerRef = useRef<HTMLDivElement>(null)
  const [aiHighlightRegions, setAIHighlightRegions] = React.useState<
    DataEditorProps["highlightRegions"]
  >([])

  const r = containerRef.current?.querySelector(".dvn-scroll-inner")
  const hasScroll = r && r?.scrollWidth > r?.clientWidth

  // Bottom stats bar scroll sync state
  const [scrollLeft, setScrollLeft] = React.useState(0)

  const { currentView: _currentView } = useCurrentView<IGridViewProperties>()
  const currentView = props.view || _currentView

  const { count: viewCount } = useViewCount(currentView)
  const { tableSchema, getRowData, getRowDataById } = useTableOperation(
    tableName,
    databaseName
  )
  const { toCell } = useDataSource(tableName, databaseName)
  const { uiColumns } = useUiColumns(tableName, databaseName)
  const {
    onColumnResize,
    columns: _columns,
    showColumns,
    onColumnMoved,
  } = useColumns(uiColumns, currentView)
  const { t } = useTranslation()

  // Use stats hook
  const { statsResults, refreshAllStats, refreshColumnStat } = useGridStats({
    tableName,
    view: currentView,
    columns: showColumns,
    viewCount,
  })

  // Add trailingRowOptions.hint to columns to display stats (with right-aligned spaces)
  const columns = useMemo(() => {
    return _columns.map((col, index) => {
      const field = showColumns[index]
      if (!field) return col

      const stat = statsResults[field.table_column_name]
      if (!stat?.displayText) {
        return { ...col, trailingRowOptions: { hint: "", addIcon: "" } }
      }

      // Get stat type label and combine with value
      const statTypeLabel = t(`table.columnStats.${stat.type}`)
      const fullText = `${statTypeLabel}: ${stat.displayText}`

      // Use Canvas to precisely calculate text width for right alignment
      const colWidth = (col as GridColumn & { width?: number }).width || 200
      const availableWidth = colWidth - 32 // Subtract left/right padding (16px each side)
      const { padding, displayText: finalText } = calculatePaddingSpaces(
        fullText,
        availableWidth
      )
      const hint = finalText ? padding + finalText : ""

      return {
        ...col,
        trailingRowOptions: { hint, addIcon: "" },
      }
    })
  }, [_columns, showColumns, statsResults])

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
    onVisibleRegionChanged: _onVisibleRegionChanged,
    onCellEdited,
    onCellsEdited,
    getCellsForSelection,
    getIndexByRowId,
  } = useAsyncDataForView<any>({
    tableName,
    pageSize: 100,
    maxConcurrency: 5,
    getRowData,
    getRowDataById,
    toCell,
    gridRef: glideDataGridRef,
    viewCount,
    view: currentView,
    isPreview: props.isPreview,
    refreshAllStats,
    refreshColumnStat,
  })

  // Wrap onVisibleRegionChanged to sync bottom stats bar scrolling
  const onVisibleRegionChanged = useCallback(
    (
      range: Rectangle,
      tx: number,
      ty: number,
      extras: { selected?: Item; freezeRegion?: Rectangle }
    ) => {
      _onVisibleRegionChanged?.(range, tx, ty, extras)
      // Sync scroll position to bottom stats bar
      // tx is negative, indicating content moved left
      setScrollLeft(Math.max(0, -tx))
    },
    [_onVisibleRegionChanged]
  )

  const { customHighlightRegions } = useHighlightRow(
    tableName,
    getIndexByRowId,
    showColumns
  )

  const { setIsAddFieldEditorOpen, selection, setSelection, clearSelection } =
    useTableStore()

  // Get search state from context
  const { searchQuery, showSearch } = useTableSearchStore()
  const { formattedSearchResults, currentCell } = useGridSearch(
    showColumns,
    getColumnIndexByColumnName
  )

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
    if (!selection.current) {
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
    rowMarkersWidth: rowMarkersWidth,
  })

  // Re-introduce the config calculation using freezeColumns from the hook
  const config = useMemo(() => {
    let conf = {
      ...defaultConfig,
      freezeColumns: freezeColumns, // Use freezeColumns state from the hook
      ...{
        rowMarkers: {
          kind: "both",
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

  if (!columns || columns.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-center h-full w-full"></div>
      </div>
    )
  }

  return (
    <div
      className={cn("h-full w-full pt-0 flex flex-col", props.className)}
      ref={containerRef}
    >
      <div className={cn("relative flex-1 w-full overflow-hidden rounded-md")}>
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
          gridSelection={selection}
          onItemHovered={onItemHovered}
          onHeaderClicked={onHeaderClicked}
          onHeaderContextMenu={onHeaderClicked}
          onGridSelectionChange={setSelection}
          onColumnResize={onColumnResize}
          onColumnMoved={onColumnMoved}
          getCellContent={getCellContent}
          maxColumnWidth={2000}
          // fillHandle={true}
          columns={columns ?? []}
          rows={viewCount}
        />
      </div>
    </div>
  )
}
