import { useCallback, useEffect, useState } from "react"

import { opfsDocManager } from "@/lib/opfs"

const getToday = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = (today.getMonth() + 1).toString().padStart(2, "0")
  const day = today.getDate().toString().padStart(2, "0")
  const date = `${year}-${month}-${day}`
  return date
}

const EachPageSize = 7
export const useAllDays = (spaceName: string) => {
  const [days, setDays] = useState<string[]>([])
  const [daysContent, setDaysContent] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const hasNextPage = days.length > daysContent.length

  const loadMore = useCallback(async () => {
    const _days = days.slice(
      currentPage * EachPageSize,
      (currentPage + 1) * EachPageSize
    )
    setLoading(true)
    const res = await Promise.all(
      _days.map(async (day) => {
        return opfsDocManager.getDocContent([
          "spaces",
          spaceName,
          "everyday",
          day + ".md",
        ])
      })
    )
    setDaysContent((daysContent) => {
      return [...daysContent, ...res]
    })
    setLoading(false)
    setCurrentPage(currentPage + 1)
  }, [currentPage, days, spaceName])

  useEffect(() => {
    const today = getToday()
    opfsDocManager
      .listDir(["spaces", spaceName, "everyday"])
      .then(async (days: FileSystemFileHandle[]) => {
        const existDays = days.map((d) => d.name.split(".")[0])
        const todayIndex = existDays.indexOf(today)
        let _days: string[]
        if (todayIndex > -1) {
          const beforeToday = existDays.slice(todayIndex + 1)
          _days = [today, ...beforeToday]
        } else {
          _days = [today, ...existDays]
        }
        setDays(_days)
        const res = await Promise.all(
          _days.slice(0, EachPageSize).map(async (day) => {
            return opfsDocManager.getDocContent([
              "spaces",
              spaceName,
              "everyday",
              day + ".md",
            ])
          })
        )
        setDaysContent((daysContent) => {
          return [...daysContent, ...res]
        })
      })
  }, [spaceName])

  return {
    loading,
    error,
    days,
    items: daysContent,
    hasNextPage,
    loadMore,
  }
}
