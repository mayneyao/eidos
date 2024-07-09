import { useEffect, useState } from "react"

import { useSqlite } from "@/hooks/use-sqlite"

export const useTableCount = (tableName: string) => {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const { sqlite } = useSqlite()

  useEffect(() => {
    setLoading(true)
    console.time("count")
    sqlite?.sql4mainThread(`select count(*) from ${tableName}`).then((res) => {
      setCount(res[0][0])
      setLoading(false)
      console.timeEnd("count")
    })
  }, [sqlite, tableName])

  return {
    count,
    setCount,
    loading,
  }
}
