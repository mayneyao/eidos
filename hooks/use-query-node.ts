import { useCallback } from "react"

import { ISearchNodes } from "@/components/cmdk/hooks"

import { useNodeMap } from "./use-current-node"
import { useCurrentPathInfo } from "./use-current-pathinfo"
import { useSqlite } from "./use-sqlite"

export const useQueryNode = () => {
  const { space } = useCurrentPathInfo()
  const { sqlite } = useSqlite(space)
  const nodeMap = useNodeMap()
  const queryNodes = async (q: string): Promise<ISearchNodes[] | undefined> => {
    if (!sqlite) return
    const nodes = await sqlite.listTreeNodes(q, true)
    return nodes.map((item) => ({
      ...item,
      mode: "node",
    }))
  }

  const fullTextSearch = async (
    q: string
  ): Promise<ISearchNodes[] | undefined> => {
    if (!sqlite) return
    const queryResults = await sqlite.fullTextSearch(q)
    const res = queryResults.map((item) => {
      const node = nodeMap[item.id]
      // 2023-11-05
      if (item.id.length === 10) {
        return {
          ...item,
          name: item.id,
          type: "doc",
          parent_id: null,
          is_pinned: false,
          mode: "fts",
        }
      }
      return {
        mode: "fts",
        ...node,
        ...item,
      }
    })
    return res as ISearchNodes[]
  }
  const getNode = useCallback(
    async (id: string) => {
      if (!sqlite) return
      const node = await sqlite.getTreeNode(id)
      return node
    },
    [sqlite]
  )
  return { queryNodes, getNode, fullTextSearch }
}
