/**
 * React Hook for accessing persistent node IDs
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useCallback } from "react"
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  type NodeKey,
  type LexicalNode,
} from "lexical"
import {
  $getNodePersistentId,
  $setNodePersistentId,
  $hasNodePersistentId,
  $ensureNodePersistentId,
  generatePersistentId,
} from "../node-state"

/**
 * Hook for working with persistent node IDs
 * @returns Object with functions to get, set, and check persistent IDs
 */
export function usePersistentId() {
  const [editor] = useLexicalComposerContext()

  /**
   * Get the persistent ID of a node by its key
   */
  const getNodeId = useCallback(
    (nodeKey: NodeKey): string | null => {
      let id: string | null = null
      editor.read(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          id = $getNodePersistentId(node)
        }
      })
      return id
    },
    [editor]
  )

  /**
   * Get the persistent ID of the currently selected node
   */
  const getSelectedNodeId = useCallback((): string | null => {
    let id: string | null = null
    editor.read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      const node = selection.getNodes()[0]
      if (node) {
        id = $getNodePersistentId(node)
      }
    })
    return id
  }, [editor])

  /**
   * Set the persistent ID of a node
   */
  const setNodeId = useCallback(
    (nodeKey: NodeKey, id: string): void => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          $setNodePersistentId(node, id)
        }
      })
    },
    [editor]
  )

  /**
   * Check if a node has a persistent ID
   */
  const hasNodeId = useCallback(
    (nodeKey: NodeKey): boolean => {
      let hasId = false
      editor.read(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          hasId = $hasNodePersistentId(node)
        }
      })
      return hasId
    },
    [editor]
  )

  /**
   * Ensure a node has a persistent ID (generates one if not present)
   * @returns The persistent ID (existing or newly generated)
   */
  const ensureNodeId = useCallback(
    (nodeKey: NodeKey): string | null => {
      let id: string | null = null
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          id = $ensureNodePersistentId(node)
        }
      })
      return id
    },
    [editor]
  )

  /**
   * Get all nodes with their persistent IDs in the current editor state
   */
  const getAllNodeIds = useCallback((): Map<NodeKey, string> => {
    const result = new Map<NodeKey, string>()
    editor.read(() => {
      const state = editor.getEditorState()
      state._nodeMap.forEach((node, key) => {
        const id = $getNodePersistentId(node)
        if (id) {
          result.set(key, id)
        }
      })
    })
    return result
  }, [editor])

  /**
   * Find a node by its persistent ID
   */
  const findNodeById = useCallback(
    (id: string): { node: LexicalNode | null; key: NodeKey | null } => {
      let result: { node: LexicalNode | null; key: NodeKey | null } = {
        node: null,
        key: null,
      }
      editor.read(() => {
        const state = editor.getEditorState()
        state._nodeMap.forEach((node, key) => {
          if (!result.node && $getNodePersistentId(node) === id) {
            result = { node, key }
          }
        })
      })
      return result
    },
    [editor]
  )

  return {
    getNodeId,
    getSelectedNodeId,
    setNodeId,
    hasNodeId,
    ensureNodeId,
    getAllNodeIds,
    findNodeById,
    generateId: generatePersistentId,
  }
}
