"use client"

import orderBy from "lodash/orderBy"
import { create } from "zustand"

import type { IDataStore } from "@/apps/web-app/store/interface"
import type { DataSpace } from "@/packages/core/DataSpace"
import type { IField } from "@/packages/core/types/IField"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import type { IView } from "@/packages/core/types/IView"

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
  resetTableData: (tableId: string) => void

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

  resetTableData: (tableId: string) => {
    set((state) => {
      const { tableMap } = state.dataStore
      if (tableMap[tableId]) {
        // Reset all data for the table
        tableMap[tableId] = {
          rowMap: {},
          fieldMap: {},
          viewIds: [],
          viewMap: {},
        }
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
