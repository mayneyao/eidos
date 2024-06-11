import { useEffect, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"

import { useSqlite } from "@/hooks/use-sqlite"

export const useAllScripts = () => {
  const { sqlite } = useSqlite()

  const [scripts, setScripts] = useState<IScript[]>([])
  useEffect(() => {
    if (!sqlite) {
      return
    }
    const fetchScripts = async () => {
      const scripts = await sqlite?.script.list({
        type: "script",
        enabled: true,
      })
      setScripts(scripts)
    }
    fetchScripts()
  }, [sqlite])

  return scripts
}
