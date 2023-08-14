import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { useTable } from "@/hooks/use-table"

export const useView = () => {
  const { tableId, tableName, space } = useCurrentPathInfo()
  const { updateViews } = useTable(tableName!, space)
  const { sqlite } = useSqlite()
  const addView = async () => {
    if (tableId && sqlite) {
      const view = await sqlite.createDefaultView(tableId)
      await updateViews()
      return view
    }
  }
  const delView = async (viewId: string) => {
    if (sqlite) {
      await sqlite.delView(viewId)
      await updateViews()
    }
  }
  return {
    addView,
    delView,
  }
}

export const useCurrentView = () => {
  const { tableName, space } = useCurrentPathInfo()
  const { views } = useTable(tableName!, space)
  const defaultViewId = useMemo(() => {
    return views[0]?.id
  }, [views])

  const [currentViewId, setCurrentViewId] = useState<string | undefined>(
    defaultViewId
  )
  let [searchParams, setSearchParams] = useSearchParams()
  const v = searchParams.get("v")

  useEffect(() => {
    if (v) {
      setCurrentViewId(v)
    } else {
      setCurrentViewId(defaultViewId)
    }
  }, [defaultViewId, setSearchParams, v])

  const currentView = useMemo(() => {
    return views.find((v) => v.id === currentViewId)
  }, [views, currentViewId])

  return {
    currentView,
    setCurrentViewId,
    defaultViewId,
  }
}
