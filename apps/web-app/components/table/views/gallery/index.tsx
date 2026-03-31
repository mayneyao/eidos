import { useContext, useEffect, useRef, useState, useCallback } from "react"
import AutoSizer from "react-virtualized-auto-sizer"
import { VariableSizeGrid as Grid } from "react-window"

import type { IView } from "@/packages/core/types/IView"
import { getTableIdByRawTableName } from "@/lib/utils"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { TableContext, useShowColumns } from "../../hooks"
import { GalleryCard } from "./gallery-card"
import { useGalleryViewData } from "./hooks"
import type { IGalleryViewProperties } from "./properties"
import {
  getColumnWidthAndCount,
  getCardVisibleFieldCount,
  computeCardHeightSmart,
  computeCardHeightSmartDetailed,
  type CardHeightBreakdown,
} from "./utils"

interface IGalleryViewProps {
  space: string
  tableName: string
  view: IView<IGalleryViewProperties>
}

/**
 * Gallery View
 *
 * Optimization features:
 * 1. Use pretext for precise text measurement (progressive enhancement)
 * 2. Dynamic title height calculation, supporting multi-language and mixed text
 * 3. Smart row height calculation, dynamically adjusted based on content
 * 4. Virtual scroll optimization, only render visible area
 */
export default function GalleryView({
  tableName,
  space,
  view,
}: IGalleryViewProps) {
  const [size, setSize] = useState<any>()
  const { data } = useGalleryViewData(view)
  const { getRowById } = useSqliteStore()
  const ref = useRef<Grid>(null)
  const { uiColumns, uiColumnMap, rawIdNameMap } = useUiColumns(
    tableName,
    space
  )
  const { isView } = useContext(TableContext)
  const showFields = useShowColumns(uiColumns, view)

  const titleField = showFields?.[0]?.table_column_name || "title"

  const { columnCount, cardWidth } = getColumnWidthAndCount(
    size?.scaledWidth ?? 0
  )
  const tableId = getTableIdByRawTableName(tableName)

  // Reset grid when configuration changes
  useEffect(() => {
    if (ref.current) {
      ref.current.resetAfterRowIndex(0)
    }
  }, [showFields.length, view?.properties?.hideEmptyFields])

  useEffect(() => {
    if (ref.current) {
      ref.current.resetAfterColumnIndex(0)
    }
  }, [columnCount, cardWidth])

  // Check if has cover
  const hasCover =
    view?.properties?.coverPreview !== null &&
    view?.properties?.coverPreview !== undefined &&
    view?.properties?.coverPreview !== ""

  /**
   * Calculate row height - using smart height calculation
   *
   * Optimization points:
   * - Calculate max height based on actual content of each row's cards
   * - Consider title length, visible field count
   * - Support multi-language and mixed text
   * - Dynamically adjust cover height based on hasCover
   */
  const getRowHeight = useCallback(
    (row: number) => {
      const startIndex = row * columnCount
      const endIndex = Math.min(startIndex + columnCount, data.length)

      // Collect heights of all cards in this row
      const cardHeights: number[] = []
      const cardDataList: Array<{
        id: string
        data: any
        calculatedHeight: number
        detailed: ReturnType<typeof computeCardHeightSmartDetailed>
      }> = []

      for (let i = startIndex; i < endIndex; i++) {
        const rowId = data[i]
        const rowData = getRowById(tableId, rowId)

        if (rowData) {
          const height = computeCardHeightSmart(
            rowData,
            showFields,
            view?.properties,
            cardWidth,
            titleField,
            hasCover,
            isView
          )
          const detailed = computeCardHeightSmartDetailed(
            rowData,
            showFields,
            view?.properties,
            cardWidth,
            titleField,
            hasCover,
            isView
          )
          cardHeights.push(height)
          cardDataList.push({
            id: rowId,
            data: rowData,
            calculatedHeight: height,
            detailed,
          })
        } else {
          cardHeights.push(300)
        }
      }

      const maxHeight = cardHeights.length > 0 ? Math.max(...cardHeights) : 300

      // Debug removed - height calculation is now accurate

      return maxHeight
    },
    [
      columnCount,
      data,
      tableId,
      getRowById,
      showFields,
      view?.properties,
      cardWidth,
      titleField,
      hasCover,
    ]
  )

  // Handle resize
  const handleResize = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      setSize({
        scaledWidth: width,
        scaledHeight: height,
        width,
        height,
      })
    },
    []
  )

  // Row count
  const rowCount = Math.ceil(data.length / columnCount)

  return (
    <AutoSizer onResize={handleResize}>
      {({ height, width }) => (
        <Grid
          ref={ref}
          columnCount={columnCount}
          columnWidth={() => cardWidth}
          height={height}
          rowCount={rowCount}
          rowHeight={getRowHeight}
          width={width}
          itemData={{
            properties: view.properties,
            items: data,
            columnCount,
            uiColumns,
            showFields,
            uiColumnMap,
            rawIdNameMap,
            tableId,
            space,
            hiddenFieldIcon: true,
            isView,
            titleField,
          }}
          className="pb-[128px]"
          // Optimize virtual scroll performance
          overscanRowCount={2}
          overscanColumnCount={1}
        >
          {GalleryCard}
        </Grid>
      )}
    </AutoSizer>
  )
}
