import { IView } from "@/worker/meta_table/view"
import { useState } from "react"
import AutoSizer from "react-virtualized-auto-sizer"
import { VariableSizeGrid as Grid } from "react-window"

import { useUiColumns } from "@/hooks/use-ui-columns"

import { useVideData } from "../../hooks"
import { GalleryCard } from "./gallery-card"
import { computeCardHeight, getColumnWidthAndCount } from "./utils"

interface IGalleryViewProps {
  space: string
  tableName: string
  view: IView
}

export const GalleryView = ({ tableName, space, view }: IGalleryViewProps) => {
  const [size, setSize] = useState<any>()
  const { data } = useVideData(view)
  const { uiColumns, uiColumnMap, getFieldByIndex, rawIdNameMap } =
    useUiColumns(tableName, space)

  const { columnCount, cardWidth } = getColumnWidthAndCount(
    size?.scaledWidth ?? 0
  )
  const cardHeight = computeCardHeight(view.query, rawIdNameMap.size)
  return (
    <AutoSizer className="m-3 h-full" onResize={setSize}>
      {({ height, width }) => (
        <Grid
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
            getFieldByIndex,
            rawIdNameMap,
          }}
        >
          {GalleryCard}
        </Grid>
      )}
    </AutoSizer>
  )
}
