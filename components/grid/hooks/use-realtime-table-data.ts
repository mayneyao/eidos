import { useEffect, useState } from "react"

import { useSqlite } from "@/hooks/use-sqlite"

export const useRealtimeTableData = (space: string, tableName: string) => {
  const { sqlite } = useSqlite()

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sqlite) return
    setLoading(true)
    sqlite.sql2`SELECT * FROM ${Symbol(tableName)}`.then((res) => {
      setData(res)
      setLoading(false)
    })
  }, [space, tableName, sqlite])

  return {
    data,
    loading,
  }
}
