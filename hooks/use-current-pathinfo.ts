import { useParams } from "next/navigation"

import { getRawTableNameById } from "@/lib/utils"

export const useCurrentPathInfo = () => {
  const { database, table } = useParams()

  return {
    database,
    space: database,
    // space = database
    // rawTableName stored in sqlite
    tableName: table ? getRawTableNameById(table) : '',
    // tableId = table
    tableId: table,
  }
}
