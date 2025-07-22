import { useEffect, useState } from "react"
import type { IExtension } from "@/packages/core/types/IExtension"

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

export const useAllScripts = () => {
  const { sqlite } = useSqlite()

  const [scripts, setScripts] = useState<IExtension[]>([])
  useEffect(() => {
    if (!sqlite) {
      return
    }
    const fetchScripts = async () => {
      try {
        // Use the extension table instead of the deprecated script property
        const scriptExtensions = await sqlite.extension.getScriptExtensions()
        setScripts(scriptExtensions)
      } catch (error) {
        console.error("Failed to fetch script extensions:", error)
        setScripts([])
      }
    }
    fetchScripts()
  }, [sqlite])

  return scripts
}

