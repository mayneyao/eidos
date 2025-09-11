"use client"

import { useCallback } from "react"
import type { DataSpace } from "@/packages/core/DataSpace"
import orderBy from "lodash/orderBy"
import { create } from "zustand"

import { TreeTableName } from "@/packages/core/sqlite/const"
import type { ITreeNode } from "@/packages/core/types/ITreeNode";
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import type { IView } from "@/packages/core/types/IView"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { getRawTableNameById, uuidv7 } from "@/lib/utils"
import { DefaultState } from "@/components/doc/plugins/AutoLoadSavePlugin"
import { createTemplateTableSql } from "@/components/table/views/grid/helper"

import type { IDataStore } from "@/apps/web-app/store/interface"
import type { IField } from "@/packages/core/types/IField"
import { useAllNodes } from "./use-nodes"
import { isDesktopMode } from "@/lib/env"

interface SqliteState {
  isInitialized: boolean
  setInitialized: (isInitialized: boolean) => void

  currentNode: ITreeNode | null
  setCurrentNode: (node: ITreeNode | null) => void

  dataStore: IDataStore
  setAllNodes: (tables: ITreeNode[]) => void
  setNode: (node: Partial<ITreeNode> & { id: string }) => void
  delNode: (nodeId: string) => void
  addNode: (node: ITreeNode) => void

  allUiColumns: IField[]
  setAllUiColumns: (columns: IField[]) => void

  setViews: (tableId: string, views: IView[]) => void
  setFields: (tableId: string, fields: IField[]) => void
  setRows: (tableId: string, rows: Record<string, any>[], offset?: number, isView?: boolean) => void
  delRows: (tableId: string, rowIds: string[]) => void
  getRowById: (tableId: string, rowId: string) => Record<string, any> | null
  getRowIds: (tableId: string) => string[]

  setView: (tableId: string, viewId: string, view: Partial<IView>) => void

  cleanFieldData: (tableId: string, fieldId: string) => void

  selectedTable: string
  setSelectedTable: (table: string) => void

  spaceList: string[]
  setSpaceList: (spaceList: string[]) => void

  // const [sqlWorker, setSQLWorker] = useState<SqlDatabase>()

  sqliteProxy: DataSpace | null
  setSqliteProxy: (sqlWorker: DataSpace) => void
}

