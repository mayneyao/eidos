import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

import { IFileNode, useSqlite } from "./use-sqlite"

export const useCurrentNode = () => {
  const [node, setNode] = useState<IFileNode | null>(null)
  const { database, table } = useParams()
  const { sqlite } = useSqlite(database)

  useEffect(() => {
    if (!sqlite || !table) {
      return
    }
    sqlite.getTreeNode(table).then((res) => {
      setNode(res)
    })
  }, [database, sqlite, table])
  return node
}
