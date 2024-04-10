import { useEffect, useState } from "react"
import { IAction } from "@/worker/web-worker/meta-table/action"

import { useSqlite } from "./use-sqlite"

export const useActions = (space: string) => {
  const [actions, setActions] = useState<IAction[]>([])
  const { sqlite } = useSqlite(space)

  useEffect(() => {
    if (!sqlite) return
    sqlite.listActions().then((res) => {
      setActions(res)
    })
  }, [space, sqlite])

  return actions
}
