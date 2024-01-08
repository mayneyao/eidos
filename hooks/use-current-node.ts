import { useCallback, useMemo } from "react"
import { useParams } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { isDayPage } from "@/lib/utils"

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

type INodePath = ITreeNode & { path?: string }
export const useCurrentNodePath = () => {
  const { table: nodeId } = useParams()
  const allNodesMap = useNodeMap()
  const getNode = useCallback(
    (nodeId: string) => {
      let parent = nodeId && (allNodesMap[nodeId] as INodePath)
      if (isDayPage(nodeId)) {
        parent = {
          id: nodeId,
          name: nodeId,
          type: "doc",
          path: `everyday/${nodeId}`,
        }
      }
      return parent
    },
    [allNodesMap]
  )
  const parentNodePath = useMemo(() => {
    const node = getNode(nodeId!)
    if (!node) return []
    const path = [node]
    let parent = node.parentId && getNode(node.parentId)
    while (parent) {
      path.unshift(parent)
      if (parent.parentId) {
        // if parentId is "yyyy-mm-dd" then it's a date node
        parent = getNode(parent.parentId)
      } else {
        break
      }
    }
    return path
  }, [getNode, nodeId])
  return parentNodePath
}
