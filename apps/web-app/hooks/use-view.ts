import { useState, useEffect } from "react"
import { useSqlite } from "./use-sqlite"
import type { IView } from "@/packages/core/types/IView"

export const useView = ({ viewId }: { viewId?: string }) => {
  const [view, setView] = useState<IView | null>(null)
  const { sqlite } = useSqlite()

  useEffect(() => {
    if (!sqlite || !viewId) return

    sqlite.view.get(viewId).then((result) => {
      setView(result)
    })
  }, [sqlite, viewId])

  return view
}
