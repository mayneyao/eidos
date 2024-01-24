import { useSqlite, useSqliteStore } from "./use-sqlite"

export const useNodeTree = () => {
  const { setNode, addNode, delNode } = useSqliteStore()
  const { sqlite } = useSqlite()
  const pin = (id: string) => {
    if (!sqlite) {
      return
    }
    sqlite?.pinNode(id, true)
    setNode({
      id,
      is_pinned: true,
    })
  }
  const unpin = (id: string) => {
    if (!sqlite) {
      return
    }
    sqlite?.pinNode(id, false)
    setNode({
      id,
      is_pinned: false,
    })
  }
  return {
    setNode,
    addNode,
    delNode,
    pin,
    unpin,
  }
}
