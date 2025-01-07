import { MoveDiagonalIcon, MoveUpRightIcon, Trash2Icon } from "lucide-react"

import { useRowDataOperation } from "@/components/doc-property/hook"
import { ScriptContextMenu } from "@/components/table/views/grid/script-context-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCurrentSubPage } from "@/hooks/use-current-sub-page"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { IField } from "@/lib/store/interface"
import {
  shortenId
} from "@/lib/utils"

import { CellEditor } from "../../cell-editor"
import { GalleryCardCover } from "./gallery-card-cover"
import { IGalleryViewProperties } from "./properties"

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
  hiddenField?: boolean
  hiddenFields?: string[]
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
    hiddenFieldIcon,
    hiddenField,
    hiddenFields,
    properties,
  } = data
  const rowId = items[rowIndex * columnCount + columnIndex]
  const { setProperty } = useRowDataOperation()
  const { getOrCreateTableSubDoc } = useSqlite()
  const { getRowById } = useSqliteStore()
  const item = getRowById(tableId, rowId)
  const coverField = properties?.coverPreview?.startsWith("cl_")
    ? (uiColumns as IField[]).find(
        (c) => c.table_column_name === properties?.coverPreview
      )
    : undefined
  const goto = useGoto()
  const { setSubPage } = useCurrentSubPage()

  if (!item) {
    return <div style={style}></div>
  }
  const handleChange = (column: string, value: any) => {
    setProperty(tableId, item._id, {
      [column]: value,
    })
  }

  const openRow = async (right?: boolean) => {
    if (!item) {
      return
    }
    const shortId = shortenId(item._id)

    await getOrCreateTableSubDoc({
      docId: shortId,
      title: item.title,
      tableId: tableId!,
    })

    if (right) {
      setSubPage(shortId)
    } else {
      goto(space, shortId)
    }
  }
  const fieldKeys = showFields
    .filter(
      (k) => k.table_column_name != "_id" && k.table_column_name != "title"
    )
    .map((k) => k.table_column_name)

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div style={style} className="p-[8px]">
          <div className="h-full rounded-md border-t shadow-md dark:border-gray-800 dark:bg-gray-800 ">
            <div className="flex h-[200px] w-full items-center border-b">
              <GalleryCardCover
                item={item}
                coverField={coverField}
                coverPreview={properties?.coverPreview || ""}
                rawIdNameMap={rawIdNameMap}
              />
            </div>
            <div className="prose p-[8px] dark:prose-invert">
              <div
                className="h-[36px] truncate font-medium"
                title={item?.title}
              >
                {item?.title || <span className=" opacity-70">Untitled</span>}
              </div>
              {fieldKeys
                .filter((k) => !hiddenFields?.includes(k))
                .map((k) => {
                  const fieldName = rawIdNameMap.get(k)!
                  const uiColumn = uiColumnMap.get(fieldName) as IField
                  if (!uiColumn) {
                    return null
                  }
                  const value = item[k]
                  if (!value && properties?.hideEmptyFields) return null
                  return (
                    <TooltipProvider>
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <div
                            key={`${item._id}:${k}`}
                            className="flex w-full items-center gap-2"
                          >
                            <CellEditor
                              field={uiColumn}
                              value={value}
                              onChange={(_value) => {
                                if (value != _value) {
                                  handleChange(
                                    uiColumn.table_column_name,
                                    _value
                                  )
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
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem onClick={() => openRow(true)}>
          <MoveUpRightIcon className="pr-2" />
          Open
        </ContextMenuItem>
        <ContextMenuItem onClick={() => openRow()}>
          <MoveDiagonalIcon className="pr-2" />
          Open in full page
        </ContextMenuItem>
        <ContextMenuItem disabled>
          <Trash2Icon className="pr-2" />
          Delete
        </ContextMenuItem>
        <ScriptContextMenu getRows={() => [item]} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
