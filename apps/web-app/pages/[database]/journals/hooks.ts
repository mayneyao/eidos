import { useCallback, useEffect, useState } from "react"

import { getToday } from "@/lib/utils"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

type IDay = {
  id: string
}
const EachPageSize = 7

export const useDays = () => {
  const { sqlite } = useSqlite()
  const [years, setYears] = useState<number[]>([])
  const [days, setDays] = useState<Date[]>([])
  useEffect(() => {
    sqlite?.listAllDays().then((days) => {
      setDays(days.map((d: any) => new Date(d.id)))
    })
  }, [sqlite])
  useEffect(() => {
    if (days.length) {
      const minDay = days.reduce((prev, cur) => {
        return new Date(prev).getTime() < new Date(cur).getTime() ? prev : cur
      })
      const startYear = minDay.getFullYear()
      const endYear = new Date().getFullYear()
      const years: number[] = []
      for (let i = startYear; i <= endYear; i++) {
        years.push(i)
      }
      setYears(years.reverse())
    }
  }, [days])
  return {
    days,
    years,
  }
}

export const useAllDays = (spaceName: string) => {
  const [days, setDays] = useState<IDay[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [loading, setLoading] = useState(false)
  const { sqlite } = useSqlite(spaceName)

  const loadMore = useCallback(async () => {
    if (loading) return // Prevent multiple simultaneous loads

    setLoading(true)
    try {
      const res = await sqlite?.listDays(currentPage + 1)

      if (!res?.length) {
        setHasNextPage(false)
        return
      }

      setDays((prevDays) => {
        const existingIds = new Set(prevDays.map((d: IDay) => d.id))
        const newDays = res.filter((d: IDay) => !existingIds.has(d.id))

        // Since we're loading in reverse chronological order, we can just append to the end
        // No need to sort the entire array every time
        return [...prevDays, ...newDays]
      })

      setCurrentPage(currentPage + 1)
      if (res.length < EachPageSize) {
        setHasNextPage(false)
      }
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [currentPage, sqlite, loading])

  useEffect(() => {
    const today = getToday()
    sqlite?.listDays(0).then(async (days) => {
      const existDays = days.map((d: any) => d.id)
      const todayIndex = existDays.indexOf(today)
      let _days: IDay[] = [...days]

      if (todayIndex === -1) {
        _days.push({
          id: today,
        })
      }

      _days.sort((a, b) => {
        return new Date(b.id).getTime() - new Date(a.id).getTime()
      })

      setDays(_days)
    })
  }, [spaceName, sqlite])

  return {
    loading,
    error,
    days,
    hasNextPage,
    loadMore,
  }
}
