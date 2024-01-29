import { getTableIdByRawTableName } from "@/lib/utils"

import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"

export class ComputeService {
  constructor(private dataSpace: DataSpace) {}

  getEffectCells = async (signal: {
    table: string
    rowId: string
    diff: Record<
      string,
      {
        old: any
        new: any
      }
    >
    diffKeys: string[]
  }) => {
    const { table, rowId, diffKeys } = signal
    const tableId = getTableIdByRawTableName(table)
    const tm = new TableManager(tableId, this.dataSpace)
    const effectRowsMap = await tm.fields.link.getEffectRows(table, [rowId])
    const effectFields = await Promise.all(
      diffKeys.map((key) =>
        this.dataSpace.reference.getEffectedFields(table, key)
      )
    )
    const effectFieldsMap = effectFields
      .flat()
      .reduce((acc: Record<string, string[]>, cur) => {
        if (!acc[cur.table_name]) {
          acc[cur.table_name] = []
        }
        acc[cur.table_name].push(cur.table_column_name)
        return acc
      }, {})

    Object.entries(effectRowsMap).forEach(([tableName, rowIds]) => {
      const tm = new TableManager(
        getTableIdByRawTableName(tableName),
        this.dataSpace
      )
      const fields = effectFieldsMap[tableName]
      console.log({
        tableName,
        rowIds,
        fields,
      })
      effectFieldsMap[tableName].forEach((field) => {
        tm.fields.lookup.updateColumn(tableName, field, rowIds)
      })
    })
  }
}
