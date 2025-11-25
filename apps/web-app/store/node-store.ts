"use client"

import { orderBy } from "@/lib/lodash"
import { create } from "zustand"

import type { ITreeNode } from "@/packages/core/types/ITreeNode"

interface NodeState {
  // Current node state
  currentNode: ITreeNode | null
  setCurrentNode: (node: ITreeNode | null) => void

  // Node collection state
  nodeIds: string[]
  nodeMap: Record<string, ITreeNode>

  // Node management operations
  setAllNodes: (nodes: ITreeNode[]) => void
  setNode: (node: Partial<ITreeNode> & { id: string }) => void
  delNode: (nodeId: string) => void
  addNode: (node: ITreeNode) => void

  // Helper functions
  getNode: (nodeId: string) => ITreeNode | null
  getNodesByType: (type: ITreeNode["type"] | ITreeNode["type"][]) => ITreeNode[]
  getNodesByParent: (parentId: string) => ITreeNode[]
  getRootNodes: () => ITreeNode[]
}

export const useNodeStore = create<NodeState>()((set, get) => ({
  // Current node state
  currentNode: null,
  setCurrentNode: (node) => set({ currentNode: node }),

  // Node collection state
  nodeIds: [],
  nodeMap: {},

  // Set all nodes (replaces existing nodes)
  setAllNodes: (nodes) =>
    set(() => {
      const nodeIds = nodes.map((node) => node.id)
      const nodeMap = nodes.reduce((acc, cur) => {
        acc[cur.id] = cur
        return acc
      }, {} as Record<string, ITreeNode>)
      return { nodeIds, nodeMap }
    }),

  // Update a specific node
  setNode: (node: Partial<ITreeNode> & { id: string }) => {
    set((state) => {
      // Create a new nodeMap object
      const newNodeMap = {
        ...state.nodeMap,
        [node.id]: { ...state.nodeMap[node.id], ...node },
      }
      const nodeIds = orderBy(
        Object.keys(newNodeMap),
        (id) => newNodeMap[id].position,
        "desc"
      )
      return { nodeMap: newNodeMap, nodeIds }
    })
  },

  // Delete a node
  delNode: (nodeId: string) => {
    set((state) => {
      const { nodeIds, nodeMap } = state
      const newNodeIds = nodeIds.filter((id) => id !== nodeId)
      const newNodeMap = { ...nodeMap }
      delete newNodeMap[nodeId]
      const _nodeIds = orderBy(
        Object.keys(newNodeMap),
        (id) => newNodeMap[id].position,
        "desc"
      )
      return { nodeIds: _nodeIds, nodeMap: newNodeMap }
    })
  },

  // Add a new node
  addNode: (node: ITreeNode) => {
    set((state) => {
      const { nodeIds, nodeMap } = state
      const newNodeIds = [...nodeIds, node.id]
      const newNodeMap = { ...nodeMap, [node.id]: node }
      const _nodeIds = orderBy(
        Object.keys(newNodeMap),
        (id) => newNodeMap[id].position,
        "desc"
      )
      return { nodeIds: _nodeIds, nodeMap: newNodeMap }
    })
  },

  // Helper functions
  getNode: (nodeId: string) => {
    const { nodeMap } = get()
    return nodeMap[nodeId] || null
  },

  getNodesByType: (type: ITreeNode["type"] | ITreeNode["type"][]) => {
    const { nodeIds, nodeMap } = get()
    const types = Array.isArray(type) ? type : [type]
    return nodeIds
      .map((id) => nodeMap[id])
      .filter((node): node is ITreeNode =>
        node !== undefined &&
        (types.includes(node.type) || node.type.startsWith('ext__'))
      )
  },

  getNodesByParent: (parentId: string) => {
    const { nodeIds, nodeMap } = get()
    return nodeIds
      .map((id) => nodeMap[id])
      .filter((node): node is ITreeNode =>
        node !== undefined &&
        node.parent_id === parentId
      )
  },

  getRootNodes: () => {
    const { nodeIds, nodeMap } = get()
    return nodeIds
      .map((id) => nodeMap[id])
      .filter((node): node is ITreeNode =>
        node !== undefined &&
        !node.parent_id
      )
  },
}))
