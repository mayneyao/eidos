import { ITreeNode } from "@/worker/meta_table/tree"
import { useMemo } from "react"
import { useParams } from "react-router-dom"

import { useSqliteStore } from "./use-sqlite"

export const useCurrentNode = () => {
  const { allNodes } = useSqliteStore()
  const { database, table: nodeId } = useParams()

  const allNodesMap = useMemo(() => {
    return allNodes.reduce((acc, cur) => {
      acc[cur.id] = cur
      return acc
    }, {} as Record<string, ITreeNode>)
  }, [allNodes])

  return nodeId ? allNodesMap[nodeId] : null
}
