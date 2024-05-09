import { useCallback, useMemo } from "react"
import { v4 as uuidv4 } from "uuid"

import { allFieldTypesMap } from "@/lib/fields"
import { FieldType } from "@/lib/fields/const"
import { ColumnTableName } from "@/lib/sqlite/const"
import {
  checkSqlIsModifyTableData,
  checkSqlIsModifyTableSchema,
  checkSqlIsOnlyQuery,
} from "@/lib/sqlite/helper"
import {
  generateColumnName,
  getTableIdByRawTableName,
  shortenId,
} from "@/lib/utils"
import { RowRange } from "@/components/grid/hooks/use-async-data"
import { useSpaceAppStore } from "@/app/[database]/store"

import { IField } from "../lib/store/interface"
import { useSqlWorker } from "./use-sql-worker"
import { useSqliteStore } from "./use-sqlite"
import { useUiColumns } from "./use-ui-columns"

export const useTableFields = (
  tableIdOrName: string | undefined,
  databaseName: string
) => {
  const {
    dataStore: { tableMap },
  } = useSqliteStore()
  // console.log({ tableId })
  const nodeId = useMemo(() => {
    if (tableIdOrName?.startsWith("tb_")) {
      return tableIdOrName?.replace("tb_", "")
    }
    return tableIdOrName
  }, [tableIdOrName])
  const node = tableMap[nodeId || ""]
  const fieldMap = node?.fieldMap
  const fields = useMemo(() => {
    return Object.values(fieldMap ?? {})
  }, [fieldMap])

  return {
    fields,
    fieldMap,
  }
}

export const useTableViews = (tableId: string, databaseName: string) => {
  const {
    dataStore: { tableMap },
  } = useSqliteStore()
  const node = tableMap[tableId]
  const viewIds = node?.viewIds
  const viewMap = node?.viewMap
  return viewIds?.map((id) => viewMap[id]) ?? []
}

export const useTableOperation = (tableName: string, databaseName: string) => {
  const sqlite = useSqlWorker()
  const { setViews, setNode, setRows } = useSqliteStore()
  const tableId = getTableIdByRawTableName(tableName)
  const rowMap = useSqliteStore(
    (state) => state.dataStore.tableMap?.[tableId]?.rowMap || {}
  )
  const views = useTableViews(tableId, databaseName)
  const { currentTableSchema: tableSchema } = useSpaceAppStore()
  const { uiColumnMap, updateUiColumns } = useUiColumns(tableName, databaseName)

  const updateViews = useCallback(async () => {
    if (!sqlite) return

    const res = await sqlite.listViews(tableId)
    setViews(tableId, res)
  }, [setViews, sqlite, tableId])

  const reload = useCallback(async () => {
    if (!tableName) return
  }, [tableName])

  const updateCell = async (rowId: string, fieldId: string, value: any) => {
    if (sqlite) {
      if (fieldId !== "_id") {
        await sqlite.setCell({
          tableId,
          rowId,
          fieldId,
          value,
        })
      }
      if (fieldId === "title") {
        const node = await sqlite.getTreeNode(shortenId(rowId))
        if (node) {
          await sqlite.updateTreeNodeName(node.id, value)
          setNode({
            id: node.id,
            name: value,
          })
        }
      }
      // get the updated value, but it will block ui update. expect to success if not throw error
      // const result2 = await sqlite.sql`SELECT ${filedName} FROM ${Symbol(tableName)} where _id = '${rowId}'`;
      // data[row][col] = result2[0]
    }
  }

  const updateFieldName = async (tableColumnName: string, newName: string) => {
    if (!sqlite) return
    await sqlite.sql`UPDATE ${Symbol(
      ColumnTableName
    )} SET name = ${newName} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`
    await updateUiColumns()
  }

  const changeFieldType = async (
    tableColumnName: string,
    newType: FieldType
  ) => {
    if (!sqlite) return
    await sqlite.changeColumnType(tableName, tableColumnName, newType)
    await updateUiColumns()
  }

  const updateFieldProperty = async (field: IField, property: any) => {
    if (!sqlite) return
    await sqlite.updateColumnProperty({
      tableName,
      tableColumnName: field.table_column_name,
      property,
      type: field.type,
    })
    await updateUiColumns()
  }

  const addField = async (
    fieldName: string,
    fieldType: FieldType,
    property?: any
  ) => {
    if (sqlite) {
      const tableColumnName = generateColumnName()
      const FieldClass = allFieldTypesMap[fieldType]
      const field = {
        name: fieldName,
        type: fieldType,
        table_name: tableName,
        table_column_name: tableColumnName,
        property: property || FieldClass.getDefaultFieldProperty(),
      }
      await sqlite.addColumn(field)
      await sqlite.onTableChange(databaseName, tableName)
      await updateUiColumns()
    }
  }

  const deleteField = async (tableColumnName: string) => {
    if (!sqlite) return
    const effectTables = await sqlite.deleteField(tableName, tableColumnName)
    for (const table of effectTables) {
      await updateUiColumns(table)
    }
  }

  const addRow = async (_uuid?: string) => {
    if (sqlite) {
      const { _id } = await sqlite.addRow(tableId, { _id: _uuid || uuidv4() })
      return _id
    }
  }

  const deleteRowsByRange = async (
    range: { startIndex: number; endIndex: number }[],
    tableName: string,
    query: string
  ) => {
    if (sqlite) {
      await sqlite.deleteRowsByRange(range, tableName, query)
    }
  }

  const runQuery = useCallback(
    async (querySql: string, _tableName = tableName) => {
      if (sqlite) {
        const res = await sqlite.runAIgeneratedSQL(querySql, _tableName)
        if (checkSqlIsModifyTableSchema(querySql)) {
        }
        if (checkSqlIsOnlyQuery(querySql)) {
          return res
        }
        if (checkSqlIsModifyTableData(querySql)) {
          if (querySql.includes("UPDATE")) {
          }
        }
        return res
      }
    },
    [sqlite, tableName]
  )

  const getRowData = useCallback(
    async (range: RowRange, query?: string): Promise<string[]> => {
      const [offset, limit] = range
      let data: any[] = []
      if (sqlite && tableName && uiColumnMap.size) {
        if (query) {
          data = await sqlite.sql4mainThread2(
            `${query} LIMIT ${limit} OFFSET ${offset}`
          )
        } else {
          data = await sqlite.sql2`SELECT * FROM ${Symbol(
            tableName
          )} LIMIT ${limit} OFFSET ${offset}`
        }
      }
      setRows(tableId, data)
      return data.map((row) => row._id)
    },
    [setRows, sqlite, tableId, tableName, uiColumnMap]
  )
  const getRowDataById = useCallback(
    (rowId: string) => {
      return rowMap[rowId]
    },
    [rowMap]
  )

  return {
    getRowData,
    getRowDataById,
    updateCell,
    addField,
    updateFieldName,
    changeFieldType,
    updateFieldProperty,
    deleteField,
    addRow,
    deleteRowsByRange,
    tableSchema,
    runQuery,
    reload,
    sqlite,
    views,
    updateViews,
  }
}
