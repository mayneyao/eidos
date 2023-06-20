import { useMemo } from "react"
import { useParams } from "next/navigation"

import { IFileNode, useSqliteStore } from "./use-sqlite"

export const useCurrentNodeType = () => {
  const { database, table } = useParams()

  const { allNodes } = useSqliteStore()
  const nodeMap = useMemo(() => {
    return allNodes.reduce((acc, cur) => {
      acc[cur.id] = cur
      return acc
    }, {} as Record<string, IFileNode>)
  }, [allNodes])

  return nodeMap[table]?.type ?? "unknown"
}
