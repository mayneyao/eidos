import { useMemo } from "react"
import { SelectFromStatement, parseFirst, toSql } from "pgsql-ast-parser"

import { IView } from "@/lib/store/IView"

export const useViewQuery = (view?: IView) => {
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
    sql,
    parsedSql,
  }
}
