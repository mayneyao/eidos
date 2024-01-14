import { OrderByStatement, toSql } from "pgsql-ast-parser"

import { IView } from "@/lib/store/IView"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { useViewOperation } from "../hooks"
import { useViewQuery } from "./use-view-query"
import { OrderByItem, ViewSortEditor } from "./view-sort-editor"

// filter orderBy
export const ViewQueryEditor = (props: { view: IView }) => {
  const { parsedSql } = useViewQuery(props.view)
  const hasOrderBy = Boolean(parsedSql.orderBy)
  const { updateView } = useViewOperation()
  const handleOrderByChange = (orderBy: OrderByItem[]) => {
    if (!orderBy.length) {
      delete parsedSql.orderBy
    } else {
      const newOrderBy = orderBy.map((item) => {
        return {
          by: {
            type: "ref",
            name: item.column as any,
          },
          order: item.order as any,
        } as OrderByStatement
      })
      parsedSql.orderBy = newOrderBy
    }
    const newSql = toSql.statement(parsedSql)
    updateView(props.view.id, { query: newSql })
  }
  return (
    <div className="p-1">
      {hasOrderBy && (
        <Popover>
          <PopoverTrigger className="round-md bg-secondary px-2">
            Sort
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <ViewSortEditor onSortChange={handleOrderByChange} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
