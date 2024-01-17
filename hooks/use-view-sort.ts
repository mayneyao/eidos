import { useCallback } from "react"

import { rewriteQuery2getSortedRowIds } from "@/lib/sqlite/sql-sort-parser"

import { useSqlite } from "./use-sqlite"

export const useViewSort = (query: string) => {
  const { sqlite } = useSqlite()
  const getViewSortedRowIds = useCallback(async () => {
    if (!sqlite || !query) return []
    const res = await sqlite.sql4mainThread(rewriteQuery2getSortedRowIds(query))
    const rowIds = res.map((item) => item[0])
    return rowIds
  }, [query, sqlite])

  return {
    getViewSortedRowIds,
  }
}
