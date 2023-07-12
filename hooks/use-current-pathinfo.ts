import { useParams } from "react-router-dom"

import { getRawTableNameById } from "@/lib/utils"

import { useCurrentNode } from "./use-current-node"

export const useCurrentPathInfo = () => {
  const { database, table } = useParams()
  const currentNode = useCurrentNode()

  switch (currentNode?.type) {
    case "table":
      return {
        database,
        space: database!,
        // space = database
        // rawTableName stored in sqlite
        tableName: table ? getRawTableNameById(table) : "",
        // tableId = table
        tableId: table,
      }
    case "doc":
      return {
        database,
        space: database!,
        docId: table,
      }
    default:
      // for old version
      return {
        database,
        space: database!,
        tableName: "",
        tableId: table,
      }
  }
}
