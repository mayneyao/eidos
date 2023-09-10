import { useCallback, useEffect } from "react"
import { IView } from "@/worker/meta_table/view"
import { v4 as uuidv4 } from "uuid"
import { create } from "zustand"

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

import { useCurrentNode } from "./use-current-node"
import { useSqlWorker } from "./use-sql-worker"
import { useSqlite, useSqliteStore } from "./use-sqlite"

// PRAGMA table_info('table_name') will return IColumn[]
export type IColumn = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string
  pk: number
}

export type IUIColumn = {
  name: string
  type: FieldType
  table_column_name: string
  table_name: string
  property: any
}

interface TableState {
  columns: IColumn[]
  uiColumns: IUIColumn[]

  views: IView[]
  setViews: (views: IView[]) => void

  setColumns: (columns: IColumn[]) => void
  setUiColumns: (columns: IUIColumn[]) => void
}

// not using persist
export const useTableStore = create<TableState>()((set) => ({
  columns: [],
  uiColumns: [],
  views: [],
  setViews: (views) => set({ views }),
  setColumns: (columns) => set({ columns }),
  setUiColumns: (uiColumns) => set({ uiColumns }),
}))

export const useTable = (tableName: string, databaseName: string) => {
  const { withTransaction } = useSqlite(databaseName)
  const sqlite = useSqlWorker()
  const { setNode } = useSqliteStore()
  const { setUiColumns, uiColumns, views, setViews } = useTableStore()
  const {
    count,
    setCount,
    currentTableSchema: tableSchema,
    setCurrentTableSchema: setTableSchema,
  } = useSpaceAppStore()

  const updateUiColumns = useCallback(async () => {
    if (!sqlite) return
    const res = await sqlite.listUiColumns(tableName)
    setUiColumns(res)
  }, [setUiColumns, sqlite, tableName])

  const updateViews = useCallback(async () => {
    if (!sqlite) return
    const tableId = getTableIdByRawTableName(tableName)
    const res = await sqlite.listViews(tableId)
    setViews(res)
  }, [setViews, sqlite, tableName])

  const reload = useCallback(async () => {
    if (!tableName) return
  }, [tableName])

  const updateCell = async (rowId: string, fieldName: string, value: any) => {
    if (sqlite) {
      if (fieldName !== "_id") {
        sqlite.sql`UPDATE ${Symbol(tableName)} SET ${Symbol(
          fieldName
        )} = ${value} WHERE _id = ${rowId}`
      }
      if (fieldName === "title") {
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
    await sqlite.sql`UPDATE ${Symbol(
      ColumnTableName
    )} SET type = ${newType} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`
    await updateUiColumns()
  }

  const updateFieldProperty = async (field: IUIColumn, property: any) => {
    if (!sqlite) return
    await sqlite.updateColumnProperty({
      tableName,
      tableColumnName: field.table_column_name,
      property,
      isFormula: field.type === FieldType.Formula,
    })
    await updateUiColumns()
  }

  const addField = async (fieldName: string, fieldType: FieldType) => {
    if (sqlite) {
      const tableColumnName = generateColumnName()
      await sqlite.addColumn({
        name: fieldName,
        type: fieldType,
        table_name: tableName,
        table_column_name: tableColumnName,
        property: {},
      })
      await updateUiColumns()
    }
  }

  const deleteField = async (tableColumnName: string) => {
    if (!sqlite) return
    await withTransaction(async () => {
      // update trigger before delete column
      await sqlite.onTableChange(databaseName, tableName, [tableColumnName])
      await sqlite.sql`ALTER TABLE ${Symbol(tableName)} DROP COLUMN ${Symbol(
        tableColumnName
      )};`
      await sqlite.sql`DELETE FROM ${Symbol(
        ColumnTableName
      )} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`
    })
    await updateUiColumns()
  }

  const deleteFieldByColIndex = async (colIndex: number) => {
    const tableColumnName = uiColumns[colIndex].table_column_name
    console.log("deleteFieldByColIndex", tableColumnName, colIndex)
    await deleteField(tableColumnName)
  }

  const addRow = async (params?: any[]) => {
    if (sqlite) {
      const uuid = uuidv4()
      await sqlite.sql`INSERT INTO ${Symbol(tableName)}(_id) VALUES (${uuid})`
      return uuid
    }
  }

  const deleteRows = async (rowIds: string[]) => {
    if (sqlite) {
      await sqlite.sql`DELETE FROM ${Symbol(tableName)} WHERE _id IN ${rowIds}`
    }
  }

  const runQuery = useCallback(
    async (querySql: string) => {
      if (sqlite) {
        const res = await sqlite.exec2(querySql)
        console.log(res)
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
    [sqlite]
  )

  const getRowData = useCallback(
    async (range: RowRange): Promise<any[]> => {
      const [offset, limit] = range
      let data: any[] = []
      if (sqlite && tableName) {
        data = await sqlite.sql2`SELECT * FROM ${Symbol(
          tableName
        )} LIMIT ${limit} OFFSET ${offset}`
      }
      return data
    },
    [sqlite, tableName]
  )

  const node = useCurrentNode()
  useEffect(() => {
    if (sqlite && tableName && node?.type === "table") {
      sqlite.sql`SELECT COUNT(*) FROM ${Symbol(tableName)}`.then((res) => {
        const count = res[0]?.[0]
        setCount(count)
      })
    }
  }, [sqlite, tableName, setCount, node?.type])

  return {
    count,
    getRowData,
    updateCell,
    addField,
    updateFieldName,
    changeFieldType,
    updateFieldProperty,
    deleteField,
    deleteFieldByColIndex,
    addRow,
    deleteRows,
    tableSchema,
    runQuery,
    reload,
    sqlite,
    setCount,
    views,
    updateViews,
  }
}
