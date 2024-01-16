import { useEffect, useState } from "react"
import { Expr, SelectFromStatement, parseFirst, toSql } from "pgsql-ast-parser"

import { IView } from "@/lib/store/IView"
import { useSqlite } from "@/hooks/use-sqlite"

const countExpr = {
  type: "call",
  function: {
    name: "count",
  },
  args: [
    {
      type: "ref",
      name: "*",
    },
  ],
}

export const useViewCount = (view?: IView) => {
  const [count, setCount] = useState(0)
  const { sqlite } = useSqlite()

  useEffect(() => {
    if (view?.query.length) {
      console.log("view?.query", view?.query)
      const parsedSql = parseFirst(view?.query ?? "") as SelectFromStatement
      parsedSql.columns = [
        {
          expr: countExpr as Expr,
        },
      ]
      const countSql = toSql.statement(parsedSql)
      sqlite?.sql4mainThread(countSql).then((res) => {
        setCount(res[0][0])
      })
    }
  }, [sqlite, view?.query])

  return {
    count,
    setCount,
  }
}
