import { useParams, useSearchParams } from "react-router-dom"

import { getRawTableNameById } from "@/lib/utils"

import { useCurrentNode } from "./use-current-node"

export const useCurrentPathInfo = () => {
  const { database, table } = useParams()
  const currentNode = useCurrentNode()
  let [searchParams, setSearchParams] = useSearchParams()
  const viewId = searchParams.get("v")

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
        viewId,
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
        viewId,
      }
  }
}
