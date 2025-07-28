import { useCallback, useMemo } from "react"
import { useParams } from "react-router-dom"

import type { ITreeNode } from "@/packages/core/types/ITreeNode";
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import { getWeek, isDayPageId, isWeekNodeId } from "@/lib/utils"

import { useExtensionByIdOrSlug } from "@/apps/web-app/hooks/use-extension"
import { useSqliteStore } from "./use-sqlite"
import { EIDOS_CHAT_PROJECT_ID } from "@/lib/const"
import { useAllExtNodes } from "./use-all-ext-nodes"

export const useNodeMap = () => {
  const {
    dataStore: { nodeMap },
  } = useSqliteStore()
  return nodeMap
}

export const useCurrentNode = (): ITreeNode | null => {
  const { table: nodeId, day } = useParams()
  const allNodesMap = useNodeMap()
  if (day && isDayPageId(day)) {
    return {
      id: day,
      name: day,
      type: TreeNodeType.Doc,
    }
  }
  return nodeId ? allNodesMap[nodeId] : null
}

export const useCurrentExtension = () => {
  const { scriptId: extensionId } = useParams()
  const extension = useExtensionByIdOrSlug(extensionId!)
  return extension
}


export const useCurrentExtNodeHandleBlockId = () => {
  const node = useCurrentNode()
  const { extNodes } = useAllExtNodes()
  if (!node) return null
  if (!node.type.startsWith("ext__")) return null
  const nodeType = node.type.split('ext__')[1]
  const extNode = extNodes.find((extNode) =>
    extNode.meta?.extNode?.type === nodeType
  )
  if (!extNode) return null
  return extNode.id
}

/**
 * @returns the project id of the current chat project, default to EIDOS_CHAT_PROJECT_ID, if the current node is not an extension.
 */
export const useCurrentChatProjectId = () => {
  const extension = useCurrentExtension()
  if (extension) {
    return extension.id
  }
  return EIDOS_CHAT_PROJECT_ID
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
