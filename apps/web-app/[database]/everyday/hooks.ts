import { useCallback, useEffect, useState, useTransition } from "react"

import { getToday } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"

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
      const existDays = days.map((d: any) => d.id)
      const todayIndex = existDays.indexOf(today)
      let _days: IDay[] = days
      if (todayIndex == -1) {
        _days = [
          {
            id: today,
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
