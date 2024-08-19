import { IScript } from "@/worker/web-worker/meta-table/script"
import { useEffect, useState } from "react"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { DocBlock } from "../blocks/interface"

export type ExtBlock = DocBlock
export const useExtBlocks = () => {
  const [extBlocks, setExtBlocks] = useState<ExtBlock[]>([])

  useEffect(() => {
    const extBlocks = ((window as any).__DOC_EXT_BLOCKS as ExtBlock[]) || []
    setExtBlocks(extBlocks)
  }, [])
  return extBlocks
}

export const useEnabledExtBlocks = () => {
  const { space } = useCurrentPathInfo()
  const [scripts, setScripts] = useState<IScript[]>([])
  const [loading, setLoading] = useState(true)
  const { sqlite } = useSqlite()
  useEffect(() => {
    if (!sqlite) return
    sqlite?.listScripts("enabled").then((res) => {
      setScripts(
        res.filter((script) => script.type === "block" && script.enabled)
      )
      setLoading(false)
    })
  }, [space, sqlite])

  return {
    loading,
    scripts,
  }
}
