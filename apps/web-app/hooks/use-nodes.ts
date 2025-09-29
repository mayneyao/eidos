import type { ITreeNode} from "@/packages/core/types/ITreeNode";
import { TreeNodeType } from "@/packages/core/types/ITreeNode"

import { useSqlite } from "./use-sqlite"
import { useNodeStore } from "@/apps/web-app/store/node-store"

export const useAllNodes = (opts?: {
  isDeleted?: boolean
  parent_id?: string
  type?: ITreeNode["type"] | ITreeNode["type"][]
}) => {
  const { nodeIds, nodeMap } = useNodeStore()
  const { isDeleted = false, type, parent_id } = opts || {}
  const types = type
    ? Array.isArray(type)
      ? type
      : [type]
    : [TreeNodeType.Table, TreeNodeType.Doc, TreeNodeType.Folder, TreeNodeType.Dataview]

  if (isDeleted) {
    return nodeIds
      .map((id) => nodeMap[id])
      .filter((node) => node.is_deleted && (types.includes(node.type) || node.type.startsWith('ext__')))
  }
  return nodeIds
    .map((id) => nodeMap[id])
    .filter(
      (node) =>
        (types.includes(node.type) || node.type.startsWith('ext__')) &&
        !node.is_deleted &&
        (parent_id ? node.parent_id === parent_id : true)
    )
}

export const useNode = () => {
  const { sqlite } = useSqlite()
  const { addNode, delNode } = useNodeStore()

  const updateIcon = async (id: string, icon: string) => {
    await sqlite?.tree.set(id, {
      icon,
    })
    // State will be updated automatically via database triggers
  }

  const updatePosition = async (id: string, position: number) => {
    await sqlite?.tree.updateNodePosition(id, position)
    // State will be updated automatically via database triggers
  }

  const updateCover = async (id: string, cover: string) => {
    await sqlite?.tree.set(id, {
      cover,
    })
    // State will be updated automatically via database triggers
  }

  const updateHideProperties = async (id: string, hideProperties: boolean) => {
    await sqlite?.tree.set(id, {
      hide_properties: hideProperties,
    })
    // State will be updated automatically via database triggers
  }

  const moveIntoTable = async (
    nodeId: string,
    tableId: string,
    parentId?: string
  ) => {
    if (!sqlite) return
    await sqlite.tree.moveIntoTable(nodeId, tableId, parentId)
    // State will be updated automatically via database triggers
  }

  const updateParentId = async (
    id: string,
    parentId?: string,
    opts?: {
      targetId: string
      targetDirection: "up" | "down"
    }
  ) => {
    if (id == parentId) {
      return
    }
    await sqlite?.tree.nodeChangeParent(id, parentId, opts)
    // State will be updated automatically via database triggers
  }

  const pin = (id: string) => {
    if (!sqlite) {
      return
    }
    sqlite?.tree.pinNode(id, true)
    // State will be updated automatically via database triggers
  }

  const unpin = (id: string) => {
    if (!sqlite) {
      return
    }
    sqlite?.tree.pinNode(id, false)
    // State will be updated automatically via database triggers
  }

  return {
    updateIcon,
    updateCover,
    updatePosition,
    updateParentId,
    updateHideProperties,
    moveIntoTable,
    addNode,
    delNode,
    pin,
    unpin,
  }
}

