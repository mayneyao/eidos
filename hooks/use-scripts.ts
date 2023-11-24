import { useEffect, useState } from "react"
import { IScript } from "@/worker/meta_table/script"

import { useSqlite } from "./use-sqlite"

export const useScripts = (space: string) => {
  const [scripts, setScripts] = useState<IScript[]>([])
  const { sqlite } = useSqlite(space)

  useEffect(() => {
    if (!sqlite) return
    sqlite.listScripts().then((res) => {
      setScripts(res)
    })
  }, [space, sqlite])

  return scripts
}
