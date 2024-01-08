import { useMemo } from "react"
import { useParams } from "react-router-dom"

import { useSqliteStore } from "./use-sqlite"

export const useNodeMap = () => {
  const {
    dataStore: { nodeMap },
  } = useSqliteStore()
  return nodeMap
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
