"use client"

import { useCallback } from "react"
import type { SqlDatabase } from "@/worker/sql"
import { create } from "zustand"

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

  sqliteProxy: SqlDatabase | null
  setSqliteProxy: (sqlWorker: SqlDatabase) => void
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

  sqliteProxy: null,
  setSqliteProxy: (sqlWorker) => set({ sqliteProxy: sqlWorker }),
}))

export const useSqlite = (dbName?: string) => {
  const {
    isInitialized,
    sqliteProxy: sqlWorker,
    setAllTables,
  } = useSqliteStore()

  const queryAllTables = useCallback(async () => {
    if (!sqlWorker) return
    const res =
      await sqlWorker.sql`SELECT name FROM sqlite_schema WHERE type='table'`
    const allTables = res.map((item: any) => item[0])
    console.log("table list loaded", allTables)
    return allTables
  }, [sqlWorker])

  const updateTableList = async () => {
    await queryAllTables().then((tables) => {
      tables && setAllTables(tables)
    })
  }

  const createTable = async (tableName: string) => {
    if (!sqlWorker) return
    const sql = createTemplateTableSql(tableName)
    await sqlWorker.sql`${sql}`
    await updateTableList()
  }

  const updateTableListWithSql = async (sql: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`${sql}`
    await updateTableList()
  }

  const createTableWithSql = async (
    createTableSql: string,
    insertSql?: string
  ) => {
    if (!sqlWorker) return
    await sqlWorker.sql`${createTableSql}`
    await updateTableList()
    if (insertSql) {
      await sqlWorker.sql`${insertSql}`
    }
  }

  const updateTableData = async (sql: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`${sql}`
    await updateTableList()
  }

  const deleteTable = async (tableName: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`DROP TABLE ${Symbol(tableName)}`
    await updateTableList()
  }

  const renameTable = async (oldTableName: string, newTableName: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`ALTER TABLE ${Symbol(oldTableName)} RENAME TO ${Symbol(
      newTableName
    )}`
    await updateTableList()
  }

  const duplicateTable = async (oldTableName: string, newTableName: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`CREATE TABLE ${Symbol(
      newTableName
    )} AS SELECT * FROM ${Symbol(oldTableName)}`
    await updateTableList()
  }

  const handleSql = async (sql: string) => {
    if (!sqlWorker) return
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
    if (!sqlWorker) return
    sqlWorker?.redo()
  }

  const undo = async () => {
    if (!sqlWorker) return
    sqlWorker?.undo()
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
