import { useCallback } from "react"

import { rewriteQuery2getSortedRowIds } from "@/lib/sqlite/sql-sort-parser"

import { useSqlite } from "./use-sqlite"

export const useViewSort = (query: string) => {
  const { sqlite } = useSqlite()
  const getViewSortedRows = useCallback(async () => {
    if (!sqlite || !query) return []
    return await sqlite.sql4mainThread2(rewriteQuery2getSortedRowIds(query))
  }, [query, sqlite])

  return {
    getViewSortedRows,
  }
}
