/**
 * Utility functions for working with persistent IDs in serialized editor states
 */

import type { SerializedEditorState, SerializedLexicalNode } from "lexical"
import { generatePersistentId, PERSISTENT_ID_KEY } from "../node-state"

/**
 * Serialized node with persistent ID
 */
export interface SerializedNodeWithPersistentId extends SerializedLexicalNode {
  [key: string]: any
  /** Node state containing persistent ID */
  $?: {
    pid?: string
    [key: string]: any
  }
}

/**
 * Check if a serialized node has a persistent ID
 */
export function hasSerializedNodePersistentId(
  node: SerializedLexicalNode
): boolean {
  const nodeWithId = node as SerializedNodeWithPersistentId
  return !!nodeWithId.$?.pid
}

/**
 * Get the persistent ID from a serialized node
 */
export function getSerializedNodePersistentId(
  node: SerializedLexicalNode
): string | undefined {
  const nodeWithId = node as SerializedNodeWithPersistentId
  return nodeWithId.$?.pid
}

/**
 * Set the persistent ID on a serialized node
 */
export function setSerializedNodePersistentId(
  node: SerializedLexicalNode,
  id: string
): void {
  const nodeWithId = node as SerializedNodeWithPersistentId
  if (!nodeWithId.$) {
    nodeWithId.$ = {}
  }
  nodeWithId.$.pid = id
}

/**
 * Recursively add persistent IDs to all nodes in a serialized editor state
 * This is useful when importing documents that don't have IDs yet
 *
 * @param state - The serialized editor state
 * @param idGenerator - Optional custom ID generator
 * @returns The state with IDs added (mutates in place for efficiency)
 */
export function addPersistentIdsToState(
  state: SerializedEditorState,
  idGenerator: () => string = generatePersistentId
): SerializedEditorState {
  function processNode(node: SerializedLexicalNode): void {
    // Skip root node
    if (node.type === "root") {
      // Process children
      if ("children" in node && Array.isArray(node.children)) {
        node.children.forEach(processNode)
      }
      return
    }

    // Add ID if not present
    if (!hasSerializedNodePersistentId(node)) {
      setSerializedNodePersistentId(node, idGenerator())
    }

    // Process children recursively
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(processNode)
    }
  }

  processNode(state.root)
  return state
}

/**
 * Remove persistent IDs from all nodes in a serialized editor state
 * Useful when exporting documents without internal IDs
 *
 * @param state - The serialized editor state
 * @returns A new state without persistent IDs
 */
export function removePersistentIdsFromState(
  state: SerializedEditorState
): SerializedEditorState {
  function processNode(node: SerializedLexicalNode): SerializedLexicalNode {
    const nodeCopy = { ...node } as SerializedNodeWithPersistentId

    // Remove ID if present
    if (nodeCopy.$) {
      const { pid, ...restState } = nodeCopy.$
      if (Object.keys(restState).length === 0) {
        delete (nodeCopy as any).$
      } else {
        nodeCopy.$ = restState
      }
    }

    // Process children
    if ("children" in nodeCopy && Array.isArray(nodeCopy.children)) {
      nodeCopy.children = nodeCopy.children.map(processNode)
    }

    return nodeCopy
  }

  return {
    root: processNode(state.root) as any,
  }
}

/**
 * Find a node by its persistent ID in a serialized editor state
 *
 * @param state - The serialized editor state
 * @param id - The persistent ID to search for
 * @returns The node with the matching ID, or null if not found
 */
export function findNodeByPersistentIdInState(
  state: SerializedEditorState,
  id: string
): SerializedLexicalNode | null {
  let found: SerializedLexicalNode | null = null

  function searchNode(node: SerializedLexicalNode): boolean {
    if (getSerializedNodePersistentId(node) === id) {
      found = node
      return true
    }

    // Search children
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (searchNode(child)) {
          return true
        }
      }
    }

    return false
  }

  searchNode(state.root)
  return found
}

/**
 * Build a map of persistent IDs to nodes in a serialized editor state
 *
 * @param state - The serialized editor state
 * @returns Map of persistent ID to node
 */
export function buildPersistentIdMap(
  state: SerializedEditorState
): Map<string, SerializedLexicalNode> {
  const map = new Map<string, SerializedLexicalNode>()

  function processNode(node: SerializedLexicalNode): void {
    const id = getSerializedNodePersistentId(node)
    if (id) {
      map.set(id, node)
    }

    // Process children
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(processNode)
    }
  }

  processNode(state.root)
  return map
}

/**
 * Compare two serialized editor states and find nodes with matching persistent IDs
 * This is useful for detecting moved or changed nodes between versions
 *
 * @param oldState - The old editor state
 * @param newState - The new editor state
 * @returns Object containing added, removed, and changed nodes
 */
export function diffStatesByPersistentId(
  oldState: SerializedEditorState,
  newState: SerializedEditorState
): {
  added: SerializedLexicalNode[]
  removed: SerializedLexicalNode[]
  changed: Array<{ old: SerializedLexicalNode; new: SerializedLexicalNode }>
  unchanged: Array<{ old: SerializedLexicalNode; new: SerializedLexicalNode }>
} {
  const oldMap = buildPersistentIdMap(oldState)
  const newMap = buildPersistentIdMap(newState)

  const added: SerializedLexicalNode[] = []
  const removed: SerializedLexicalNode[] = []
  const changed: Array<{
    old: SerializedLexicalNode
    new: SerializedLexicalNode
  }> = []
  const unchanged: Array<{
    old: SerializedLexicalNode
    new: SerializedLexicalNode
  }> = []

  // Find added and changed nodes
  newMap.forEach((newNode, id) => {
    const oldNode = oldMap.get(id)
    if (!oldNode) {
      added.push(newNode)
    } else {
      // Compare nodes (simple JSON comparison)
      const isEqual = JSON.stringify(oldNode) === JSON.stringify(newNode)
      if (isEqual) {
        unchanged.push({ old: oldNode, new: newNode })
      } else {
        changed.push({ old: oldNode, new: newNode })
      }
    }
  })

  // Find removed nodes
  oldMap.forEach((oldNode, id) => {
    if (!newMap.has(id)) {
      removed.push(oldNode)
    }
  })

  return { added, removed, changed, unchanged }
}
