import { useCallback, useMemo } from "react"
import { useParams } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { isDayPageId } from "@/lib/utils"

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

export type INodePath = ITreeNode & { path?: string }
export const useCurrentNodePath = ({
  nodeId,
  parentId,
}: {
  nodeId: string
  parentId?: string
}) => {
  const allNodesMap = useNodeMap()
  const getNode = useCallback(
    (nodeId: string) => {
      let node = nodeId && (allNodesMap[nodeId] as INodePath)
      if (isDayPageId(nodeId)) {
        node = {
          id: nodeId,
          name: nodeId,
          type: "doc",
          path: `everyday/${nodeId}`,
        }
      }
      return node
    },
    [allNodesMap]
  )
  const parentNodePath = useMemo(() => {
    const node = getNode(nodeId!)
    if (!node) return []
    const path = [node]
    let parent = parentId && getNode(parentId)
    while (parent) {
      path.unshift(parent)
      if (parent.parent_id) {
        // if parentId is "yyyy-mm-dd" then it's a date node
        parent = getNode(parent.parent_id)
      } else {
        break
      }
    }
    return path
  }, [getNode, nodeId, parentId])
  return parentNodePath
}