// not using persist
export const useSqliteStore = create<SqliteState>()((set, get) => ({
  isInitialized: false,
  setInitialized: (isInitialized) => set({ isInitialized }),

  dataStore: {
    nodeIds: [],
    nodeMap: {},
    tableMap: {},
  },

  cleanFieldData: (tableId: string, fieldId: string) => {
    set((state) => {
      const { tableMap } = state.dataStore
      if (!tableMap[tableId]) {
        tableMap[tableId] = {
          rowMap: {},
          fieldMap: {},
          viewIds: [],
          viewMap: {},
        }
      }
      for (const rowId in tableMap[tableId].rowMap) {
        delete tableMap[tableId].rowMap[rowId][fieldId]
      }
      return { dataStore: { ...state.dataStore, tableMap } }
    })
  },
  setViews: (tableId: string, views: IView[]) => {
    set((state) => {
      const { tableMap } = state.dataStore
      if (!tableMap[tableId]) {
        tableMap[tableId] = {
          rowMap: {},
          fieldMap: {},
          viewIds: [],
          viewMap: {},
        }
      }
      tableMap[tableId].viewIds = views.map((view) => view.id)
      tableMap[tableId].viewMap = views.reduce((acc, cur) => {
        acc[cur.id] = cur
        return acc
      }, {} as Record<string, IView>)
      return { dataStore: { ...state.dataStore, tableMap } }
    })
  },

  setView: (tableId: string, viewId: string, view: Partial<IView>) => {
    set((state) => {
      const { tableMap } = state.dataStore
      if (!tableMap[tableId]) {
        tableMap[tableId] = {
          rowMap: {},
          fieldMap: {},
          viewIds: [],
          viewMap: {},
        }
      }
      tableMap[tableId].viewMap[viewId] = { ...tableMap[tableId].viewMap[viewId], ...view }
      return { dataStore: { ...state.dataStore, tableMap } }
    })
  },

  setFields: (tableId: string, fields: IField[]) => {
    set((state) => {
      const { tableMap } = state.dataStore
      if (!tableMap[tableId]) {
        tableMap[tableId] = {
          rowMap: {},
          fieldMap: {},
          viewIds: [],
          viewMap: {},
        }
      }
      tableMap[tableId].fieldMap = fields.reduce((acc, cur) => {
        acc[cur.name] = cur
        return acc
      }, {} as Record<string, IField>)
      const res = { dataStore: { ...state.dataStore, tableMap } }
      return res
    })
  },

  setRows: (tableId: string, rows: Record<string, any>[], offset?: number, isView?: boolean) => {
    set((state) => {
      const { tableMap } = state.dataStore
      if (!tableMap[tableId]) {
        tableMap[tableId] = {
          rowMap: {},
          fieldMap: {},
          viewIds: [],
          viewMap: {},
        }
      }
      const newRowMap = rows.reduce((acc, cur, index) => {
        if (!isView) {
          acc[cur._id] = cur
        } else {
          acc[index + (offset || 0)] = cur
        }
        return acc
      }, {} as Record<string, any>)
      tableMap[tableId].rowMap = {
        ...tableMap[tableId].rowMap,
        ...newRowMap,
      }
      return { dataStore: { ...state.dataStore, tableMap } }
    })
  },
  getRowIds: (tableId: string) => {
    const { tableMap } = get().dataStore
    if (!tableMap[tableId]) {
      return []
    }
    return Object.keys(tableMap[tableId].rowMap)
  },
  delRows: (tableId: string, rowIds: string[]) => {
    set((state) => {
      const { tableMap } = state.dataStore
      if (!tableMap[tableId]) {
        tableMap[tableId] = {
          rowMap: {},
          fieldMap: {},
          viewIds: [],
          viewMap: {},
        }
      }
      rowIds.forEach((rowId) => {
        delete tableMap[tableId].rowMap[rowId]
      })
      return { dataStore: { ...state.dataStore, tableMap } }
    })
  },
  getRowById(tableId: string, rowId: string) {
    const { tableMap } = get().dataStore
    if (!tableMap[tableId]) {
      return null
    }
    return tableMap[tableId].rowMap[rowId]
  },

  currentNode: null,
  setCurrentNode: (node) => set({ currentNode: node }),

  setAllNodes: (nodes) =>
    set((state) => {
      const nodeIds = nodes.map((table) => table.id)
      const nodeMap = nodes.reduce((acc, cur) => {
        acc[cur.id] = cur
        return acc
      }, {} as Record<string, ITreeNode>)
      return { dataStore: { ...state.dataStore, nodeIds, nodeMap } }
    }),

  allUiColumns: [],
  setAllUiColumns: (columns) => set({ allUiColumns: columns }),

  selectedTable: "",
  setSelectedTable: (table) => set({ selectedTable: table }),

  spaceList: [],
  setSpaceList: (spaceList) => set({ spaceList }),

  sqliteProxy: null,
  setSqliteProxy: (sqlWorker) => {
    // for debug
    ; (window as any).sqlite = sqlWorker
    return set({ sqliteProxy: sqlWorker })
  },

  setNode: (node: Partial<ITreeNode> & { id: string }) => {
    set((state) => {
      // Create a new nodeMap object
      const newNodeMap = {
        ...state.dataStore.nodeMap,
        [node.id]: { ...state.dataStore.nodeMap[node.id], ...node },
      }
      const nodeIds = orderBy(
        Object.keys(newNodeMap),
        (id) => newNodeMap[id].position,
        "desc"
      )
      // Return the new nodeMap in the updated state
      return { dataStore: { ...state.dataStore, nodeMap: newNodeMap, nodeIds } }
    })
  },


  delNode: (nodeId: string) => {
    set((state) => {
      const { nodeIds, nodeMap } = state.dataStore
      const index = nodeIds.findIndex((id) => id === nodeId)
      if (index > -1) {
        nodeIds.splice(index, 1)
      }
      delete nodeMap[nodeId]
      const _nodeIds = orderBy(
        Object.keys(nodeMap),
        (id) => nodeMap[id].position,
        "desc"
      )
      return { dataStore: { ...state.dataStore, nodeIds: _nodeIds, nodeMap } }
    })
  },
  addNode: (node: ITreeNode) => {
    set((state) => {
      const { nodeIds, nodeMap } = state.dataStore
      nodeIds.push(node.id)
      nodeMap[node.id] = node
      const _nodeIds = orderBy(
        Object.keys(nodeMap),
        (id) => nodeMap[id].position,
        "desc"
      )
      return { dataStore: { ...state.dataStore, nodeIds: _nodeIds, nodeMap } }
    })
  },
}))

export const useSqlite = (dbName?: string) => {
  const {
    isInitialized,
    sqliteProxy: sqlWorker,
    setAllNodes,
    setNode,
    addNode,
    delNode,
    setAllUiColumns,
  } = useSqliteStore()
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
    setNode({ id: nodeId, name: newName })
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
    setNode({
      id: node.id,
      is_deleted: false,
    })
  }

  const toggleNodeFullWidth = async (node: ITreeNode) => {
    if (!sqlWorker) return
    sqlWorker.tree.toggleNodeFullWidth(node.id, !node.is_full_width)
    setNode({
      id: node.id,
      is_full_width: !node.is_full_width,
    })
  }

  const toggleNodeLock = async (node: ITreeNode) => {
    if (!sqlWorker) return
    sqlWorker.tree.toggleNodeLock(node.id, !node.is_locked)
    setNode({
      id: node.id,
      is_locked: !node.is_locked,
    })
  }
  const deleteNode = async (node: ITreeNode) => {
    if (!sqlWorker) return
    if (node.type === TreeNodeType.Dataview) {
      await deleteView(node.id)
    } else {
      sqlWorker.tree.deleteNode(node.id)
      setNode({
        id: node.id,
        is_deleted: true,
      })
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
    setNode({
      id: nodeId,
      name: newName,
    })
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
    rebuildFTS
  }
}
