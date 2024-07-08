import { useCallback, useEffect, useState } from "react"
import { Expr, SelectFromStatement, parseFirst, toSql } from "pgsql-ast-parser"
import { create } from "zustand"

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

interface ViewState {
  counts: Record<string, number>
  increaseCount: (query: string) => void
  reduceCount: (query: string) => void
  setCount: (query: string, count: number) => void
}

export const useViewStore = create<ViewState>((set) => ({
  counts: {},
  increaseCount: (query) =>
    set((state) => {
      const currentCount = state.counts[query] || 0
      return { counts: { ...state.counts, [query]: currentCount + 1 } }
    }),
  reduceCount: (query) =>
    set((state) => {
      const currentCount = state.counts[query] || 0
      return {
        counts: { ...state.counts, [query]: Math.max(0, currentCount - 1) },
      }
    }),
  setCount: (query, count) =>
    set((state) => ({
      counts: { ...state.counts, [query]: count },
    })),
}))

export const useViewCount = (view?: IView) => {
  const {
    counts,
    increaseCount: _increaseCount,
    reduceCount: _reduceCount,
    setCount: _setCount,
  } = useViewStore()
  const count = view ? counts[view.query] || 0 : 0

  const [loading, setLoading] = useState(false)
  const { sqlite } = useSqlite()

  const increaseCount = () => {
    if (view) {
      _increaseCount(view.query)
    }
  }

  const reduceCount = () => {
    if (view) {
      _reduceCount(view.query)
    }
  }

  const setCount = useCallback(
    (count: number) => {
      if (view?.query) {
        _setCount(view.query, count)
      }
    },
    [view?.query, _setCount]
  )

  useEffect(() => {
    if (view?.query.length) {
      setLoading(true)
      const parsedSql = parseFirst(view.query) as SelectFromStatement
      parsedSql.columns = [
        {
          expr: countExpr as Expr,
        },
      ]
      if ("orderBy" in parsedSql) {
        delete parsedSql.orderBy
      }
      const countSql = toSql.statement(parsedSql)
      sqlite?.sql4mainThread(countSql).then((res) => {
        setCount(res[0][0])
        setLoading(false)
      })
    }
  }, [setCount, sqlite, view?.query])

  return {
    count,
    setCount,
    loading,
    increaseCount,
    reduceCount,
  }
}
