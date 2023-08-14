import { useCallback, useEffect } from "react"
import { IView } from "@/worker/meta_table/view"
import { v4 as uuidv4 } from "uuid"
import { create } from "zustand"

import { MsgType } from "@/lib/const"
import { ColumnTableName } from "@/lib/sqlite/const"
import {
  checkSqlIsModifyTableData,
  checkSqlIsModifyTableSchema,
  checkSqlIsOnlyQuery,
  sqlToJSONSchema2,
} from "@/lib/sqlite/helper"
import { generateColumnName, getTableIdByRawTableName } from "@/lib/utils"
import { RowRange } from "@/components/grid/hooks/use-async-data"
import { useSpaceAppStore } from "@/app/[database]/store"
import { useConfigStore } from "@/app/settings/store"

import { useCurrentNode } from "./use-current-node"
import { useSqlite } from "./use-sqlite"

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
  type: string
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
  const { sqlite, withTransaction } = useSqlite(databaseName)
  const { setUiColumns, uiColumns, views, setViews } = useTableStore()
  const {
    count,
    setCount,
    currentSchema: schema,
    setCurrentSchema: setSchema,
    currentTableSchema: tableSchema,
    setCurrentTableSchema: setTableSchema,
  } = useSpaceAppStore()
  // const [tableSchema, setTableSchema] = useState<string>()

  useEffect(() => {
    window.onmessage = (e) => {
      const { type, data } = e.data
      if (type === MsgType.DataUpdateSignal && data.database === databaseName) {
        console.log("refreshRows")
      }
    }
  }, [databaseName])

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

  const updateTableSchema = useCallback(async () => {
    if (!sqlite) return
    await sqlite.sql`SELECT * FROM sqlite_schema where name=${tableName}`.then(
      (res: any) => {
        // array mode
        const sql = res[0][4] + ";"
        // object mode
        // const sql = res[0].sql + ";"
        if (sql) {
          setTableSchema(sql)
          try {
            const compactJsonTablesArray = sqlToJSONSchema2(sql)
            setSchema(compactJsonTablesArray)
          } catch (error) {
            console.error("error", error)
          }
        }
      }
    )
  }, [setSchema, setTableSchema, sqlite, tableName])

  const reload = useCallback(async () => {
    console.log(tableName)
    if (!tableName) return
    await updateTableSchema()
  }, [updateTableSchema, tableName])

  const updateCell = async (rowId: string, filedName: string, value: any) => {
    if (sqlite) {
      if (filedName !== "_id") {
        sqlite.sql`UPDATE ${Symbol(tableName)} SET ${Symbol(
          filedName
        )} = ${value} WHERE _id = ${rowId}`
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

  const updateFieldProperty = async (
    tableColumnName: string,
    property: any
  ) => {
    if (!sqlite) return
    await sqlite.sql`UPDATE ${Symbol(
      ColumnTableName
    )} SET property = ${JSON.stringify(
      property
    )} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`
    await updateUiColumns()
  }

  const addField = async (fieldName: string, fieldType: string) => {
    const typeMap: any = {
      text: "TEXT",
    }
    if (sqlite) {
      const table = Symbol(tableName)
      const columnType = typeMap[fieldType] ?? "TEXT"
      const tableColumnName = generateColumnName()
      await withTransaction(async () => {
        await sqlite.sql`ALTER TABLE ${table} ADD COLUMN ${Symbol(
          tableColumnName
        )} ${Symbol(columnType)};`
        await sqlite.sql`INSERT INTO ${Symbol(
          ColumnTableName
        )} (name,type,table_name,table_column_name) VALUES (${fieldName},${fieldType},${tableName},${tableColumnName});`
      })
      await updateTableSchema()
      await updateUiColumns()
    }
  }

  const deleteField = async (tableColumnName: string) => {
    if (!sqlite) return
    await withTransaction(async () => {
      await sqlite.sql`ALTER TABLE ${Symbol(tableName)} DROP COLUMN ${Symbol(
        tableColumnName
      )};`
      await sqlite.sql`DELETE FROM ${Symbol(
        ColumnTableName
      )} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`
    })
    await updateUiColumns()
    await updateTableSchema()
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
      await updateTableSchema()
    }
  }

  const getCurrentColumns = useCallback(() => {
    return schema[0]?.columns?.map((col) => col.name)
  }, [schema])

  const { aiConfig } = useConfigStore()
  const runQuery = useCallback(
    async (querySql: string) => {
      if (sqlite) {
        const res = await sqlite.exec2(querySql)
        console.log(res)
        if (checkSqlIsModifyTableSchema(querySql)) {
          updateTableSchema()
        }
        if (checkSqlIsOnlyQuery(querySql)) {
          return res
        }
        if (checkSqlIsModifyTableData(querySql)) {
          const columns = getCurrentColumns()
          if (querySql.includes("UPDATE")) {
          }
        }
        return res
      }
    },
    [sqlite, updateTableSchema, getCurrentColumns]
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
        updateTableSchema()
      })
    }
  }, [sqlite, tableName, updateTableSchema, setCount, node?.type])

  return {
    count,
    getRowData,
    schema,
    updateCell,
    addField,
    updateFieldName,
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
