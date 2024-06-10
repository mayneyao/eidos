import { useCallback, useMemo } from "react"
import { useParams } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { getWeek, isDayPageId, isWeekNodeId } from "@/lib/utils"

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
  nodeId?: string
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
          type: "day",
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
  if (!nodeId) return []
  if (isWeekNodeId(nodeId)) {
    const week = getWeek(nodeId)
    const year = nodeId.slice(0, 4)
    const formattedWeek = week.toString().padStart(2, "0")
    return [
      {
        id: year,
        name: `Year ${year}`,
        path: `everyday?year=${year}`,
        type: null,
      },
      {
        id: week.toString(),
        name: `Week ${week}`,
        type: null,
        path: `everyday/${year}-w${formattedWeek}`,
      },
    ]
  }
  if (isDayPageId(nodeId)) {
    const week = getWeek(nodeId)
    const year = nodeId.slice(0, 4)
    const formattedWeek = week.toString().padStart(2, "0")

    return [
      {
        id: year,
        name: `Year ${year}`,
        path: `everyday?year=${year}`,
        type: null,
      },
      {
        id: week.toString(),
        name: `Week ${week}`,
        type: null,
        path: `everyday/${year}-w${formattedWeek}`,
      },
      {
        id: nodeId,
        name: nodeId,
        type: "day",
        path: `everyday/${nodeId}`,
      },
    ]
  }

  return parentNodePath
}
