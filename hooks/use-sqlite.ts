"use client"

import { useCallback } from "react"
import type { DataSpace } from "@/worker/DataSpace"
import { ITreeNode } from "@/worker/meta_table/tree"
import { create } from "zustand"

import { TreeTableName } from "@/lib/sqlite/const"
import { getRawTableNameById, uuidv4 } from "@/lib/utils"
import { createTemplateTableSql } from "@/components/grid/helper"

import { IUIColumn } from "./use-table"

interface SqliteState {
  isInitialized: boolean
  setInitialized: (isInitialized: boolean) => void

  currentDatabase: string
  setCurrentDatabase: (database: string) => void

  currentNode: ITreeNode | null
  setCurrentNode: (node: ITreeNode | null) => void

  allNodes: ITreeNode[]
  setAllNodes: (tables: ITreeNode[]) => void

  allUiColumns: IUIColumn[]
  setAllUiColumns: (columns: IUIColumn[]) => void

  selectedTable: string
  setSelectedTable: (table: string) => void

  spaceList: string[]
  setSpaceList: (spaceList: string[]) => void

  // const [sqlWorker, setSQLWorker] = useState<SqlDatabase>()

  sqliteProxy: DataSpace | null
  setSqliteProxy: (sqlWorker: DataSpace) => void
}

// not using persist
export const useSqliteStore = create<SqliteState>()((set) => ({
  isInitialized: false,
  setInitialized: (isInitialized) => set({ isInitialized }),

  currentDatabase: "",
  setCurrentDatabase: (database) => set({ currentDatabase: database }),

  currentNode: null,
  setCurrentNode: (node) => set({ currentNode: node }),

  allNodes: [],
  setAllNodes: (tables) => set({ allNodes: tables }),

  allUiColumns: [],
  setAllUiColumns: (columns) => set({ allUiColumns: columns }),

  selectedTable: "",
  setSelectedTable: (table) => set({ selectedTable: table }),

  spaceList: [],
  setSpaceList: (spaceList) => set({ spaceList }),

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
    allNodes,
    setAllNodes,
    setAllUiColumns,
  } = useSqliteStore()

  const queryAllNodes = useCallback(async () => {
    if (!sqlWorker) return
    const allNodes = await sqlWorker.listTreeNodes()
    console.log("node list loaded", allNodes)
    return allNodes
  }, [sqlWorker])

  const queryAllUiColumns = useCallback(async () => {
    console.log("queryAllUiColumns")
    if (!sqlWorker) return
    const allUiColumns = await sqlWorker.listAllUiColumns()
    // console.log("ui column list loaded", allUiColumns)
    return allUiColumns
  }, [sqlWorker])

  const updateNodeList = useCallback(async () => {
    await queryAllNodes().then((nodes) => {
      nodes && setAllNodes(nodes)
    })
    await queryAllUiColumns().then((columns) => {
      columns && setAllUiColumns(columns)
    })
  }, [queryAllNodes, queryAllUiColumns, setAllNodes, setAllUiColumns])

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
      await sqlWorker.addTreeNode({
        id: tableId,
        name: tableName,
        type: "table",
      })
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
    await sqlWorker.addTreeNode({
      id: docId,
      name: docName,
      type: "doc",
    })
    await sqlWorker.addDoc(docId, "")
    await updateNodeList()
    return docId
  }

  const getOrCreateTableSubDoc = async (data: {
    docId: string
    tableId: string
    title: string
  }) => {
    if (!sqlWorker) return
    const { docId, tableId, title } = data
    const res = await sqlWorker.getTreeNode(docId)
    if (!res) {
      const treeNode = await sqlWorker.addTreeNode({
        id: docId,
        name: title,
        type: "doc",
        parentId: tableId,
      })
      addNode2List(treeNode)
      await sqlWorker.addDoc(docId, "")
    }
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

  const addNode2List = useCallback(
    (node: ITreeNode) => {
      setAllNodes([...allNodes, node])
    },
    [allNodes, setAllNodes]
  )

  const renameNode = async (nodeId: string, newName: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`UPDATE ${Symbol(
      TreeTableName
    )} SET name = ${newName} WHERE id = ${nodeId};`
    await updateNodeList()
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

  const deleteDoc = async (docId: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`DELETE FROM ${Symbol(
      TreeTableName
    )} WHERE id = ${docId}`
    await sqlWorker.deleteDoc(docId)
    await updateNodeList()
  }

  const deleteNode = async (node: ITreeNode) => {
    if (!sqlWorker) return
    switch (node.type) {
      case "table":
        await deleteTable(node.id)
        break
      case "doc":
        await deleteDoc(node.id)
        break
      default:
        break
    }
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

  const updateNodeName = async (nodeId: string, newName: string) => {
    if (!sqlWorker) return
    await sqlWorker.updateTreeNodeName(nodeId, newName)
    await updateNodeList()
  }

  return {
    sqlite: isInitialized ? sqlWorker : null,
    createTable,
    deleteTable,
    duplicateTable,
    queryAllTables: queryAllNodes,
    updateNodeList,
    createTableWithSql,
    createTableWithSqlAndInsertSqls,
    updateTableData,
    handleSql,
    undo,
    redo,
    withTransaction,
    createDoc,
    updateDoc,
    renameNode,
    getDoc,
    deleteNode,
    getOrCreateTableSubDoc,
    updateNodeName,
  }
}
