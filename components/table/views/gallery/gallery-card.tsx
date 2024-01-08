import { allFieldTypesMap } from "@/lib/fields"
import { FieldType } from "@/lib/fields/const"
import { FileField } from "@/lib/fields/file"
import { IField } from "@/lib/store/interface"

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
  const { items, columnCount, uiColumns, uiColumnMap, rawIdNameMap } = data
  const item = items[rowIndex * columnCount + columnIndex]
  const coverField = (uiColumns as IField[]).find(
    (c) => c.type == FieldType.File
  )
  if (!item) {
    return <div style={style}></div>
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
          {fieldKeys.map((k) => {
            const fieldName = rawIdNameMap.get(k)
            const field = uiColumnMap.get(fieldName) as IField
            const value = item[k]
            if (field?.type == FieldType.URL) {
              return (
                <div key={k} className="truncate" title={value}>
                  <a href={value}>{value}</a>
                </div>
              )
            }
            return (
              <div key={k} className="truncate" title={value}>
                {value}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
