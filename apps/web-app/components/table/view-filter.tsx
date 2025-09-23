import { FilterIcon } from "lucide-react"
import { useContext } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { transformFilterItems2SqlString } from "@/packages/core/sqlite/sql-filter-parser"
import type { IView } from "@/packages/core/types/IView"
import { cn } from "@/lib/utils"

import { Button } from "../ui/button"
import { TableContext, useViewOperation } from "./hooks"
import { useViewQuery } from "./hooks/use-view-query"
import type { FilterValueType } from "../../../../packages/core/types/IViewFilter"
import { ViewFilterEditor } from "./view-filter-editor/view-filter-editor"

export const ViewFilter = (props: { view?: IView }) => {
  const { tableName, space } = useContext(TableContext)
  const { parsedSql } = useViewQuery(props.view)
  const { updateView } = useViewOperation()
  const hasFilter = Boolean(parsedSql?.where)
  // const value = defaultValue
  const value = hasFilter ? props.view?.filter : null

  // const res = transformFilterItems2SqlExpr(value as any)
  const handleFilterValueChange = (value: FilterValueType) => {
    if (!props.view) return
    const sql = transformFilterItems2SqlString(props.view.query, value)
    updateView(props.view.id, {
      query: sql,
      filter: value,
    })
  }
  const handleClearFilter = () => {
    if (!props.view) return
    const sql = transformFilterItems2SqlString(props.view.query, null)
    updateView(props.view.id, {
      query: sql,
    })
  }

  const { uiColumns } = useUiColumns(tableName, space)

  return (
    <Popover>
      <PopoverTrigger
        className={cn("rounded-md", {
          "bg-secondary": hasFilter,
        })}
        asChild
      >
        <Button size="xs" variant="ghost">
          <FilterIcon className="h-4 w-4 opacity-60"></FilterIcon>
        </Button>
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
