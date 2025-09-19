import { useSqlite } from "./use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"

export const useNodeTree = () => {
  const { setNode, addNode, delNode } = useSqliteStore()
  const { sqlite } = useSqlite()
  const pin = (id: string) => {
    if (!sqlite) {
      return
    }
    sqlite?.tree.pinNode(id, true)
    setNode({
      id,
      is_pinned: true,
    })
  }
  const unpin = (id: string) => {
    if (!sqlite) {
      return
    }
    sqlite?.tree.pinNode(id, false)
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
