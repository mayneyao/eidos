import { useSqlite, useSqliteStore } from "./use-sqlite"

export const useAllNodes = () => {
  const { nodeIds, nodeMap } = useSqliteStore((state) => state.dataStore)
  return nodeIds.map((id) => nodeMap[id])
  // why not work?
  // return useMemo(() => {
  //   return nodeIds.map((id) => nodeMap[id])
  // }, [nodeIds, nodeMap])
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
    console.log(nodeMap, id, icon)
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

  return {
    updateIcon,
    updateCover,
  }
}
