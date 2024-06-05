import { ITreeNode } from "@/lib/store/ITreeNode"

import { useSqlite, useSqliteStore } from "./use-sqlite"

export const useAllNodes = (opts?: {
  isDeleted?: boolean
  parent_id?: string
  type?: ITreeNode["type"] | ITreeNode["type"][]
}) => {
  const { nodeIds, nodeMap } = useSqliteStore((state) => state.dataStore)
  const { isDeleted = false, type, parent_id } = opts || {}
  const types = type
    ? Array.isArray(type)
      ? type
      : [type]
    : ["table", "doc", "folder"]

  if (isDeleted) {
    return nodeIds
      .map((id) => nodeMap[id])
      .filter((node) => node.is_deleted && types.includes(node.type))
  }
  return nodeIds
    .map((id) => nodeMap[id])
    .filter(
      (node) =>
        types.includes(node.type) &&
        !node.is_deleted &&
        (parent_id ? node.parent_id === parent_id : true)
    )
}

export const useNode = () => {
  const { sqlite } = useSqlite()
  const {
    setNode,
    dataStore: { nodeMap },
  } = useSqliteStore()

  const updateIcon = async (id: string, icon: string) => {
    await sqlite?.tree.set(id, {
      icon,
    })
    setNode({
      id,
      icon,
    })
  }

  const updatePosition = async (id: string, position: number) => {
    await sqlite?.updateTreeNodePosition(id, position)
    setNode({
      id,
      position,
    })
  }

  const updateCover = async (id: string, cover: string) => {
    await sqlite?.tree.set(id, {
      cover,
    })
    setNode({
      id,
      cover,
    })
  }

  const updateHideProperties = async (id: string, hideProperties: boolean) => {
    await sqlite?.tree.set(id, {
      hide_properties: hideProperties,
    })
    setNode({
      id,
      hide_properties: hideProperties,
    })
  }

  const moveIntoTable = async (
    nodeId: string,
    tableId: string,
    parentId?: string
  ) => {
    if (!sqlite) return
    await sqlite.moveDraftIntoTable(nodeId, tableId, parentId)
    setNode({
      id: nodeId,
      parent_id: tableId,
    })
  }

  const updateParentId = async (id: string, parentId: string) => {
    if (id == parentId) {
      return
    }
    await sqlite?.nodeChangeParent(id, parentId)
    setNode({
      id,
      parent_id: parentId,
    })
  }

  return {
    updateIcon,
    updateCover,
    updatePosition,
    updateParentId,
    updateHideProperties,
    moveIntoTable,
  }
}
