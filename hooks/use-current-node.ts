import { useMemo } from "react"
import {  useParams } from 'react-router-dom';


import { IFileNode, useSqliteStore } from "./use-sqlite"

export const useCurrentNode = () => {
  const { database, table } = useParams()

  const { allNodes } = useSqliteStore()
  const nodeMap = useMemo(() => {
    return allNodes.reduce((acc, cur) => {
      acc[cur.id] = cur
      return acc
    }, {} as Record<string, IFileNode>)
  }, [allNodes])

  return table ? nodeMap[table] : null
}
