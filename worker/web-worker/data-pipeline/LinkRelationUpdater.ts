import { getTableIdByRawTableName } from "@/lib/utils"

import { DataSpace } from "../DataSpace"
import { TableManager } from "../sdk/table"

export class LinkRelationUpdater {
  needUpdateCell: Record<string, Record<string, Set<string>>>
  constructor(private dataSpace: DataSpace) {
    this.needUpdateCell = {}
    // every 1s, check if there is any cell need to be updated
    setInterval(() => {
      this.updateCells()
    }, 100)
  }

  updateCells = async () => {
    for (const tableName in this.needUpdateCell) {
      console.log("updateCells", tableName)
      const tableId = getTableIdByRawTableName(tableName)
      const tm = new TableManager(tableId, this.dataSpace)
      for (const tableColumnName in this.needUpdateCell[tableName]) {
        const rowIds = Array.from(
          this.needUpdateCell[tableName][tableColumnName]
        )
        await tm.fields.link.updateLinkCell(
          tableName,
          tableColumnName,
          rowIds
        )
      }
    }
    this.needUpdateCell = {}
  }

  addCell = (tableName: string, tableColumnName: string, rowId: string) => {
    if (!this.needUpdateCell[tableName]) {
      this.needUpdateCell[tableName] = {}
    }
    if (!this.needUpdateCell[tableName][tableColumnName]) {
      this.needUpdateCell[tableName][tableColumnName] = new Set()
    }
    this.needUpdateCell[tableName][tableColumnName].add(rowId)
    console.log("addCell", this.needUpdateCell)
  }
}
