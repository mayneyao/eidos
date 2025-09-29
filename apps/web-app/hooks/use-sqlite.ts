"use client"

import { useCallback } from "react"
import type { DataSpace } from "@/packages/core/DataSpace"

import { TreeTableName } from "@/packages/core/sqlite/const"
import type { ITreeNode } from "@/packages/core/types/ITreeNode";
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { getRawTableNameById, uuidv7 } from "@/lib/utils"
import { DefaultState } from "@/components/doc/plugins/AutoLoadSavePlugin"
import { createTemplateTableSql } from "@/components/table/views/grid/helper"

import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useNodeStore } from "@/apps/web-app/store/node-store"
import { useAllNodes } from "./use-nodes"
import { isDesktopMode } from "@/lib/env"


export const useSqlite = (dbName?: string) => {
  const {
    isInitialized,
    sqliteProxy: sqlWorker,
    setAllUiColumns,
    resetTableData,
  } = useSqliteStore()
  const {
    setAllNodes,
    setNode,
    addNode,
    delNode,
  } = useNodeStore()
  const allNodes = useAllNodes()
  const { isShareMode } = useAppRuntimeStore()

  const queryAllNodes = useCallback(async () => {
    if (!sqlWorker) return
    const allNodes = await sqlWorker.tree.listNodes()
    // console.log("node list loaded", allNodes)
    return allNodes
  }, [sqlWorker])

  const queryAllUiColumns = useCallback(async () => {
    // console.log("queryAllUiColumns")
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

  const createTableAndRegister = async (data: {
    tableName: string
    tableId: string
    sql: string
    parent_id?: string
  }) => {
    if (!sqlWorker) return
    const { tableName, tableId, sql, parent_id } = data
    await sqlWorker.createTableViaSchema(tableId, tableName, sql, parent_id)
  }

  const createFolder = async (parent_id?: string) => {
    if (!sqlWorker) return
    const folderId = uuidv7().split("-").join("")
    const node = await sqlWorker.tree.addNode({
      id: folderId,
      name: "New Folder",
      type: TreeNodeType.Folder,
      parent_id,
    })
    node && addNode(node)
    return folderId
  }

  const createView = async (parent_id?: string) => {
    if (!sqlWorker) return
    const viewId = uuidv7().split("-").join("")
    const node = await sqlWorker.tree.addNode({
      id: viewId,
      name: "",
      type: TreeNodeType.Dataview,
      parent_id,
    })
    node && addNode(node)
    return viewId
  }

  const createExtNode = async (ext_node_type: string, parent_id?: string) => {
    if (!sqlWorker) return
    const nodeId = await sqlWorker.tree.createExtNode(ext_node_type, parent_id)
    nodeId && addNode({
      id: nodeId,
      name: "",
      type: `ext__${ext_node_type}`,
      parent_id,
    })
    return nodeId
  }

  // create table with default template
  const createTable = async (tableName: string, parent_id?: string) => {
    if (!sqlWorker) return
    const tableId = uuidv7().split("-").join("")
    const _tableName = getRawTableNameById(tableId)
    const sql = createTemplateTableSql(_tableName)
    //
    await createTableAndRegister({
      tableName,
      tableId,
      sql,
      parent_id,
    })
    const node = await sqlWorker.tree.getNode(tableId)
    node && addNode(node)
    return tableId
  }

  const createDoc = async (
    docName: string,
    parent_id?: string,
    nodeId?: string
  ) => {
    if (!sqlWorker) return
    const docId = nodeId || uuidv7().split("-").join("")
    const node = await sqlWorker.tree.addNode({
      id: docId,
      name: docName,
      type: TreeNodeType.Doc,
      parent_id: parent_id,
      hide_properties: true,
    })
    await sqlWorker.addDoc(docId, JSON.stringify(DefaultState), "")
    addNode(node)
    return docId
  }

  const getOrCreateTableSubDoc = async (data: {
    docId: string
    tableId: string
    title: string
  }) => {
    if (!sqlWorker) return null
    const { docId, tableId, title } = data
    const res = await sqlWorker.tree.getNode(docId)
    let node = res
    if (!res) {
      const treeNode = await sqlWorker.tree.addNode({
        id: docId,
        name: title,
        type: TreeNodeType.Doc,
        parent_id: tableId,
      })
      addNode2List(treeNode)
      await sqlWorker.addDoc(docId, "", "")
      node = treeNode
    }
    node && addNode(node)
    return node
  }

  const updateDoc = async (
    docId: string,
    content: string,
    markdown: string
  ) => {
    if (!sqlWorker) return
    await sqlWorker.updateDoc(docId, content, markdown)
  }

  const getDoc = useCallback(
    async (docId: string) => {
      if (!sqlWorker) return
      const doc = await sqlWorker.getDoc(docId)
      return doc
    },
    [sqlWorker]
  )
  const getDocMarkdown = useCallback(
    async (docId: string) => {
      if (!sqlWorker) return
      const doc = await sqlWorker.getDocMarkdown(docId)
      return doc
    },
    [sqlWorker]
  )

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
    // State will be updated automatically via database triggers
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
    addNode({
      id: tableId,
      name: tableName,
      type: TreeNodeType.Table,
    })
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
    await sqlWorker.deleteTable(tableId)
    delNode(tableId)
  }

  const deleteDoc = async (docId: string) => {
    if (!sqlWorker) return
    await sqlWorker.sql`DELETE FROM ${Symbol(
      TreeTableName
    )} WHERE id = ${docId}`
    await sqlWorker.deleteDoc(docId)
    delNode(docId)
  }

  const deleteView = async (viewId: string) => {
    if (!sqlWorker) return
    await sqlWorker.dataView.delete(viewId)
    delNode(viewId)
  }

  const restoreNode = async (node: ITreeNode) => {
    if (!sqlWorker) return
    sqlWorker.tree.restoreNode(node.id)
    // State will be updated automatically via database triggers
  }

  const toggleNodeFullWidth = async (node: ITreeNode) => {
    if (!sqlWorker) return
    sqlWorker.tree.toggleNodeFullWidth(node.id, !node.is_full_width)
    // State will be updated automatically via database triggers
  }

  const toggleNodeLock = async (node: ITreeNode) => {
    if (!sqlWorker) return
    sqlWorker.tree.toggleNodeLock(node.id, !node.is_locked)
    // State will be updated automatically via database triggers
  }
  const deleteNode = async (node: ITreeNode) => {
    if (!sqlWorker) return
    if (node.type === TreeNodeType.Dataview) {
      await deleteView(node.id)
    } else {
      sqlWorker.tree.deleteNode(node.id)
      // State will be updated automatically via database triggers
    }
  }

  const deleteExtNode = async (nodeId: string) => {
    if (!sqlWorker) return
    sqlWorker.tree.permanentlyDeleteExtNode(nodeId)
    delNode(nodeId)
  }

  const permanentlyDeleteNode = async (node: ITreeNode) => {
    switch (node.type) {
      case "table":
        await deleteTable(node.id)
        break
      case "doc":
        await deleteDoc(node.id)
        break
      case TreeNodeType.Dataview:
        await deleteView(node.id)
        break
      default:
        if (node.type.startsWith("ext__")) {
          await deleteExtNode(node.id)
        }
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
    await sqlWorker.tree.updateNodeName(nodeId, newName)
    // State will be updated automatically via database triggers
  }

  const rebuildFTS = async (tableId: string) => {
    if (!sqlWorker) return
    await sqlWorker.rebuildFTS(tableId)
    if (isDesktopMode) {
      await window.eidos.invoke('reload-query-worker')
    }
  }

  return {
    sqlite: isShareMode ? sqlWorker : isInitialized ? sqlWorker : null,
    createTable,
    deleteTable,
    createFolder,
    createExtNode,
    createView,
    duplicateTable,
    queryAllTables: queryAllNodes,
    updateNodeList,
    createTableWithSql,
    createTableWithSqlAndInsertSqls,
    updateTableData,
    handleSql,
    undo,
    redo,
    createDoc,
    updateDoc,
    renameNode,
    getDoc,
    getDocMarkdown,
    deleteNode,
    restoreNode,
    toggleNodeFullWidth,
    toggleNodeLock,
    permanentlyDeleteNode,
    getOrCreateTableSubDoc,
    updateNodeName,
    rebuildFTS,
    resetTableData
  }
}
