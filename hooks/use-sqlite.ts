"use client"

import { useCallback } from "react"
import type { SqlDatabase } from "@/worker/sql"
import { create } from "zustand"

import { getRawTableNameById, uuidv4 } from "@/lib/utils"
import { createTemplateTableSql } from "@/components/grid/helper"

export type ITable = {
  id: string
  name: string
  type: string
}

interface SqliteState {
  isInitialized: boolean
  setInitialized: (isInitialized: boolean) => void

  currentDatabase: string
  setCurrentDatabase: (database: string) => void

  allTables: ITable[]
  setAllTables: (tables: ITable[]) => void

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
  setSqliteProxy: (sqlWorker) => {
    // for debug
    ;(window as any).sqlite = sqlWorker
    return set({ sqliteProxy: sqlWorker })
  },
}))

export const useSqlite = (dbName?: string) => {
  const {
    isInitialized,
    sqliteProxy: sqlWorker,
    setAllTables,
  } = useSqliteStore()

  const queryAllTables = useCallback(async () => {
    if (!sqlWorker) return
    const allTables = await sqlWorker.listAllTables()
    console.log("table list loaded", allTables)
    return allTables
  }, [sqlWorker])

  const updateTableList = async () => {
    await queryAllTables().then((tables) => {
      tables && setAllTables(tables)
    })
  }
  const withTransaction = async (callback: () => Promise<void>) => {
    if (!sqlWorker) return
    await sqlWorker.sql`BEGIN TRANSACTION;`
    await callback()
    await sqlWorker.sql`COMMIT;`
  }

  const createTableAndRegister = async (data: {
    tableName: string
    tableId: string
    sql: string
  }) => {
    if (!sqlWorker) return
    const { tableName, tableId, sql } = data
    await withTransaction(async () => {
      await sqlWorker.sql`${sql}`
      await sqlWorker.sql`INSERT INTO eidos__meta (id,name,type) VALUES (${tableId}, ${tableName},'table');`
    })
  }
  const createTable = async (tableName: string) => {
    if (!sqlWorker) return
    const tableId = uuidv4().split("-").join("")
    const _tableName = getRawTableNameById(tableId)
    const sql = createTemplateTableSql(_tableName)
    //
    await createTableAndRegister({
      tableName,
      tableId,
      sql,
    })
    await updateTableList()
    return tableId
  }

  const updateTableListWithSql = async (sql: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`${sql}`
    await updateTableList()
  }

  const createTableWithSqlAndInsertSqls = async (props: {
    tableId: string
    tableName: string
    createTableSql: string
    insertSql?: any[]
    callback?: (progress: number) => void
  }) => {
    if (!sqlWorker) return
    const { tableId, tableName, createTableSql, insertSql, callback } = props
    await createTableAndRegister({
      tableName,
      tableId,
      sql: createTableSql,
    })
    await updateTableList()
    if (insertSql) {
      for (let index = 0; index < insertSql.length; index++) {
        const { sql, bind } = insertSql[index]
        await sqlWorker.sql4mainThread(sql, bind)
        callback && callback((index / insertSql.length) * 100)
      }
    }
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

  const deleteTable = async (tableId: string) => {
    if (!sqlWorker) return
    const rawTableName = `tb_${tableId}`
    await sqlWorker.sql`BEGIN TRANSACTION`
    await sqlWorker.sql`DROP TABLE ${Symbol(rawTableName)}`
    await sqlWorker.sql`DELETE FROM eidos__meta WHERE id = ${tableId}`
    await sqlWorker.sql`COMMIT`
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
    createTableWithSqlAndInsertSqls,
    updateTableData,
    handleSql,
    undo,
    redo,
  }
}
