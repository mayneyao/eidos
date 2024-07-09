import { useCallback } from "react"
import { ArrowDownUpIcon } from "lucide-react"
import {
  OrderByStatement,
  SelectFromStatement,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

import { IView } from "@/lib/store/IView"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { Button } from "../ui/button"
import { useViewOperation } from "./hooks"
import { OrderByItem, ViewSortEditor } from "./view-sort-editor"

// filter orderBy
export const ViewSort = ({ view }: { view?: IView }) => {
  const { updateView } = useViewOperation()

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
  if (!view) return null
  const hasOrderBy = Boolean(view.query?.match(/ORDER BY/i))

  return (
    <Popover>
      <PopoverTrigger
        className={cn("rounded-md", {
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
