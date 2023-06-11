import { useCallback, useEffect, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { MsgType } from "@/lib/const"
import { logger } from "@/lib/log"
import {
  checkSqlIsModifyTableData,
  checkSqlIsModifyTableSchema,
  checkSqlIsOnlyQuery,
  sqlToJSONSchema2,
} from "@/lib/sqlite/helper"

import { useSqlite } from "./use-sqlite"

export const useTableSchema = (tableName: string, dbName: string) => {
  const { sqlite } = useSqlite(dbName)
  const [schema, setSchema] = useState<string>()

  useEffect(() => {
    if (!sqlite) return
    sqlite.sql`SELECT * FROM sqlite_schema where name=${Symbol(
      tableName
    )}`.then((res: any) => {
      const sql = res[0][4] + ";"
      logger.info(sql)
      setSchema(sql)
    })
  }, [sqlite, tableName, dbName])
  return schema
}

export const useTable = (
  tableName: string,
  databaseName: string,
  querySql?: string
) => {
  const { sqlite } = useSqlite(databaseName)
  const [data, setData] = useState<any[]>([])
  const [schema, setSchema] = useState<ReturnType<typeof sqlToJSONSchema2>>([])
  const [tableSchema, setTableSchema] = useState<string>()

  const refreshRows = useCallback(async () => {
    if (!sqlite) return
    await sqlite.sql`SELECT * FROM ${Symbol(tableName)};`.then((res: any) => {
      setData(res)
    })
  }, [sqlite, tableName])

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
        const sql = res[0][4] + ";"
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
  }, [sqlite, tableName])

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

  useEffect(() => {
    if (sqlite && tableName) {
      if (querySql) {
        sqlite.sql`${querySql}`.then((res: any) => {
          if (checkSqlIsModifyTableSchema(querySql)) {
            updateTableSchema()
          }
          if (checkSqlIsOnlyQuery(querySql)) {
            setData(res)
          }
          if (checkSqlIsModifyTableData(querySql)) {
            refreshRows()
          }
        })
      } else {
        sqlite.sql`SELECT * FROM ${Symbol(tableName)};`.then((res: any) => {
          setData(res)
          updateTableSchema()
        })
      }
    }
  }, [sqlite, tableName, updateTableSchema, querySql, refreshRows])

  return {
    data,
    setData,
    schema,
    updateCell,
    addField,
    addRow,
    deleteRows,
    tableSchema,
  }
}
