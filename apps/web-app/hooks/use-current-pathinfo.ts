import { useParams, useSearchParams } from "react-router-dom"

import { getRawTableNameById } from "@/lib/utils"

import { useCurrentNode } from "./use-current-node"
import { isInkServiceMode } from "@/lib/env"
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import { useCurrentSpaceId } from "./use-current-space"

export const useCurrentPathInfo = () => {
  let { database, table } = useParams()
  const currentNode = useCurrentNode()
  let [searchParams, setSearchParams] = useSearchParams()
  const viewId = searchParams.get("v")
  const currentSpaceId = useCurrentSpaceId()
  
  // Prioritize workspace ID detected from subdomain
  if (currentSpaceId) {
    database = currentSpaceId
  } else if (isInkServiceMode) {
    database = "~"
  }
  
  // Ensure database is not undefined
  if (!database) {
    console.warn('No database/space ID detected, this may cause SQLite errors');
    database = "default"; // Provide a default value
  }

  switch (currentNode?.type) {
    case TreeNodeType.Dataview:
      return {
        database,
        space: database!,
        tableName: table ? getRawTableNameById(table, true) : "",
        tableId: table,
        viewId,
      }
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
