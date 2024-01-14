import { useWhyDidYouUpdate } from "ahooks"

import { BinaryOperator, CompareOperator } from "@/lib/fields/const"
import {
  transformFilterItems2SqlString,
  transformSql2FilterItems,
} from "@/lib/sqlite/sql-filter-parser"
import { IView } from "@/lib/store/IView"
import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useUiColumns } from "@/hooks/use-ui-columns"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { useViewOperation } from "./hooks"
import { useViewQuery } from "./hooks/use-view-query"
import { FilterValueType } from "./view-filter-editor/interface"
import { ViewFilterEditor } from "./view-filter-editor/view-filter-editor"

export const ViewFilter = (props: { view: IView }) => {
  const { database, tableName } = useCurrentPathInfo()
  const { parsedSql } = useViewQuery(props.view)
  const { updateView } = useViewOperation()
  const hasFilter = Boolean(parsedSql.where)
  // const value = defaultValue
  const value = hasFilter ? transformSql2FilterItems(props.view.query) : null

  // const res = transformFilterItems2SqlExpr(value as any)
  const handleFilterValueChange = (value: FilterValueType) => {
    const sql = transformFilterItems2SqlString(props.view.query, value)
    updateView(props.view.id, {
      query: sql,
    })
    console.log(sql)
  }
  const handleClearFilter = () => {
    const sql = transformFilterItems2SqlString(props.view.query, null)
    updateView(props.view.id, {
      query: sql,
    })
  }

  const { uiColumns } = useUiColumns(tableName!, database!)

  if (!props.view) {
    return null
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn("rounded-md px-2", {
          "bg-secondary": hasFilter,
        })}
      >
        <span>Filter</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <ViewFilterEditor
          depth={0}
          value={value as any}
          onChange={handleFilterValueChange}
          handleClearFilter={handleClearFilter}
          fields={uiColumns}
        />
      </PopoverContent>
    </Popover>
  )
}
