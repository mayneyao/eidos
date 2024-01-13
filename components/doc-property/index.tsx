import { useMemo } from "react"
import { useParams } from "react-router-dom"

import { allFieldTypesMap } from "@/lib/fields"
import { getRawTableNameById } from "@/lib/utils"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { makeHeaderIcons } from "../grid/fields/header-icons"
import { useDocProperty } from "./hook"
import { StandaloneCellRender } from "./standalone-cell-render-back"

interface IDocPropertyProps {
  docId: string
  tableId: string
}

const icons = makeHeaderIcons(18)

export const DocProperty = (props: IDocPropertyProps) => {
  const { space } = useParams()
  const { uiColumnMap, rawIdNameMap } = useUiColumns(
    getRawTableNameById(props.tableId),
    space!
  )
  const { properties } = useDocProperty({
    tableId: props.tableId,
    docId: props.docId,
  })
  const fields = useMemo(() => {
    return Object.entries(properties).map(([key, value]) => {
      const name = rawIdNameMap.get(key)!
      const uiColumn = uiColumnMap.get(name)!
      const iconSvgString = icons[uiColumn.type]({
        bgColor: "#aaa",
        fgColor: "currentColor",
      })
      const fieldCls = allFieldTypesMap[uiColumn.type]
      const field = new fieldCls(uiColumn)
      const cell = field.getCellContent(value as never)
      return { uiColumn, cell, iconSvgString, name, value }
    })
  }, [properties, rawIdNameMap, uiColumnMap])

  return (
    <div className="flex flex-col">
      {fields.map(({ uiColumn, cell, iconSvgString, name, value }) => {
        return (
          <div key={uiColumn.name} className="flex w-full items-center gap-2">
            <div className="flex min-w-[150px] cursor-pointer items-center gap-2 rounded-sm p-1 hover:bg-secondary">
              <span
                dangerouslySetInnerHTML={{
                  __html: iconSvgString,
                }}
              ></span>
              {name}
            </div>
            <div className="h-[40px] w-[200px] cursor-pointer rounded-sm p-1">
              <StandaloneCellRender
                column={uiColumn}
                cell={cell as any}
                value={value}
              />
            </div>
          </div>
        )
      })}
      <hr />
    </div>
  )
}
