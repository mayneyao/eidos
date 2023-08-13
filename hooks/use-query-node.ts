import { useCurrentPathInfo } from "./use-current-pathinfo"
import { useSqlite } from "./use-sqlite"

export const useQueryNode = () => {
  const { space } = useCurrentPathInfo()
  const { sqlite } = useSqlite(space)
  const queryNodes = async (q: string) => {
    if (!sqlite) return
    const nodes = await sqlite.listTreeNodes(q, true)
    return nodes
  }
  const getNode = async (id: string) => {
    if (!sqlite) return
    const node = await sqlite.getTreeNode(id)
    return node
  }
  return { queryNodes, getNode }
}
