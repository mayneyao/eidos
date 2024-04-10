import { useEffect, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"

import { useSqlite } from "./use-sqlite"

export const useScripts = (space: string) => {
  const [scripts, setScripts] = useState<IScript[]>([])
  const { sqlite } = useSqlite(space)

  useEffect(() => {
    if (!sqlite) return
    sqlite.listScripts("enabled").then((res) => {
      setScripts(res)
    })
  }, [space, sqlite])

  return scripts
}
