import { useCallback, useState } from "react"

import { useSqlite } from "@/hooks/use-sqlite"
import { useDragStore } from "@/apps/web-app/store/drag-store"

import type { FileTreeNode } from "./index"

interface UseFileTreeDragDropOptions {
  isNodesMode: boolean
  loadRootDirectory: () => Promise<void>
  loadSubDirectory: (path: string) => Promise<void>
  expandedNodes: Set<string>
  setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>
  getPlaceholderText: (node: FileTreeNode) => string
}

/**
 * Hook for managing drag and drop operations in the file tree
 */
export const useFileTreeDragDrop = ({
  isNodesMode,
  loadRootDirectory,
  loadSubDirectory,
  expandedNodes,
  setExpandedNodes,
  getPlaceholderText,
}: UseFileTreeDragDropOptions) => {
  const { sqlite } = useSqlite()
  const { setDragging } = useDragStore()
  const [dragOverNode, setDragOverNode] = useState<string | null>(null)
  const [draggingNode, setDraggingNode] = useState<string | null>(null)

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: FileTreeNode) => {
      e.stopPropagation()
      setDraggingNode(node.path)
      setDragging(true, node)

      // Get display name for drag operations (handles empty names)
      const displayName =
        node.name && node.name.trim().length > 0
          ? node.name
          : getPlaceholderText(node)

      // Set drag data for cross-window drag support
      const dragData = {
        path: node.path,
        name: displayName,
        kind: node.kind,
        metadata: node.metadata,
      }

      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("application/eidos-node", JSON.stringify(dragData))
      e.dataTransfer.setData("text/plain", displayName) // Fallback for external apps
    },
    [getPlaceholderText, setDragging]
  )

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.stopPropagation()
    setDraggingNode(null)
    setDragOverNode(null)
    setDragging(false)
  }, [setDragging])

  const handleDragOver = useCallback(
    (e: React.DragEvent, node: FileTreeNode) => {
      // Allow drag over on all nodes for external drop support (e.g., AI chat)
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "copy"

      // Only set drag over state for directories (for visual feedback)
      if (node.kind === "directory") {
        if (dragOverNode !== node.path) {
          setDragOverNode(node.path)
        }
      } else {
        // Clear drag over state for files
        setDragOverNode(null)
      }
    },
    [dragOverNode]
  )

  const handleDragEnter = useCallback((e: React.DragEvent, node: FileTreeNode) => {
    // Only allow drop on folders
    if (node.kind !== "directory") return

    e.preventDefault()
    e.stopPropagation()
    setDragOverNode(node.path)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation()
    // Only clear if we're actually leaving this node (not entering a child)
    if (e.currentTarget === e.target) {
      setDragOverNode(null)
    }
  }, [])

  const handleExternalDragOver = useCallback((e: React.DragEvent) => {
    // Allow drag over for external drop targets (e.g., AI chat)
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetFolder: FileTreeNode) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverNode(null)

      // Only allow drop on folders
      if (targetFolder.kind !== "directory") return

      if (!sqlite) return

      try {
        // Get drag data
        const dragDataStr = e.dataTransfer.getData("application/eidos-node")
        if (!dragDataStr) return

        const dragData = JSON.parse(dragDataStr) as FileTreeNode

        // Prevent dropping onto itself
        if (dragData.path === targetFolder.path) {
          return
        }

        // Prevent dropping a folder into its own descendant
        if (targetFolder.path.startsWith(dragData.path + "/")) {
          console.warn("Cannot move a folder into its own descendant")
          return
        }

        // Construct new path: targetFolder/draggedNode
        const draggedNodeId = dragData.path.split("/").filter(Boolean).pop()
        const newPath = `${targetFolder.path}/${draggedNodeId}`

        // Call rename API to move the node
        await sqlite.fs.rename(dragData.path, newPath)

        // Reload tree data to reflect changes
        if (isNodesMode) {
          // In nodes mode, reload both source and target directories
          const sourceParentPath =
            dragData.path.split("/").slice(0, -1).join("/") || dragData.path
          if (sourceParentPath) {
            await loadSubDirectory(sourceParentPath)
          }
          await loadSubDirectory(targetFolder.path)
        } else {
          await loadRootDirectory()
        }

        // Optionally expand the target folder to show the moved item
        if (!expandedNodes.has(targetFolder.path)) {
          setExpandedNodes((prev) => new Set(prev).add(targetFolder.path))
          await loadSubDirectory(targetFolder.path)
        }
      } catch (error) {
        console.error("Failed to move node:", error)
      } finally {
        setDraggingNode(null)
      }
    },
    [
      sqlite,
      isNodesMode,
      loadRootDirectory,
      loadSubDirectory,
      expandedNodes,
      setExpandedNodes,
    ]
  )

  return {
    draggingNode,
    dragOverNode,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleExternalDragOver,
  }
}

