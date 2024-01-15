import { FieldType } from "@/lib/fields/const"
import { FileField } from "@/lib/fields/file"
import { IField } from "@/lib/store/interface"
import { shortenId } from "@/lib/utils"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useRowDataOperation } from "@/components/doc-property/hook"
import { ScriptContextMenu } from "@/components/grid/script-context-menu"

import { CellEditor } from "../../cell-editor"
import { FieldIcon } from "../../field-icon"

interface ICardProps {
  columnIndex: number
  rowIndex: number
  style: React.CSSProperties
  data: any
}

const getCoverUrl = (row: any, coverField?: IField) => {
  if (!coverField) return ""
  const field = new FileField(coverField)
  const cv = row[coverField.table_column_name]
  return field.getCellContent(cv).data.displayData[0]
}

export const GalleryCard = ({
  columnIndex,
  rowIndex,
  style,
  data,
}: ICardProps) => {
  const {
    items,
    columnCount,
    uiColumns,
    uiColumnMap,
    rawIdNameMap,
    tableId,
    space,
  } = data
  const item = items[rowIndex * columnCount + columnIndex]
  const { setProperty } = useRowDataOperation()
  const { getOrCreateTableSubDoc } = useSqlite()
  const coverField = (uiColumns as IField[]).find(
    (c) => c.type == FieldType.File
  )
  const goto = useGoto()

  if (!item) {
    return <div style={style}></div>
  }
  const handleChange = (column: string, value: any) => {
    setProperty(tableId, item._id, {
      [column]: value,
    })
  }

  const openRow = async () => {
    if (!item) {
      return
    }
    const shortId = shortenId(item._id)
    await getOrCreateTableSubDoc({
      docId: shortId,
      title: item.title,
      tableId: tableId!,
    })

    goto(space, shortId)
  }
  const coverUrl = getCoverUrl(item, coverField)
  const fieldKeys = Object.keys(item).filter((k) => k != "_id" && k != "title")
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div style={style} className="p-2">
          <div className="h-full border">
            <div className="flex h-[200px] w-full items-center">
              <img
                src={coverUrl}
                alt=""
                className="h-[200px] w-full object-cover"
              />
            </div>
            <div className="p-2">
              <div className="truncate" title={item?.title}>
                {item?.title}
              </div>
              <hr className="my-1" />
              {fieldKeys.map((k) => {
                const fieldName = rawIdNameMap.get(k)
                const uiColumn = uiColumnMap.get(fieldName) as IField
                if (!uiColumn) {
                  return null
                }
                const value = item[k]
                return (
                  <div
                    key={uiColumn.name}
                    className="flex w-full items-center gap-2"
                  >
                    <div className="flex h-10 min-w-[150px] cursor-pointer select-none items-center gap-2 rounded-sm p-1">
                      <FieldIcon type={uiColumn.type} />
                      {fieldName}
                    </div>
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
        <ContextMenuItem inset onClick={openRow}>
          Open
        </ContextMenuItem>
        <ContextMenuItem inset disabled>
          Delete
        </ContextMenuItem>
        <ScriptContextMenu getRows={() => [item]} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
