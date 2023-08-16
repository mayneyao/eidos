import { FieldType } from "@/lib/fields/const"
import { IUIColumn } from "@/hooks/use-table"

interface ICardProps {
  columnIndex: number
  rowIndex: number
  style: React.CSSProperties
  data: any
}

export const GalleryCard = ({
  columnIndex,
  rowIndex,
  style,
  data,
}: ICardProps) => {
  const { items, columnCount, uiColumns, rawIdNameMap } = data
  const item = items[rowIndex * columnCount + columnIndex]
  const coverField = (uiColumns as IUIColumn[]).find(
    (c) => c.type == FieldType.File
  )
  if (!item) {
    return <div style={style}></div>
  }
  const coverUrl = coverField ? item[coverField.table_column_name] : null
  const fieldKeys = Object.keys(item).filter((k) => k != "_id" && k != "title")
  return (
    <div style={style} className="p-2">
      <div className="h-full border">
        <div className="flex h-[200px] w-full items-center">
          <img
            src={coverUrl}
            alt=""
            className="h-[200px] w-full object-contain"
          />
        </div>
        <div className="p-2">
          <div className="truncate" title={item?.title}>
            {item?.title}
          </div>
          {fieldKeys.map((k) => {
            const fieldName = rawIdNameMap.get(k)
            return (
              <div key={k} className="truncate" title={item[k]}>
                {fieldName}: {item[k]}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
