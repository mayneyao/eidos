import { useSqlite, useSqliteStore } from "./use-sqlite"

export const useAllNodes = (opts?: {
  isDeleted?: boolean
  type?: "table" | "doc"
}) => {
  const { nodeIds, nodeMap } = useSqliteStore((state) => state.dataStore)
  const { isDeleted = false, type } = opts || {}
  const types = type ? [type] : ["table", "doc"]

  if (isDeleted) {
    return nodeIds
      .map((id) => nodeMap[id])
      .filter((node) => node.is_deleted && types.includes(node.type))
  }
  return nodeIds
    .map((id) => nodeMap[id])
    .filter((node) => types.includes(node.type) && !node.is_deleted)
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

  return {
    updateIcon,
    updateCover,
    updatePosition,
    updateHideProperties,
    moveIntoTable,
  }
}
