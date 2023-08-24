import { useSqliteStore } from "./use-sqlite"

export const useNodeTree = () => {
  const { setNode, addNode, delNode } = useSqliteStore()
  return {
    setNode,
    addNode,
    delNode,
  }
}
