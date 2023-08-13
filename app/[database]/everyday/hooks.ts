import { useCallback, useEffect, useState, useTransition } from "react"

import { useSqlite } from "@/hooks/use-sqlite"
import { getToday } from "@/lib/utils"

type IDay = {
  id: string
  content: string
}
const EachPageSize = 7
export const useAllDays = (spaceName: string) => {
  const [days, setDays] = useState<IDay[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [hasNextPage, setHasNextPage] = useState(true)
  const { sqlite } = useSqlite(spaceName)
  const [isPending, startTransition] = useTransition()

  const loadMore = useCallback(async () => {
    const res = await sqlite?.listDays(currentPage + 1)
    startTransition(() => {
      if (!res?.length) {
        setHasNextPage(false)
        return
      }
      setDays((days) => {
        return [...days, ...res]
      })
      setCurrentPage(currentPage + 1)
      if (res.length < EachPageSize) {
        setHasNextPage(false)
      }
    })
  }, [currentPage, sqlite])

  useEffect(() => {
    const today = getToday()
    sqlite?.listDays(0).then(async (days) => {
      const existDays = days.map((d) => d.id)
      const todayIndex = existDays.indexOf(today)
      let _days: IDay[] = days
      if (todayIndex == -1) {
        _days = [
          {
            id: today,
            content: "",
          },
          ...days,
        ]
      }
      setDays(_days)
    })
  }, [spaceName, sqlite])

  return {
    loading: isPending,
    error,
    days,
    hasNextPage,
    loadMore,
  }
}
