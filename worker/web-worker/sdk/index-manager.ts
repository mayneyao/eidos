import { getColumnIndexName } from "@/lib/utils"

import { DataSpace } from "../DataSpace"
import { TableManager } from "./table"

export class IndexManager {
  dataSpace: DataSpace

  tableManager: TableManager

  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
    this.tableManager = table
  }

  async createIndex(column: string, onStart?: () => void, onEnd?: () => void) {
    const indexName = getColumnIndexName(this.table.rawTableName, column)

    // Query to check if the index already exists
    const checkIndexExistsQuery = `
      SELECT name FROM sqlite_master 
      WHERE type='index' AND name='${indexName}'`

    try {
      const indexExists = await this.dataSpace.syncExec2(checkIndexExistsQuery)

      // If the index does not exist, create it
      if (indexExists.length === 0) {
        onStart && onStart()
        this.dataSpace.exec(
          `CREATE INDEX ${indexName} ON ${this.table.rawTableName} (${column})`
        )
        onEnd && onEnd()
        console.log(`Index ${indexName} created.`)
      } else {
        console.log(`Index ${indexName} already exists.`)
      }
    } catch (e) {
      console.error(e)
    }
  }
}
