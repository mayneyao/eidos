"use client"

import React, { useEffect, useRef, useState } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  BlocksIcon,
  ChevronDown,
  ChevronRight,
  File,
  FileSpreadsheet,
  Folder,
  Pin,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useEvent } from "@/hooks/use-event"
import { useSqlite } from "@/hooks/use-sqlite"
import { IconRenderer } from "@/components/ui/icon-picker"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"

import { FileTreeContextMenu } from "./file-tree-context-menu"
import { InlineEdit } from "./inline-edit"
import { useFileTreeOperations } from "./use-file-tree-operations"

export interface FileTreeNode extends IDirectoryEntry {
  children?: FileTreeNode[]
}

interface FileTreeProps {
  /** Root directory path - used when loading from file system */
  rootDir?: string
  /** Initial nodes - used when providing pre-existing nodes */
  nodes?: FileTreeNode[]
  /** Base directory path for operations when using nodes mode */
  baseDir?: string
}

const FileTree = ({ rootDir, nodes, baseDir }: FileTreeProps) => {
  const { sqlite } = useSqlite()
  const navigate = useNavigate()
  const { space } = useCurrentPathInfo()
  const { isFavorite } = useFavBlocks()

  // Determine which mode we're in
  const isNodesMode = nodes !== undefined
  const effectiveRootDir = rootDir || baseDir || "~/"

  const [treeData, setTreeData] = useState<FileTreeNode[]>(nodes || [])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [renamingNode, setRenamingNode] = useState<string | null>(null)
  const [dragOverNode, setDragOverNode] = useState<string | null>(null)
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Context menu operations - use baseDir or rootDir for path detection
  const {
    handleDelete,
    handlePin,
    handleUnpin,
    handleAddToChat,
    handleCreateDoc,
    handleCreateTable,
    handleCreateFolder,
    handleCopySlug,
  } = useFileTreeOperations(effectiveRootDir)

  const loadRootDirectory = async () => {
    if (!sqlite || !rootDir) return

    try {
      const entries = await sqlite.fs.readdir(rootDir, {
        withFileTypes: true,
      })

      const sortedEntries = entries.sort((a, b) => {
        if (a.kind === "directory" && b.kind !== "directory") return -1
        if (a.kind !== "directory" && b.kind === "directory") return 1
        return a.name.localeCompare(b.name)
      })

      setTreeData(sortedEntries)
    } catch (error) {
      console.error("Failed to load root directory:", error)
    }
  }

  const loadSubDirectory = async (path: string) => {
    if (!sqlite) return
    if (loadingNodes.has(path)) return

    setLoadingNodes((prev) => new Set(prev).add(path))

    try {
      const entries = await sqlite.fs.readdir(path, {
        withFileTypes: true,
      })

      const sortedEntries = entries.sort((a, b) => {
        if (a.kind === "directory" && b.kind !== "directory") return -1
        if (a.kind !== "directory" && b.kind === "directory") return 1
        return a.name.localeCompare(b.name)
      })

      const updateTreeData = (
        nodes: FileTreeNode[],
        targetPath: string,
        newChildren: FileTreeNode[]
      ): FileTreeNode[] => {
        return nodes.map((node) => {
          if (node.path === targetPath) {
            return { ...node, children: newChildren }
          }
          if (node.children) {
            return {
              ...node,
              children: updateTreeData(node.children, targetPath, newChildren),
            }
          }
          return node
        })
      }

      setTreeData((prev) => updateTreeData(prev, path, sortedEntries))
    } catch (error) {
      console.error(`Failed to load directory ${path}:`, error)
    } finally {
      setLoadingNodes((prev) => {
        const newSet = new Set(prev)
        newSet.delete(path)
        return newSet
      })
    }
  }

  const toggleNode = async (node: FileTreeNode) => {
    const newExpanded = new Set(expandedNodes)
    if (expandedNodes.has(node.path)) {
      newExpanded.delete(node.path)
    } else {
      newExpanded.add(node.path)
      if (node.kind === "directory" && !node.children) {
        await loadSubDirectory(node.path)
      }
    }
    setExpandedNodes(newExpanded)
  }

  const handleFileClick = (node: FileTreeNode) => {
    // Set selected node
    setSelectedNode(node.path)

    if (!space) {
      console.error("Space not available for navigation")
      return
    }

    // Route based on metadata type
    if (node.metadata?.nodeType && node.metadata?.nodeType !== "extension") {
      // Navigate to node (table, doc, folder, dataview)
      navigate(`/${node.metadata.nodeId}`)
    } else if (node.metadata?.nodeType === "extension") {
      // Navigate to extension
      navigate(`/extensions/${node.metadata.nodeId}`)
    } else {
      // Regular file - use file handler
      navigate(`/file-handler#${node.path}`)
    }

    // Scroll to the selected node
    scrollToNode(node.path)
  }

  const scrollToNode = (nodePath: string) => {
    const nodeElement = nodeRefs.current.get(nodePath)
    if (nodeElement) {
      nodeElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }
  }

  const findNodeByPath = (
    nodes: FileTreeNode[],
    targetPath: string
  ): FileTreeNode | null => {
    // Direct path matching - both use ID-based paths now
    for (const node of nodes) {
      if (node.path === targetPath) {
        return node
      }

      if (node.children) {
        const found = findNodeByPath(node.children, targetPath)
        if (found) return found
      }
    }
    return null
  }

  const startRename = (nodePath: string) => {
    setRenamingNode(nodePath)
  }

  const cancelRename = () => {
    setRenamingNode(null)
  }

  const handleRenameConfirm = async (node: FileTreeNode, newName: string) => {
    if (!sqlite || !newName.trim()) {
      cancelRename()
      return
    }

    if (newName === node.name) {
      cancelRename()
      return
    }

    try {
      // Construct new path
      // For virtual paths, we just need to change the last segment (the name)
      const pathParts = node.path.split("/")
      pathParts[pathParts.length - 1] = newName
      const newPath = pathParts.join("/")

      // Call rename API
      await sqlite.fs.rename(node.path, newPath)

      // Reload tree data to reflect changes
      if (isNodesMode) {
        // In nodes mode, reload the parent directory
        const parentPath =
          node.parentPath ||
          node.path.split("/").slice(0, -1).join("/") ||
          node.path
        if (parentPath) {
          await loadSubDirectory(parentPath)
        } else {
          // If no parent, reload all root nodes by re-initializing
          if (nodes) {
            setTreeData([...nodes])
          }
        }
      } else {
        await loadRootDirectory()
      }

      cancelRename()
    } catch (error) {
      console.error("Failed to rename:", error)
      // Keep the rename input open so user can try again or cancel
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, node: FileTreeNode) => {
    e.stopPropagation()
    setDraggingNode(node.path)

    // Set drag data for cross-window drag support
    const dragData = {
      path: node.path,
      name: node.name,
      kind: node.kind,
      metadata: node.metadata,
    }

    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("application/eidos-node", JSON.stringify(dragData))
    e.dataTransfer.setData("text/plain", node.name) // Fallback for external apps
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation()
    setDraggingNode(null)
    setDragOverNode(null)
  }

  const handleDragOver = (e: React.DragEvent, node: FileTreeNode) => {
    // Only allow drop on folders
    if (node.kind !== "directory") return

    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"

    if (dragOverNode !== node.path) {
      setDragOverNode(node.path)
    }
  }

  const handleDragEnter = (e: React.DragEvent, node: FileTreeNode) => {
    // Only allow drop on folders
    if (node.kind !== "directory") return

    e.preventDefault()
    e.stopPropagation()
    setDragOverNode(node.path)
  }

  const handleDragLeave = (e: React.DragEvent, node: FileTreeNode) => {
    e.stopPropagation()
    // Only clear if we're actually leaving this node (not entering a child)
    if (e.currentTarget === e.target) {
      setDragOverNode(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, targetFolder: FileTreeNode) => {
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
  }

  // Handle keyboard events for rename
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if we're already renaming
      if (renamingNode) return

      // Enter key to start rename
      if (e.key === "Enter" && selectedNode) {
        e.preventDefault()
        e.stopPropagation()
        startRename(selectedNode)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedNode, renamingNode])

  const getNodeIcon = (node: FileTreeNode) => {
    // Use custom icon from metadata if available
    if (node.metadata?.icon) {
      return (
        <IconRenderer name={node.metadata.icon as any} className="w-4 h-4" />
      )
    }

    // Use default icons based on node type
    if (node.kind === "directory") {
      return <Folder className="w-4 h-4 text-muted-foreground" />
    }

    switch (node.metadata?.nodeType) {
      case "table":
        return <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
      case "doc":
        return <File className="w-4 h-4 text-muted-foreground" />
      case "extension":
        return <BlocksIcon className="w-4 h-4 text-muted-foreground" />
      case "folder":
        return <Folder className="w-4 h-4 text-muted-foreground" />
      default:
        return <File className="w-4 h-4 text-muted-foreground" />
    }
  }

  const renderTreeNode = (node: FileTreeNode, level = 0) => {
    const isExpanded = expandedNodes.has(node.path)
    const isLoading = loadingNodes.has(node.path)
    const hasChildren = node.kind === "directory"
    const isPinned = node.metadata?.isPinned
    const isSelected = selectedNode === node.path
    const isRenaming = renamingNode === node.path
    const isDragging = draggingNode === node.path
    const isDragOver = dragOverNode === node.path
    const canDrop = hasChildren && !isDragging
    const isVirtualNode = node.metadata?.nodeType !== undefined

    // Check if extension is pinned (for extensions)
    const isExtension = node.metadata?.nodeType === "extension"
    const isExtensionPinned =
      isExtension && node.metadata?.nodeId && isFavorite(node.metadata.nodeId)

    // Show pin icon if either node is pinned or extension is favorited
    const showPinIcon = isPinned || isExtensionPinned

    return (
      <div key={node.path} className="min-w-0">
        <FileTreeContextMenu
          node={node}
          onRename={
            isVirtualNode ? startRename.bind(null, node.path) : undefined
          }
          onDelete={isVirtualNode ? handleDelete : undefined}
          onPin={isVirtualNode && !isPinned ? handlePin : undefined}
          onUnpin={isVirtualNode && isPinned ? handleUnpin : undefined}
          onAddToChat={
            isVirtualNode && node.metadata?.nodeType !== "extension"
              ? handleAddToChat
              : undefined
          }
          onCreateDoc={
            hasChildren && node.metadata?.nodeType === "folder"
              ? handleCreateDoc
              : undefined
          }
          onCreateTable={
            hasChildren && node.metadata?.nodeType === "folder"
              ? handleCreateTable
              : undefined
          }
          onCreateFolder={
            hasChildren && node.metadata?.nodeType === "folder"
              ? handleCreateFolder
              : undefined
          }
          onCopySlug={
            node.metadata?.nodeType === "extension" ? handleCopySlug : undefined
          }
        >
          <div
            className={`flex items-center rounded transition-colors cursor-pointer select-none ${
              isSelected ? "bg-accent" : "hover:bg-accent"
            } ${isDragging ? "opacity-50" : ""} ${
              isDragOver && canDrop ? "ring-2 ring-primary bg-accent" : ""
            }`}
            draggable={!isRenaming}
            onDragStart={(e) => handleDragStart(e, node)}
            onDragEnd={handleDragEnd}
            onDragOver={canDrop ? (e) => handleDragOver(e, node) : undefined}
            onDragEnter={canDrop ? (e) => handleDragEnter(e, node) : undefined}
            onDragLeave={canDrop ? (e) => handleDragLeave(e, node) : undefined}
            onDrop={canDrop ? (e) => handleDrop(e, node) : undefined}
            onClick={() => {
              if (hasChildren) {
                toggleNode(node)
              } else {
                handleFileClick(node)
              }
            }}
          >
            <div style={{ width: level * 18 }} className="flex-shrink-0" />
            <div className="w-4 flex-shrink-0 flex items-center justify-center">
              {hasChildren ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleNode(node)
                  }}
                  className="p-0 hover:bg-accent rounded transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-border border-t-primary" />
                  ) : isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              ) : (
                getNodeIcon(node)
              )}
            </div>
            <div className="flex items-center gap-1 px-2 py-1 min-w-0 flex-1">
              <InlineEdit
                value={node.name}
                isEditing={isRenaming}
                nodeType={node.metadata?.nodeType}
                onConfirm={(newName) => handleRenameConfirm(node, newName)}
                onCancel={cancelRename}
              />
              {!isRenaming && showPinIcon && (
                <Pin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          </div>
        </FileTreeContextMenu>
        {hasChildren && isExpanded && node.children && (
          <div className="ml-0">
            {node.children.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  // Load root directory only in rootDir mode
  useEffect(() => {
    if (!isNodesMode && sqlite && rootDir) {
      loadRootDirectory()
    }
  }, [sqlite, rootDir, isNodesMode])

  // Initialize with nodes if provided
  useEffect(() => {
    if (isNodesMode && nodes) {
      setTreeData(nodes)
    }
  }, [isNodesMode, nodes])

  // Watch for file system changes (only in rootDir mode)
  useEffect(() => {
    if (isNodesMode || !sqlite || !rootDir) return

    const abortController = new AbortController()
    const { signal } = abortController

    // Start watching the root directory
    const watchDirectory = async () => {
      try {
        for await (const event of sqlite.fs.watch(rootDir, {
          recursive: true,
          signal,
        })) {
          // Print watch events for debugging
          console.log("[FileTree Watch]", {
            path: rootDir,
            eventType: event.eventType,
            filename: event.filename,
            timestamp: new Date().toISOString(),
          })

          // Reload the directory when changes occur
          await loadRootDirectory()
        }
      } catch (error) {
        // Ignore abort errors (expected when component unmounts)
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("FileTree watch error:", error)
        }
      }
    }

    watchDirectory()

    // Cleanup: abort watch when component unmounts or dependencies change
    return () => {
      abortController.abort()
    }
  }, [sqlite, rootDir, isNodesMode])

  // Don't render ScrollArea wrapper in nodes mode (parent should handle scrolling)
  const content = (
    <div className="space-y-1 px-4 bg-sidebar">
      {treeData.map((node) => renderTreeNode(node, 0))}
    </div>
  )

  if (isNodesMode) {
    return content
  }

  return <ScrollArea className="h-full">{content}</ScrollArea>
}

export default FileTree
