import { useCallback, useEffect } from "react"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useAIChatStore } from "../store"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

export interface ContextNodeEditorRef {
  deleteMentionNode: (id: string) => void
}

/**
 * Hook for managing context nodes in AI chat
 * Provides a clean interface for adding, removing, and clearing context nodes
 * Handles synchronization between store state and editor mention nodes
 */
export const useContextNodes = () => {
  const {
    contextNodes,
    addContextNode,
    removeContextNode,
    clearContextNodes,
  } = useAIChatStore()

  /**
   * Add a node to context, handles duplicates automatically
   */
  const addNode = useCallback((node: ITreeNode) => {
    console.log("Adding context node:", node.name, node.id)
    addContextNode(node)
  }, [addContextNode])

  /**
   * Remove a node from context and also remove it from the editor
   */
  const removeNode = useCallback((
    nodeId: string,
    editorRef?: React.RefObject<ContextNodeEditorRef>
  ) => {
    console.log("Removing context node:", nodeId)
    removeContextNode(nodeId)
    // Also remove from editor if ref is provided
    editorRef?.current?.deleteMentionNode(nodeId)
  }, [removeContextNode])

  /**
   * Clear all context nodes
   */
  const clearNodes = useCallback(() => {
    clearContextNodes()
  }, [clearContextNodes])


  /**
   * Check if a node exists in context
   */
  const hasNode = useCallback((nodeId: string) => {
    return contextNodes.some(node => node.id === nodeId)
  }, [contextNodes])

  /**
   * Get node by id from context
   */
  const getNode = useCallback((nodeId: string) => {
    return contextNodes.find(node => node.id === nodeId)
  }, [contextNodes])

  /**
   * Get context nodes count
   */
  const getCount = useCallback(() => {
    return contextNodes.length
  }, [contextNodes])

  return {
    contextNodes,
    addNode,
    removeNode,
    clearNodes,
    hasNode,
    getNode,
    getCount,
  }
} 