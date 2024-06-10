import { MoveDiagonalIcon, MoveUpRightIcon, Trash2Icon } from "lucide-react"

import { FieldType } from "@/lib/fields/const"
import { FileField } from "@/lib/fields/file"
import { IField } from "@/lib/store/interface"
import { shortenId } from "@/lib/utils"
import { useCurrentSubPage } from "@/hooks/use-current-sub-page"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useRowDataOperation } from "@/components/doc-property/hook"
import { InnerEditor } from "@/components/doc/editor"
import { ScriptContextMenu } from "@/components/grid/script-context-menu"

import { CellEditor } from "../../cell-editor"
import { FieldIcon } from "../../field-icon"

interface ICardProps<T> {
  columnIndex: number
  rowIndex: number
  style: React.CSSProperties
  data: T
}

const getCoverUrl = (row: any, coverField?: IField) => {
  if (!coverField) return ""
  const field = new FileField(coverField)
  const cv = row[coverField.table_column_name]
  return field.getCellContent(cv).data.displayData[0]
}

export interface IGalleryCardProps {
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
  } = data
  const rowId = items[rowIndex * columnCount + columnIndex]
  const { setProperty } = useRowDataOperation()
  const { getOrCreateTableSubDoc } = useSqlite()
  const { getRowById } = useSqliteStore()
  const item = getRowById(tableId, rowId)
  const coverField = (uiColumns as IField[]).find(
    (c) => c.type == FieldType.File
  )
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
  const coverUrl = getCoverUrl(item, coverField)
  const fieldKeys = showFields
    .filter(
      (k) => k.table_column_name != "_id" && k.table_column_name != "title"
    )
    .map((k) => k.table_column_name)
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div style={style} className="p-2">
          <div className="h-full rounded-md border-t shadow-md dark:border-gray-800 dark:bg-gray-800 ">
            <div className="flex h-[200px] w-full items-center">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt=""
                  className="h-[200px] w-full object-cover"
                />
              ) : (
                <div className="h-[200px] w-full overflow-hidden object-cover">
                  <InnerEditor
                    docId={shortenId(item._id)}
                    namespace="eidos-notes-home-page"
                    isEditable={false}
                    placeholder=""
                    disableSelectionPlugin
                    disableSafeBottomPaddingPlugin
                    disableUpdateTitle
                    disableManuallySave
                    className="prose-sm ml-0  !h-[200px] bg-gray-50 p-2 dark:bg-gray-700"
                  />
                </div>
              )}
            </div>
            <div className="p-2">
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
                  return (
                    <div
                      key={`${item._id}:${k}`}
                      className="flex w-full items-center gap-2"
                    >
                      {!hiddenField && (
                        <div
                          className="flex h-10 min-w-[150px] cursor-pointer select-none items-center gap-2 truncate rounded-sm p-1"
                          title={fieldName}
                        >
                          {!hiddenFieldIcon && (
                            <FieldIcon type={uiColumn.type} />
                          )}
                          {fieldName}
                        </div>
                      )}
                      <CellEditor
                        field={uiColumn}
                        value={value}
                        onChange={(_value) => {
                          if (value != _value) {
                            handleChange(uiColumn.table_column_name, _value)
                          }
                        }}
                        className="flex h-10 w-full min-w-[100px] cursor-pointer items-center rounded-sm px-1 hover:bg-none"
                        disableTextBaseEditor
                      />
                    </div>
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
