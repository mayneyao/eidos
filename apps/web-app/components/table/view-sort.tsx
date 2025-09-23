import { useCallback, useMemo } from "react"
import type { OrderByItem } from "@/packages/core/sqlite/sql-sort-parser"
import type { IView } from "@/packages/core/types/IView"
import { ArrowDownUpIcon } from "lucide-react"
import {
  parseFirst,
  toSql,
  type OrderByStatement,
  type SelectFromStatement,
} from "pgsql-ast-parser"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { Button } from "../ui/button"
import { useViewOperation } from "./hooks"
import { ViewSortEditor } from "./view-sort-editor"

// filter orderBy
export const ViewSort = ({ view }: { view?: IView }) => {
  const { updateView } = useViewOperation()

  const hasOrderBy = useMemo(() => {
    if (!view?.query) return false
    return Boolean(view.query.match(/ORDER BY/i))
  }, [view?.query])

  const handleOrderByChange = useCallback(
    (orderBy: OrderByItem[]) => {
      if (!view?.id) return
      const parsedSql = parseFirst(view.query) as SelectFromStatement
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
      updateView(view.id, { query: newSql })
    },
    [updateView, view?.id, view?.query]
  )

  return (
    <Popover>
      <PopoverTrigger
        className={cn("rounded transition-colors duration-150", {
          "bg-secondary": hasOrderBy,
        })}
        asChild
      >
        <Button size="xs" variant="ghost">
          <ArrowDownUpIcon className="h-4 w-4 opacity-60"></ArrowDownUpIcon>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <ViewSortEditor onSortChange={handleOrderByChange} />
      </PopoverContent>
    </Popover>
  )
}
