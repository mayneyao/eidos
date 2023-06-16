import { useCallback, useEffect } from "react"
import { GridCellKind } from "@glideapps/glide-data-grid"
import { useWhyDidYouUpdate } from "ahooks"
import { v4 as uuidv4 } from "uuid"
import { create } from "zustand"

import { MsgType } from "@/lib/const"
import { ColumnTableName } from "@/lib/sqlite/const"
import {
  aggregateSql2columns,
  checkSqlIsModifyTableData,
  checkSqlIsModifyTableSchema,
  checkSqlIsOnlyQuery,
  queryData2JSON,
  sqlToJSONSchema2,
} from "@/lib/sqlite/helper"
import { useDatabaseAppStore } from "@/app/[database]/store"
import { useConfigStore } from "@/app/settings/store"

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
}

interface TableState {
  columns: IColumn[]
  uiColumns: IUIColumn[]

  setColumns: (columns: IColumn[]) => void
  setUiColumns: (columns: IUIColumn[]) => void
}

// not using persist
export const useTableStore = create<TableState>()((set) => ({
  columns: [],
  uiColumns: [],
  setColumns: (columns) => set({ columns }),
  setUiColumns: (uiColumns) => set({ uiColumns }),
}))

export const useTable = (tableName: string, databaseName: string) => {
  const { sqlite, withTransaction } = useSqlite(databaseName)
  const { setUiColumns, uiColumns } = useTableStore()
  const {
    data,
    setData,
    currentSchema: schema,
    setCurrentSchema: setSchema,
    currentTableSchema: tableSchema,
    setCurrentTableSchema: setTableSchema,
  } = useDatabaseAppStore()
  // const [tableSchema, setTableSchema] = useState<string>()

  // FIXME: bug, when aggregate query, id will be null, cant update as expected
  const refreshRows = useCallback(
    async (rowIds?: string[], columns?: string[]) => {
      if (!sqlite) return
      const columnsString = columns ? columns.join(",") : "*"
      console.log(rowIds, columns)
      if (!rowIds) {
        await sqlite.sql`SELECT ${Symbol(columnsString)} FROM ${Symbol(
          tableName
        )};`.then((res: any) => {
          setData(res)
        })
      }
      if (rowIds) {
        await sqlite.sql`SELECT ${Symbol(columnsString)} FROM ${Symbol(
          tableName
        )} where _id in ${rowIds};`.then((res: any) => {
          setData(res)
        })
      }
    },
    [setData, sqlite, tableName]
  )

  useEffect(() => {
    window.onmessage = (e) => {
      const { type, data } = e.data
      if (type === MsgType.DataUpdateSignal && data.database === databaseName) {
        console.log("refreshRows")
        refreshRows()
      }
    }
  }, [refreshRows, databaseName])

  const updateUiColumns = useCallback(async () => {
    if (!sqlite) return
    const res = await sqlite.listUiColumns(tableName)
    setUiColumns(res)
  }, [setUiColumns, sqlite, tableName])

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
    await refreshRows()
    await updateTableSchema()
  }, [refreshRows, updateTableSchema, tableName])

  const updateCell = async (col: number, row: number, value: any) => {
    const filedName = schema[0]?.columns?.[col].name
    const rowId = data[row][0]
    if (sqlite) {
      if (filedName !== "_id") {
        sqlite.sql`UPDATE ${Symbol(tableName)} SET ${Symbol(
          filedName
        )} = ${value} WHERE _id = ${rowId}`
      }
      // get the updated value, but it will block ui update. expect to success if not throw error
      // const result2 = await sqlite.sql`SELECT ${filedName} FROM ${Symbol(tableName)} where _id = '${rowId}'`;
      // data[row][col] = result2[0]
      data[row][col] = value
      setData([...data])
    }
  }

  const addField = async (fieldName: string, fieldType: string) => {
    const typeMap: any = {
      text: "TEXT",
    }
    if (sqlite) {
      const column = Symbol(fieldName)
      const table = Symbol(tableName)
      const columnType = typeMap[fieldType] ?? "TEXT"
      await withTransaction(async () => {
        await sqlite.sql`ALTER TABLE ${table} ADD COLUMN ${column} ${Symbol(
          columnType
        )};`
        await sqlite.sql`INSERT INTO ${Symbol(
          ColumnTableName
        )} (name,type,table_name,table_column_name) VALUES (${fieldName},${fieldType},${tableName},${fieldName});`
      })
      await updateTableSchema()
      await updateUiColumns()
    }
  }

  const deleteField = async (fieldName: string) => {
    if (!sqlite) return
    await withTransaction(async () => {
      await sqlite.sql`ALTER TABLE ${Symbol(tableName)} DROP COLUMN ${Symbol(
        fieldName
      )};`
      await sqlite.sql`DELETE FROM ${Symbol(
        ColumnTableName
      )} WHERE table_column_name = ${fieldName} AND table_name = ${tableName};`
    })
    await updateUiColumns()
    await updateTableSchema()
  }

  const deleteFieldByColIndex = async (colIndex: number) => {
    const fieldName = uiColumns[colIndex].name
    console.log("deleteFieldByColIndex", fieldName, colIndex)
    await deleteField(fieldName)
  }

  const addRow = async (params?: any[]) => {
    if (sqlite) {
      const uuid = uuidv4()
      await sqlite.sql`INSERT INTO ${Symbol(tableName)}(_id) VALUES (${uuid})`
      await updateTableSchema()
      await refreshRows()
    }
  }

  const deleteRows = async (startIndex: number, endIndex: number) => {
    if (sqlite) {
      const rowIds = data.slice(startIndex, endIndex).map((row) => row[0])
      await sqlite.sql`DELETE FROM ${Symbol(tableName)} WHERE _id IN ${rowIds}`
      await updateTableSchema()
      await refreshRows()
    }
  }

  const getCurrentRowIds = useCallback(() => {
    const res = data.map((row) => row[0]).filter(Boolean)
    if (res.length === 0) {
      return undefined
    }
    return res
  }, [data])

  const getCurrentColumns = useCallback(() => {
    return schema[0]?.columns?.map((col) => col.name)
  }, [schema])

  const { aiConfig } = useConfigStore()
  const runQuery = useCallback(
    async (querySql: string) => {
      if (sqlite) {
        const res = await sqlite.sql`${querySql}`
        if (checkSqlIsModifyTableSchema(querySql)) {
          updateTableSchema()
        }
        if (checkSqlIsOnlyQuery(querySql)) {
          const originSchema = tableSchema ? sqlToJSONSchema2(tableSchema) : []
          const fields = originSchema[0]?.columns?.map((col) => col.name) ?? []
          const compactJsonTablesArray = aggregateSql2columns(querySql, fields)
          const queryFields =
            compactJsonTablesArray.columns.map((col: any) => col.name) ?? []
          if (aiConfig.autoRunScope.includes("UI.REFRESH")) {
            setSchema([compactJsonTablesArray])
            if (res.length === 1 && !res[0]) {
              setData([])
            } else {
              setData(res)
            }
          }

          const jsonData = queryData2JSON(res, queryFields)
          return jsonData
        }
        if (checkSqlIsModifyTableData(querySql)) {
          const columns = getCurrentColumns()
          if (querySql.includes("UPDATE")) {
            const rowIds = getCurrentRowIds()
            refreshRows(rowIds, columns)
          } else {
            refreshRows(undefined, columns)
          }
          refreshRows()
        }
        return res
      }
    },
    [
      sqlite,
      updateTableSchema,
      tableSchema,
      aiConfig.autoRunScope,
      setSchema,
      setData,
      refreshRows,
      getCurrentRowIds,
      getCurrentColumns,
    ]
  )

  useEffect(() => {
    if (sqlite && tableName) {
      sqlite.sql`SELECT * FROM ${Symbol(tableName)};`.then((res: any) => {
        setData(res)
        updateTableSchema()
      })
    }
  }, [setData, sqlite, tableName, updateTableSchema])

  return {
    data,
    setData,
    schema,
    updateCell,
    addField,
    deleteField,
    deleteFieldByColIndex,
    addRow,
    deleteRows,
    tableSchema,
    runQuery,
    reload,
  }
}
