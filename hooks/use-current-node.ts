import { useMemo } from "react"
import { ITreeNode } from "@/worker/meta_table/tree"
import { useParams } from "react-router-dom"

import { useSqliteStore } from "./use-sqlite"

export const useNodeMap = () => {
  const allNodes = useSqliteStore((state) => state.allNodes)
  const allNodesMap = useMemo(() => {
    return allNodes.reduce((acc, cur) => {
      acc[cur.id] = cur
      return acc
    }, {} as Record<string, ITreeNode>)
  }, [allNodes])
  return allNodesMap
}

export const useCurrentNode = () => {
  const { table: nodeId } = useParams()
  const allNodesMap = useNodeMap()

  return nodeId ? allNodesMap[nodeId] : null
}

export const useCurrentNodePath = () => {
  const { table: nodeId } = useParams()
  const allNodesMap = useNodeMap()
  const parentNodePath = useMemo(() => {
    const node = nodeId && allNodesMap[nodeId]
    if (!node) return []
    const path = [node]
    let parent = node.parentId && allNodesMap[node.parentId]
    while (parent) {
      path.unshift(parent)
      if (parent.parentId) {
        parent = allNodesMap[parent.parentId]
      } else {
        break
      }
    }
    return path
  }, [allNodesMap, nodeId])
  return parentNodePath
}
