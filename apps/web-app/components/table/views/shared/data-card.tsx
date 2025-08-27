import { useMemo } from "react"

import type { IField } from "@/packages/core/types/IField"
import { cn } from "@/lib/utils"

import { useRowDataOperation } from "../../../doc-property/hook"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../ui/tooltip"
import { CellEditor } from "../../cell-editor"
import { useTableContext } from "../../hooks"
import type { IGalleryViewProperties } from "../gallery/properties"
import { GalleryCardCover } from "./card-cover"
import { DataCardMenu } from "./data-card-menu"

interface DataCardProps {
  item: Record<string, any>
  coverField?: IField
  rawIdNameMap: Map<string, string>
  style?: React.CSSProperties
  properties?: IGalleryViewProperties
  showFields: IField[]
  hiddenFields?: string[]
  tableId: string
  space: string
  uiColumnMap: Map<string, IField>
  padding?: number
  cardClassName?: string
  hideCover?: boolean
  titleField: string
}

export const DataCard = ({
  item,
  coverField,
  rawIdNameMap,
  style,
  properties,
  showFields,
  tableId,
  space,
  uiColumnMap,
  padding,
  cardClassName,
  hideCover,
  titleField,
}: DataCardProps) => {
  const { setProperty } = useRowDataOperation()

  const { isView } = useTableContext()
  if (!item) {
    return <div style={style}></div>
  }
  const handleChange = (column: string, value: any) => {
    setProperty(tableId, item._id, {
      [column]: value,
    })
  }

  const fieldKeys = useMemo(() => {
    if (isView) {
      return showFields.map((k) => k.table_column_name)
    }
    return showFields
      .filter(
        (k) => k.table_column_name != "_id" && k.table_column_name != "title"
      )
      .map((k) => k.table_column_name)
  }, [isView, showFields])

  return (
    <DataCardMenu item={item} tableId={tableId} space={space} isView={isView}>
      <div
        style={style}
        className={cn({
          [`p-[${padding}px]`]: padding,
        })}
      >
        <div className={cardClassName}>
          {!hideCover && (
            <div className="flex h-[200px] w-full items-center border-b">
              <GalleryCardCover
                item={item}
                coverField={coverField}
                coverPreview={properties?.coverPreview || ""}
                fitContent={properties?.fitContent}
                rawIdNameMap={rawIdNameMap}
              />
            </div>
          )}
          <div className="prose p-[8px] dark:prose-invert">
            <div
              className={cn("h-[36px] truncate font-medium", {
                hidden: isView,
              })}
              title={item?.[titleField]}
            >
              {item?.[titleField] || (
                <span className=" opacity-70">Untitled</span>
              )}
            </div>
            {fieldKeys.map((k) => {
              const fieldName = rawIdNameMap.get(k)!
              const uiColumn = uiColumnMap.get(fieldName) as IField
              if (!uiColumn) {
                return null
              }
              const value = item[k]
              if (!value && properties?.hideEmptyFields) return null
              return (
                <TooltipProvider key={`${item._id}:${k}`}>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <div
                        key={`${item._id}:${k}`}
                        className="flex w-full items-center gap-2"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CellEditor
                          field={uiColumn}
                          value={value}
                          onChange={(_value) => {
                            if (value != _value) {
                              handleChange(uiColumn.table_column_name, _value)
                            }
                          }}
                          className="flex h-8 w-full min-w-[100px] cursor-pointer items-center rounded-sm px-1 hover:bg-none"
                          disableTextBaseEditor
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={8} className="">
                      {uiColumn.name}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            })}
          </div>
        </div>
      </div>
    </DataCardMenu>
  )
}
