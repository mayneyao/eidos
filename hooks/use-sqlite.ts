"use client"

import { useCallback, useEffect } from "react"
import type { SqlDatabase } from "@/worker/sql"
import { v4 as uuidv4 } from "uuid"
import { create } from "zustand"

import { MsgType } from "@/lib/const"
import { SQLWorker, getWorker } from "@/lib/sqlite/sql-worker"
import { createTemplateTableSql } from "@/components/grid/helper"

interface SqliteState {
  isInitialized: boolean
  setInitialized: (isInitialized: boolean) => void

  currentDatabase: string
  setCurrentDatabase: (database: string) => void

  allTables: string[]
  setAllTables: (tables: string[]) => void

  selectedTable: string
  setSelectedTable: (table: string) => void

  databaseList: string[]
  setDatabaseList: (databaseList: string[]) => void

  // const [sqlWorker, setSQLWorker] = useState<SqlDatabase>()

  sqlWorker: SqlDatabase | null
  setSqlWorker: (sqlWorker: SqlDatabase) => void
}

// not using persist
export const useSqliteStore = create<SqliteState>()((set) => ({
  isInitialized: false,
  setInitialized: (isInitialized) => set({ isInitialized }),

  currentDatabase: "",
  setCurrentDatabase: (database) => set({ currentDatabase: database }),

  allTables: [],
  setAllTables: (tables) => set({ allTables: tables }),

  selectedTable: "",
  setSelectedTable: (table) => set({ selectedTable: table }),

  databaseList: [],
  setDatabaseList: (databaseList) => set({ databaseList }),

  sqlWorker: null,
  setSqlWorker: (sqlWorker) => set({ sqlWorker }),
}))

export const useSqlite = (dbName?: string) => {
  const {
    isInitialized,
    setInitialized,
    setAllTables,
    setCurrentDatabase,
    currentDatabase,
    sqlWorker,
    setSqlWorker,
  } = useSqliteStore()

  // const [sqlWorker, setSqlWorker] = useState<SqlDatabase>()

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
    const sqlWorker = SQLWorker(dbName!)
    setSqlWorker(sqlWorker)
    ;(window as any).SQLWorker = sqlWorker
  }, [dbName, setInitialized, setSqlWorker])

  const queryAllTables = useCallback(async () => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    const res =
      await sqlWorker.sql`SELECT name FROM sqlite_schema WHERE type='table'`
    const allTables = res.map((item: any) => item[0])
    return allTables
  }, [sqlWorker])

  const updateTableList = async () => {
    await queryAllTables().then((tables) => {
      setAllTables(tables)
    })
  }

  const createTable = async (tableName: string) => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    const sql = createTemplateTableSql(tableName)
    await sqlWorker.sql`${sql}`
    await updateTableList()
  }

  const updateTableListWithSql = async (sql: string) => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    await sqlWorker.sql`${sql}`
    await updateTableList()
  }

  const createTableWithSql = async (
    createTableSql: string,
    insertSql?: string
  ) => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    await sqlWorker.sql`${createTableSql}`
    await updateTableList()
    if (insertSql) {
      await sqlWorker.sql`${insertSql}`
    }
  }

  const updateTableData = async (sql: string) => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    await sqlWorker.sql`${sql}`
    await updateTableList()
  }

  const deleteTable = async (tableName: string) => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    await sqlWorker.sql`DROP TABLE ${Symbol(tableName)}`
    await updateTableList()
  }

  const renameTable = async (oldTableName: string, newTableName: string) => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    await sqlWorker.sql`ALTER TABLE ${Symbol(oldTableName)} RENAME TO ${Symbol(
      newTableName
    )}`
    await updateTableList()
  }

  const duplicateTable = async (oldTableName: string, newTableName: string) => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    await sqlWorker.sql`CREATE TABLE ${Symbol(
      newTableName
    )} AS SELECT * FROM ${Symbol(oldTableName)}`
    await updateTableList()
  }

  const handleSql = async (sql: string) => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
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
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    sqlWorker.redo()
  }

  const undo = async () => {
    if (!sqlWorker) throw new Error("SQLWorker not initialized")
    sqlWorker.undo()
  }

  return {
    sqlite: isInitialized ? sqlWorker : null,
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
