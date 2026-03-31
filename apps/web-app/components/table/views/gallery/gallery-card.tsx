import type { IField } from "@/packages/core/types/IField"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { DataCard } from "@/components/table/views/shared/data-card"
import { cn } from "@/lib/utils"

import type { IGalleryViewProperties } from "./properties"

interface ICardProps<T> {
  columnIndex: number
  rowIndex: number
  style: React.CSSProperties
  data: T
}

export interface IGalleryCardProps {
  properties?: IGalleryViewProperties
  items: string[]
  columnCount: number
  uiColumns: IField[]
  showFields: IField[]
  uiColumnMap: Map<string, IField>
  rawIdNameMap: Map<string, string>
  tableId: string
  space: string
  hiddenFieldIcon?: boolean
  isView?: boolean
  titleField: string
}

export const GalleryCard = ({
  columnIndex,
  rowIndex,
  style,
  data,
}: ICardProps<IGalleryCardProps>) => {
  const {
    items,
    columnCount,
    uiColumns,
    showFields,
    uiColumnMap,
    rawIdNameMap,
    tableId,
    space,
    properties,
    isView,
    titleField,
  } = data

  const rowId = items[rowIndex * columnCount + columnIndex]
  const { getRowById } = useSqliteStore()
  const item = getRowById(tableId, rowId)

  // Check if has cover: coverPreview is not null and not empty string
  const hasCover =
    properties?.coverPreview !== null &&
    properties?.coverPreview !== undefined &&
    properties?.coverPreview !== ""

  const _coverField = (uiColumns as IField[]).find(
    (c) => c.table_column_name === properties?.coverPreview
  )
  const coverField = isView
    ? _coverField
    : properties?.coverPreview &&
        properties.coverPreview !== "__CONTENT__" &&
        !properties.coverPreview.startsWith("block://")
      ? _coverField
      : undefined

  if (!item) {
    return <div style={style}></div>
  }

  // Notion-style card styling
  const notionCardClassName = cn(
    "h-full rounded-xl overflow-hidden",
    "bg-white dark:bg-gray-900",
    "border border-gray-200 dark:border-gray-800",
    "shadow-xs hover:shadow-sm",
    "transition-shadow duration-200 ease-out",
    "cursor-pointer"
  )

  return (
    <DataCard
      item={item}
      coverField={coverField}
      titleField={titleField}
      rawIdNameMap={rawIdNameMap}
      style={style}
      properties={properties}
      showFields={showFields}
      tableId={tableId}
      space={space}
      uiColumnMap={uiColumnMap}
      padding={6}
      cardClassName={notionCardClassName}
      hasCover={hasCover}
    />
  )
}
