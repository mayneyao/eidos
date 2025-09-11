import { useEffect, useState } from "react"
import type { IAction } from "@/packages/core/meta-table/action"

import { useSqlite } from "./use-sqlite"

export const useActions = (space: string) => {
  const [actions, setActions] = useState<IAction[]>([])
  const { sqlite } = useSqlite(space)

  useEffect(() => {
    if (!sqlite) return
    sqlite.action.list().then((res) => {
      setActions(res)
    })
  }, [space, sqlite])

  return actions
}
