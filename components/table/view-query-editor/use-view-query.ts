import { useMemo, useState } from "react"
import {
  SelectFromStatement,
  Statement,
  astMapper,
  parse,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

import { IView } from "@/lib/store/IView"

import { useViewOperation } from "../hooks"

export const useViewQuery = (view?: IView) => {
  const [count, setCount] = useState(0)
  const { updateView } = useViewOperation()

  const addSort = (column: string, direction: "ASC" | "DESC") => {
    const parsedSql = parseFirst(view?.query ?? "") as SelectFromStatement

    if (parsedSql?.orderBy?.some((item) => (item.by as any).name === column)) {
      const order = parsedSql.orderBy!.find(
        (item) => (item.by as any).name === column
      )!
      if (order.order !== direction) {
        order.order = direction
      } else {
        return
      }
    } else {
      parsedSql.orderBy = [
        ...(parsedSql.orderBy || []),
        {
          by: {
            type: "ref",
            name: column,
          },
          order: direction,
        },
      ]
    }
    const newSql = toSql.statement(parsedSql)
    updateView(view!.id, {
      query: newSql,
    })
  }

  const { parsedSql, sql } = useMemo(() => {
    if (view?.query.length) {
      const parsedSql = parseFirst(view?.query ?? "") as SelectFromStatement
      return {
        parsedSql,
        sql: toSql.statement(parsedSql),
      }
    }
    return {
      parsedSql: [] as unknown as SelectFromStatement,
      sql: "",
    }
  }, [view?.query])

  return {
    count,
    setCount,
    sql,
    parsedSql,
    addSort,
  }
}
