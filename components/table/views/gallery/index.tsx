import { useEffect, useRef, useState } from "react"
import AutoSizer from "react-virtualized-auto-sizer"
import { VariableSizeGrid as Grid } from "react-window"

import { useUiColumns } from "@/hooks/use-ui-columns"
import { IView } from "@/lib/store/IView"
import { getTableIdByRawTableName } from "@/lib/utils"

import { useViewData } from "../../hooks"
import { GalleryCard } from "./gallery-card"
import { computeCardHeight, getColumnWidthAndCount } from "./utils"

interface IGalleryViewProps {
  space: string
  tableName: string
  view: IView
}

export default function GalleryView({
  tableName,
  space,
  view,
}: IGalleryViewProps) {
  const [size, setSize] = useState<any>()
  const { data } = useViewData(view)
  const ref = useRef<Grid>(null)
  const { uiColumns, uiColumnMap, getFieldByIndex, rawIdNameMap } =
    useUiColumns(tableName, space)

  const { columnCount, cardWidth } = getColumnWidthAndCount(
    size?.scaledWidth ?? 0
  )
  const tableId = getTableIdByRawTableName(tableName)

  const cardHeight = computeCardHeight(view.query, rawIdNameMap.size)
  useEffect(() => {
    if (ref.current) {
      ref.current.resetAfterRowIndex(0)
    }
  }, [cardHeight])

  return (
    <AutoSizer className="m-3 h-full" onResize={setSize}>
      {({ height, width }) => (
        <Grid
          ref={ref}
          columnCount={columnCount}
          columnWidth={() => cardWidth}
          height={height}
          rowCount={Math.ceil(data.length / columnCount)}
          rowHeight={() => cardHeight}
          width={width}
          itemData={{
            items: data,
            columnCount,
            uiColumns,
            uiColumnMap,
            rawIdNameMap,
            tableId,
            space,
            hiddenFieldIcon: true,
          }}
          className="pb-[128px]"
        >
          {GalleryCard}
        </Grid>
      )}
    </AutoSizer>
  )
}
