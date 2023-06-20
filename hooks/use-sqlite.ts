"use client"

import { useCallback } from "react"
import type { SqlDatabase } from "@/worker/sql"
import { create } from "zustand"

import { TreeTableName } from "@/lib/sqlite/const"
import { getRawDocNameById, getRawTableNameById, uuidv4 } from "@/lib/utils"
import { createTemplateTableSql } from "@/components/grid/helper"

export type IFileNode = {
  id: string
  name: string
  type: string
}

interface SqliteState {
  isInitialized: boolean
  setInitialized: (isInitialized: boolean) => void

  currentDatabase: string
  setCurrentDatabase: (database: string) => void

  allNodes: IFileNode[]
  setAllNodes: (tables: IFileNode[]) => void

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

  allNodes: [],
  setAllNodes: (tables) => set({ allNodes: tables }),

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
    setAllNodes,
  } = useSqliteStore()

  const queryAllNodes = useCallback(async () => {
    if (!sqlWorker) return
    const allNodes = await sqlWorker.listAllNodes()
    console.log("node list loaded", allNodes)
    return allNodes
  }, [sqlWorker])

  const updateNodeList = async () => {
    await queryAllNodes().then((nodes) => {
      nodes && setAllNodes(nodes)
    })
  }
  const withTransaction = async (callback: () => Promise<void>) => {
    if (!sqlWorker) return
    try {
      await sqlWorker.sql`BEGIN TRANSACTION;`
      await callback()
      await sqlWorker.sql`COMMIT;`
    } catch (error) {
      console.error(error)
      await sqlWorker.sql`ROLLBACK;`
    }
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
      await sqlWorker.sql`INSERT INTO ${Symbol(
        TreeTableName
      )} (id,name,type) VALUES (${tableId}, ${tableName},'table');`
    })
  }
  // create table with default template
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
    await updateNodeList()
    return tableId
  }

  const createDoc = async (docName: string) => {
    if (!sqlWorker) return
    const docId = uuidv4().split("-").join("")
    await sqlWorker.sql`INSERT INTO ${Symbol(
      TreeTableName
    )} (id,name,type) VALUES (${docId}, ${docName},'doc');`
    await updateNodeList()
    return docId
  }

  const updateDoc = async (docId: string, content: string) => {
    if (!sqlWorker) return
    await sqlWorker.updateDoc(docId, content)
  }

  const getDoc = async (docId: string) => {
    if (!sqlWorker) return
    const doc = await sqlWorker.getDoc(docId)
    return doc
  }

  const updateTableListWithSql = async (sql: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`${sql}`
    await updateNodeList()
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
    await updateNodeList()
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
    await updateNodeList()
    if (insertSql) {
      await sqlWorker.sql`${insertSql}`
    }
  }

  const updateTableData = async (sql: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`${sql}`
    await updateNodeList()
  }

  const deleteTable = async (tableId: string) => {
    if (!sqlWorker) return
    const rawTableName = `tb_${tableId}`
    await sqlWorker.sql`BEGIN TRANSACTION`
    await sqlWorker.sql`DROP TABLE ${Symbol(rawTableName)}`
    await sqlWorker.sql`DELETE FROM ${Symbol(
      TreeTableName
    )} WHERE id = ${tableId}`
    await sqlWorker.sql`COMMIT`
    await updateNodeList()
  }

  const renameTable = async (oldTableName: string, newTableName: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`ALTER TABLE ${Symbol(oldTableName)} RENAME TO ${Symbol(
      newTableName
    )}`
    await updateNodeList()
  }

  const duplicateTable = async (oldTableName: string, newTableName: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`CREATE TABLE ${Symbol(
      newTableName
    )} AS SELECT * FROM ${Symbol(oldTableName)}`
    await updateNodeList()
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
    queryAllTables: queryAllNodes,
    createTableWithSql,
    createTableWithSqlAndInsertSqls,
    updateTableData,
    handleSql,
    undo,
    redo,
    withTransaction,
    createDoc,
    updateDoc,
    getDoc,
  }
}
