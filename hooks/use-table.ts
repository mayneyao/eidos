import { useCallback, useEffect } from "react"
import { v4 as uuidv4 } from "uuid"

import { MsgType } from "@/lib/const"
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

export const useTable = (tableName: string, databaseName: string) => {
  const { sqlite } = useSqlite(databaseName)
  const {
    data,
    setData,
    currentSchema: schema,
    setCurrentSchema: setSchema,
    currentTableSchema: tableSchema,
    setCurrentTableSchema: setTableSchema,
  } = useDatabaseAppStore()
  // const [tableSchema, setTableSchema] = useState<string>()

  const refreshRows = useCallback(async () => {
    if (!sqlite) return
    await sqlite.sql`SELECT * FROM ${Symbol(tableName)};`.then((res: any) => {
      setData(res)
    })
  }, [setData, sqlite, tableName])

  useEffect(() => {
    window.onmessage = (e) => {
      const { type, data } = e.data
      if (type === MsgType.DataUpdateSignal && data.database === databaseName) {
        console.log("refreshRows")
        refreshRows()
      }
    }
  }, [refreshRows, databaseName])

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
    await updateTableSchema()
    await refreshRows()
  }, [refreshRows, updateTableSchema])

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
      text: "VARCHAR(128)",
    }
    if (sqlite) {
      const column = Symbol(fieldName)
      const table = Symbol(tableName)
      const columnType = typeMap[fieldType] ?? "VARCHAR(128)"
      await sqlite.sql`ALTER TABLE ${table} ADD COLUMN ${column} ${Symbol(
        columnType
      )};`
      await updateTableSchema()
    }
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
            setData(res)
          }

          const jsonData = queryData2JSON(res, queryFields)
          return jsonData
        }
        if (checkSqlIsModifyTableData(querySql)) {
          refreshRows()
        }
      }
    },
    [
      refreshRows,
      setData,
      setSchema,
      sqlite,
      tableSchema,
      updateTableSchema,
      aiConfig.autoRunScope,
    ]
  )

  useEffect(() => {
    if (sqlite && tableName) {
      sqlite.sql`SELECT * FROM ${Symbol(tableName)};`.then((res: any) => {
        setData(res)
        updateTableSchema()
      })
    }
  }, [
    sqlite,
    tableName,
    updateTableSchema,
    refreshRows,
    tableSchema,
    runQuery,
    setData,
  ])

  return {
    data,
    setData,
    schema,
    updateCell,
    addField,
    addRow,
    deleteRows,
    tableSchema,
    runQuery,
    reload,
  }
}
