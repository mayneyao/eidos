"use client"

import { useCallback, useEffect, useState } from "react"
import type { SqlDatabase } from "@/worker/sql"
import { v4 as uuidv4 } from "uuid"

import { MsgType } from "@/lib/const"
import { logger } from "@/lib/log"
import { buildSql } from "@/lib/sqlite/helper"
import { useSqliteStore } from "@/lib/store"
import { toast } from "@/components/ui/use-toast"
import { createTemplateTableSql } from "@/components/grid/helper"

let worker: Worker

export const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL("@/worker/index.ts", import.meta.url), {
      type: "module",
    })
    logger.info("load worker")
  }
  return worker
}

export const useSqlite = (dbName?: string) => {
  const {
    isInitialized,
    setInitialized,
    setAllTables,
    setCurrentDatabase,
    currentDatabase,
  } = useSqliteStore()

  const [SQLWorker, setSQLWorker] = useState<SqlDatabase>()

  useEffect(() => {
    if (dbName && isInitialized) {
      if (currentDatabase === dbName) return
      const switchDdMsgId = uuidv4()
      const worker = getWorker()
      worker.postMessage({
        type: MsgType.SwitchDatabase,
        data: {
          databaseName: dbName,
        },
        id: switchDdMsgId,
      })
      worker.onmessage = (e) => {
        const { id: returnId, data } = e.data
        if (returnId === switchDdMsgId) {
          setCurrentDatabase(data.dbName)
        }
      }
    }
  }, [dbName, setCurrentDatabase, isInitialized, currentDatabase])

  useEffect(() => {
    const worker = getWorker()
    worker.onmessage = async (e) => {
      if (e.data === "init") {
        setInitialized(true)
      }
    }
    const SQLWorker = new Proxy<SqlDatabase>({} as any, {
      get(target, method) {
        return function (params: any) {
          const thisCallId = uuidv4()
          const [_params, ...rest] = arguments
          if (method === "sql") {
            /**
             * sql`SELECT * FROM ${Symbol(books)} WHERE id = ${1}`.
             * because sql is a tag function, it will be called with an array of strings and an array of values.
             * if values include Symbol, it will can't be transported to worker via postMessage
             * we need parse to sql first before transport to worker
             * just for sql`SELECT * FROM ${Symbol(books)} WHERE id = ${1}`. work in main thread and worker thread
             */
            const { sql, bind } = buildSql(_params, ...rest)
            worker.postMessage({
              type: MsgType.CallFunction,
              data: {
                method: "sql4mainThread",
                params: [sql, bind],
                dbName,
              },
              id: thisCallId,
            })
          } else {
            worker.postMessage({
              type: MsgType.CallFunction,
              data: {
                method,
                params: [_params, ...rest],
                dbName,
              },
              id: thisCallId,
            })
          }

          return new Promise((resolve, reject) => {
            worker.onmessage = (e) => {
              const { id: returnId, type, data } = e.data
              switch (type) {
                case MsgType.Error:
                  toast({
                    title: "Error",
                    description: data.message,
                    duration: 5000,
                  })
                  break
                case MsgType.DataUpdateSignal:
                  console.log("data update signal", e)
                  window.postMessage(e.data)
                  break
                // req-resp msg need to match id
                case MsgType.QueryResp:
                  if (returnId === thisCallId) {
                    resolve(data.result)
                  }
                  break
                default:
                  break
              }
            }
          })
        }
      },
    })
    setSQLWorker(SQLWorker)
    ;(window as any).SQLWorker = SQLWorker
  }, [dbName, setInitialized])

  const queryAllTables = useCallback(async () => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    const res =
      await SQLWorker.sql`SELECT name FROM sqlite_schema WHERE type='table'`
    const allTables = res.map((item: any) => item[0])
    return allTables
  }, [SQLWorker])

  const updateTableList = async () => {
    await queryAllTables().then((tables) => {
      setAllTables(tables)
    })
  }

  const createTable = async (tableName: string) => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    const sql = createTemplateTableSql(tableName)
    await SQLWorker.sql`${sql}`
    await updateTableList()
  }

  const updateTableListWithSql = async (sql: string) => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    await SQLWorker.sql`${sql}`
    await updateTableList()
  }

  const createTableWithSql = async (
    createTableSql: string,
    insertSql?: string
  ) => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    await SQLWorker.sql`${createTableSql}`
    await updateTableList()
    if (insertSql) {
      await SQLWorker.sql`${insertSql}`
    }
  }

  const updateTableData = async (sql: string) => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    await SQLWorker.sql`${sql}`
    await updateTableList()
  }

  const deleteTable = async (tableName: string) => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    await SQLWorker.sql`DROP TABLE ${Symbol(tableName)}`
    await updateTableList()
  }

  const renameTable = async (oldTableName: string, newTableName: string) => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    await SQLWorker.sql`ALTER TABLE ${Symbol(oldTableName)} RENAME TO ${Symbol(
      newTableName
    )}`
    await updateTableList()
  }

  const duplicateTable = async (oldTableName: string, newTableName: string) => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    await SQLWorker.sql`CREATE TABLE ${Symbol(
      newTableName
    )} AS SELECT * FROM ${Symbol(oldTableName)}`
    await updateTableList()
  }

  const handleSql = async (sql: string) => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    const cls = sql.trim().split(" ")[0].toUpperCase()

    let handled = false
    switch (cls) {
      case "SELECT":
      case "INSERT":
      case "UPDATE":
      case "DELETE":
      case "ALTER":
        // add, delete, or modify columns in an existing table.
        break
      // action above will update display of table, handle by tableState
      // action below will update table list, handle by self
      case "CREATE":
        if (sql.includes("TABLE")) {
          await createTableWithSql(sql)
        }
        break
      case "DROP":
        if (sql.includes("TABLE")) {
          await updateTableListWithSql(sql)
        }
        break
      default:
        return handled
    }
    return handled
  }

  const redo = async () => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    SQLWorker.redo()
  }

  const undo = async () => {
    if (!SQLWorker) throw new Error("SQLWorker not initialized")
    SQLWorker.undo()
  }

  return {
    sqlite: isInitialized ? SQLWorker : null,
    createTable,
    deleteTable,
    renameTable,
    duplicateTable,
    queryAllTables,
    createTableWithSql,
    updateTableData,
    handleSql,
    undo,
    redo,
  }
}
