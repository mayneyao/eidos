import { useParams } from "next/navigation"

import { getRawTableNameById } from "@/lib/utils"

import { useCurrentNodeType } from "./use-node-type"

export const useCurrentPathInfo = () => {
  const { database, table } = useParams()

  const currentNodeType = useCurrentNodeType()
  const hasTable = currentNodeType === "table"
  const hasDoc = currentNodeType === "doc"

  if (hasTable) {
    return {
      database,
      space: database,
      // space = database
      // rawTableName stored in sqlite
      tableName: table ? getRawTableNameById(table) : "",
      // tableId = table
      tableId: table,
    }
  }
  if (hasDoc) {
    return {
      database,
      space: database,
      docId: table,
    }
  }

  return {
    database,
    space: database,
    // space = database
    // rawTableName stored in sqlite
    tableName: "",
    // tableId = table
    tableId: table,
  }
}
