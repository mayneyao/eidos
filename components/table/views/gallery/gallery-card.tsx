import { FieldType } from "@/lib/fields/const"
import { FileField } from "@/lib/fields/file"
import { IField } from "@/lib/store/interface"
import { useRowDataOperation } from "@/components/doc-property/hook"

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
  const { items, columnCount, uiColumns, uiColumnMap, rawIdNameMap, tableId } =
    data
  const item = items[rowIndex * columnCount + columnIndex]
  const { setProperty } = useRowDataOperation()
  const coverField = (uiColumns as IField[]).find(
    (c) => c.type == FieldType.File
  )
  if (!item) {
    return <div style={style}></div>
  }
  const handleChange = (column: string, value: any) => {
    console.log(tableId, item._id, {
      [column]: value,
    })
    setProperty(tableId, item._id, {
      [column]: value,
    })
  }
  const coverUrl = getCoverUrl(item, coverField)
  const fieldKeys = Object.keys(item).filter((k) => k != "_id" && k != "title")
  return (
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
  )
}
