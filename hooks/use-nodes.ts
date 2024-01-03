import { useSqlite, useSqliteStore } from "./use-sqlite"

export const useNode = () => {
  const { sqlite } = useSqlite()
  const { setNode } = useSqliteStore()
  const updateIcon = async (id: string, icon: string) => {
    await sqlite?.tree.set(id, {
      icon,
    })
    setNode({
      id,
      icon,
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

  return {
    updateIcon,
    updateCover,
  }
}
