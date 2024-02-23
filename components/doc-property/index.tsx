import { useMemo } from "react"
import { useParams } from "react-router-dom"

import { useUiColumns } from "@/hooks/use-ui-columns"
import { getRawTableNameById, nonNullable } from "@/lib/utils"

import { makeHeaderIcons } from "../grid/fields/header-icons"
import { CellEditor } from "../table/cell-editor"
import { useDocProperty } from "./hook"

interface IDocPropertyProps {
  docId: string
  tableId: string
}

const icons = makeHeaderIcons(18)

export const DocProperty = (props: IDocPropertyProps) => {
  const { space } = useParams()
  const { uiColumns } = useUiColumns(getRawTableNameById(props.tableId), space!)
  const { properties, setProperty } = useDocProperty({
    tableId: props.tableId,
    docId: props.docId,
  })

  const fields = useMemo(() => {
    if (!properties) return []
    return uiColumns
      .map((uiColumn: any) => {
        const name = uiColumn.name
        // error data
        if (!uiColumn) {
          return
        }
        if (uiColumn.table_column_name === "title") {
          return
        }
        const iconSvgString = icons[uiColumn.type]({
          bgColor: "#aaa",
          fgColor: "currentColor",
        })
        const value = properties[uiColumn.table_column_name]
        return { uiColumn, iconSvgString, name, value }
      })
      .filter(nonNullable)
  }, [properties, uiColumns])

  const handlePropertyChange = (key: string, value: any) => {
    setProperty({
      [key]: value,
    })
  }
  return (
    <div className="flex flex-col">
      {fields.map(({ uiColumn, iconSvgString, name, value }) => {
        return (
          <div key={uiColumn.name} className="flex w-full items-center gap-2">
            <div
              title={name}
              className="flex h-10 w-[200px] cursor-pointer select-none items-center gap-2 truncate rounded-sm p-1 hover:bg-secondary"
            >
              <span
                dangerouslySetInnerHTML={{
                  __html: iconSvgString,
                }}
              ></span>
              {name}
            </div>
            <CellEditor
              field={uiColumn}
              value={value}
              onChange={(_value) => {
                if (value !== _value) {
                  handlePropertyChange(uiColumn.table_column_name, _value)
                }
              }}
              className="flex h-10 w-full min-w-[200px] cursor-pointer items-center rounded-sm px-1"
            />
          </div>
        )
      })}
      <hr />
    </div>
  )
}
