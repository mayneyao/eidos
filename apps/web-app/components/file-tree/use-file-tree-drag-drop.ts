import { useCallback, useRef, useState } from "react"

import { useSqlite } from "@/hooks/use-sqlite"
import { useDragStore } from "@/apps/web-app/store/drag-store"

import type { FileTreeNode } from "./index"

interface ConfirmMovePayload {
  source: FileTreeNode
  target: FileTreeNode
  newPath: string
}

interface UseFileTreeDragDropOptions {
  isNodesMode: boolean
  loadRootDirectory: () => Promise<void>
  loadSubDirectory: (path: string) => Promise<void>
  expandedNodes: Set<string>
  setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>
  getPlaceholderText: (node: FileTreeNode) => string
  confirmMove?: (payload: ConfirmMovePayload) => Promise<boolean>
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
  confirmMove,
}: UseFileTreeDragDropOptions) => {
  const { sqlite } = useSqlite()
  const { setDragging } = useDragStore()
  const [dragOverNode, setDragOverNode] = useState<string | null>(null)
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const expandTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearExpandTimeout = useCallback(() => {
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current)
      expandTimeoutRef.current = null
    }
  }, [])

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: FileTreeNode) => {
      e.stopPropagation()
    setDraggingNode(node.path)
    setDragOverNode(null)
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

  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation()
      setDraggingNode(null)
      setDragOverNode(null)
      setDragging(false)
      clearExpandTimeout()
    },
    [clearExpandTimeout, setDragging]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, node: FileTreeNode) => {
      // Allow drag over on all nodes for external drop support (e.g., AI chat)
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"

      if (node.kind !== "directory") {
        setDragOverNode(null)
        clearExpandTimeout()
        return
      }

      const sameTarget = dragOverNode === node.path
      if (!sameTarget) {
        setDragOverNode(node.path)
        clearExpandTimeout()
      }

      const alreadyExpanded = expandedNodes.has(node.path)
      const hasPending = Boolean(expandTimeoutRef.current)
      if (!alreadyExpanded && !hasPending) {
        expandTimeoutRef.current = setTimeout(async () => {
          setExpandedNodes((prev) => {
            const next = new Set(prev)
            next.add(node.path)
            return next
          })
          try {
            await loadSubDirectory(node.path)
          } catch (err) {
            console.error("Failed to auto-expand on drag over:", err)
          } finally {
            expandTimeoutRef.current = null
          }
        }, 400)
      }
    },
    [
      clearExpandTimeout,
      dragOverNode,
      expandedNodes,
      loadSubDirectory,
      setExpandedNodes,
    ]
  )

  const handleDragEnter = useCallback((e: React.DragEvent, node: FileTreeNode) => {
    // Only allow drop on folders
    if (node.kind !== "directory") return

    e.preventDefault()
    e.stopPropagation()
    setDragOverNode(node.path)
  }, [])

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation()
      const related = e.relatedTarget as Node | null
      const isStillInside =
        related && e.currentTarget instanceof Element
          ? e.currentTarget.contains(related)
          : false

      if (!isStillInside) {
        setDragOverNode(null)
        clearExpandTimeout()
      }
    },
    [clearExpandTimeout]
  )

  const handleExternalDragOver = useCallback((e: React.DragEvent) => {
    // Allow drag over for external drop targets (e.g., AI chat)
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
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

        // Ask for confirmation before moving
        if (confirmMove) {
          const allow = await confirmMove({
            source: dragData,
            target: targetFolder,
            newPath,
          })
          if (!allow) {
            return
          }
        }

        // Call rename API to move the node
        await sqlite.fs.rename(dragData.path, newPath)

        // Reload tree data to reflect changes
        if (isNodesMode) {
          // In nodes mode, reload both source and target directories
          const sourceParentPath =
            dragData.path.split("/").slice(0, -1).join("/") || null
          if (sourceParentPath) {
            await loadSubDirectory(sourceParentPath)
          }
          await loadSubDirectory(targetFolder.path)
        } else {
          const sourceParentPath =
            dragData.path.split("/").slice(0, -1).join("/") || null
          if (sourceParentPath) {
            await loadSubDirectory(sourceParentPath)
          }
          await loadSubDirectory(targetFolder.path)
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
        clearExpandTimeout()
      }
    },
    [
      sqlite,
      isNodesMode,
      loadRootDirectory,
      loadSubDirectory,
      expandedNodes,
      setExpandedNodes,
      clearExpandTimeout,
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

