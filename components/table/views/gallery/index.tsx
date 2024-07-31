import { useEffect, useRef, useState } from "react"
import AutoSizer from "react-virtualized-auto-sizer"
import { VariableSizeGrid as Grid } from "react-window"

import { useSqliteStore } from "@/hooks/use-sqlite"
import { useUiColumns } from "@/hooks/use-ui-columns"
import { IView } from "@/lib/store/IView"
import { getTableIdByRawTableName } from "@/lib/utils"

import { useShowColumns } from "../../hooks"
import { GalleryCard } from "./gallery-card"
import { useGalleryViewData } from "./hooks"
import { IGalleryViewProperties } from "./properties"
import {
  computeCardHeight,
  getColumnWidthAndCount
} from "./utils"

interface IGalleryViewProps {
  space: string
  tableName: string
  view: IView<IGalleryViewProperties>
}

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
  const showFields = useShowColumns(uiColumns, view)

  const { columnCount, cardWidth } = getColumnWidthAndCount(
    size?.scaledWidth ?? 0
  )
  const tableId = getTableIdByRawTableName(tableName)

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

  const getRowHeight = (row: number) => {
    const thisRowCardShowFieldCounts = data
      .slice(row * columnCount, (row + 1) * columnCount)
      .map((rowId) => {
        const rowData = getRowById(tableId, rowId)
        return showFields.filter((field) => {
          const value = rowData?.[field.table_column_name]
          if (!value && view?.properties?.hideEmptyFields) return false
          return true
        }).length
      })
    const maxShowFieldCount = Math.max(...thisRowCardShowFieldCounts)
    const cardHeight = computeCardHeight(maxShowFieldCount)
    return cardHeight
  }

  return (
    <AutoSizer onResize={setSize}>
      {({ height, width }) => (
        <Grid
          ref={ref}
          columnCount={columnCount}
          columnWidth={() => cardWidth}
          height={height}
          rowCount={Math.ceil(data.length / columnCount)}
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
            hiddenFields: view.hidden_fields,
          }}
          className="pb-[128px]"
        >
          {GalleryCard}
        </Grid>
      )}
    </AutoSizer>
  )
}
