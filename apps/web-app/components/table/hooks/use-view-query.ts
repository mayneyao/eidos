import { useMemo } from "react"
import type { SelectFromStatement } from "pgsql-ast-parser"
import { parseFirst, toSql } from "pgsql-ast-parser"

import type { IView } from "@/packages/core/types/IView"

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
