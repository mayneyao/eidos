"use client"

import React, { useRef, useState } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import { useNavigate } from "react-router-dom"

import { useSqlite } from "@/hooks/use-sqlite"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"

import { FileTreeNode } from "./file-tree-node"
import { useFileTreeData } from "./use-file-tree-data"
import { useFileTreeDragDrop } from "./use-file-tree-drag-drop"
import { useFileTreeKeyboard } from "./use-file-tree-keyboard"
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
  const { isFavorite } = useFavBlocks()

  // Determine which mode we're in
  const isNodesMode = nodes !== undefined
  const effectiveRootDir = rootDir || baseDir || "~/"

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [renamingNode, setRenamingNode] = useState<string | null>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const treeContainerRef = useRef<HTMLDivElement>(null)

  const scrollToNode = (nodePath: string) => {
    const nodeElement = nodeRefs.current.get(nodePath)
    if (nodeElement) {
      nodeElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }
  }

  // Use file tree data hook for data loading and file system watching
  const {
    treeData,
    flattenedData,
    setTreeData,
    loadingNodes,
    loadRootDirectory,
    loadSubDirectory,
  } = useFileTreeData({
    rootDir,
    initialNodes: nodes,
    isNodesMode,
    expandedNodes,
    setExpandedNodes,
    onScrollToNode: scrollToNode,
  })

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
    handleCopyExtension,
  } = useFileTreeOperations(effectiveRootDir)

  const toggleNode = async (node: FileTreeNode) => {
    // If currently renaming, cancel the rename first
    if (renamingNode) {
      cancelRename()
      // Don't change selection when clicking during rename
      return
    }

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
    // If currently renaming, cancel the rename first
    if (renamingNode) {
      cancelRename()
      // Don't change selection when clicking during rename
      return
    }

    // Set selected node
    setSelectedNode(node.path)

    // Route based on metadata type
    if (node.metadata?.nodeType && node.metadata?.nodeType !== "extension") {
      // Navigate to node (table, doc, folder, dataview)
      navigate(`/${node.metadata.nodeId}`)
    } else if (node.metadata?.nodeType === "extension") {
      // Navigate to extension
      navigate(`/extensions/${node.metadata.nodeId}`)
    } else if (node.kind === "file") {
      // Regular file - use file handler
      navigate(`/file-handler#${node.path}`)
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

  const startRename = (nodePath: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    // Use setTimeout to ensure context menu is fully closed before entering rename mode
    // This prevents the context menu close event from interfering with rename state
    setTimeout(() => {
      setRenamingNode(nodePath)
    }, 0)
  }

  const cancelRename = () => {
    setRenamingNode(null)
    // Rename state and selection state are independent
    // Don't clear selection when rename is cancelled
  }

  const handleRenameConfirm = async (node: FileTreeNode, newName: string) => {
    if (!sqlite) {
      cancelRename()
      return
    }

    // If newName is same as current name, just cancel rename (no need to save)
    if (newName === node.name) {
      cancelRename()
      return
    }

    // If newName is empty, allow it (will show placeholder)
    // If newName matches placeholder and current name is not empty, cancel (user likely didn't mean to set to placeholder)
    const placeholderText = getPlaceholderText(node)
    if (
      newName === placeholderText &&
      node.name &&
      node.name.trim().length > 0
    ) {
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

  // Use keyboard and mouse events hook
  useFileTreeKeyboard({
    selectedNode,
    renamingNode,
    treeContainerRef,
    onRename: startRename,
    onClearSelection: () => setSelectedNode(null),
  })

  // Get placeholder text based on node type
  const getPlaceholderText = (node: FileTreeNode): string => {
    return "Untitled"
  }

  // Use drag and drop hook
  const {
    draggingNode,
    dragOverNode,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  } = useFileTreeDragDrop({
    isNodesMode,
    loadRootDirectory,
    loadSubDirectory,
    expandedNodes,
    setExpandedNodes,
    getPlaceholderText,
  })

  const renderTreeNode = (node: FileTreeNode) => {
    // Cast to any to access level property added by flattenTree
    const level = (node as any).level || 0

    const isExpanded = expandedNodes.has(node.path)
    const isLoading = loadingNodes.has(node.path)
    const hasChildren = node.kind === "directory"
    const isPinned = Boolean(node.metadata?.isPinned)
    const isSelected = selectedNode === node.path
    const isRenaming = renamingNode === node.path
    const isDragging = draggingNode === node.path
    const isDragOver = dragOverNode === node.path
    const isVirtualNode = node.metadata?.nodeType !== undefined

    // Check if extension is pinned (for extensions)
    const isExtension = node.metadata?.nodeType === "extension"
    const isExtensionPinned =
      isExtension && node.metadata?.nodeId && isFavorite(node.metadata.nodeId)

    // Show pin icon if either node is pinned or extension is favorited
    const showPinIcon = Boolean(isPinned || isExtensionPinned)

    // Check if name is empty and prepare display value and style
    const hasName = node.name && node.name.trim().length > 0
    // In edit mode, use actual name (even if empty); otherwise use placeholder if empty
    const displayName = isRenaming
      ? node.name || ""
      : hasName
        ? node.name
        : getPlaceholderText(node)
    const nameClassName = hasName
      ? "truncate text-foreground"
      : "truncate text-muted-foreground italic"

    return (
      <div
        key={node.path}
        ref={(el) => {
          if (el) {
            nodeRefs.current.set(node.path, el)
          } else {
            nodeRefs.current.delete(node.path)
          }
        }}
      >
        <FileTreeNode
          node={node}
          level={level}
          isExpanded={isExpanded}
          isLoading={isLoading}
          isSelected={isSelected}
          isRenaming={isRenaming}
          isDragging={isDragging}
          isDragOver={isDragOver}
          showPinIcon={showPinIcon}
          displayName={displayName}
          nameClassName={nameClassName}
          hasChildren={hasChildren}
          isVirtualNode={isVirtualNode}
          isPinned={isPinned}
          onToggle={() => toggleNode(node)}
          onFileClick={() => handleFileClick(node)}
          onRename={(node) => startRename(node.path)}
          onRenameConfirm={(newName) => handleRenameConfirm(node, newName)}
          onRenameCancel={cancelRename}
          onDelete={handleDelete}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onAddToChat={handleAddToChat}
          onCreateDoc={handleCreateDoc}
          onCreateTable={handleCreateTable}
          onCreateFolder={handleCreateFolder}
          onCopySlug={handleCopySlug}
          onCopyExtension={handleCopyExtension}
          onDragStart={(e) => handleDragStart(e, node)}
          onDragEnd={handleDragEnd}
          onDragOver={hasChildren ? (e) => handleDragOver(e, node) : undefined}
          onDragEnter={
            hasChildren ? (e) => handleDragEnter(e, node) : undefined
          }
          onDragLeave={hasChildren ? handleDragLeave : undefined}
          onDrop={hasChildren ? (e) => handleDrop(e, node) : undefined}
        />
      </div>
    )
  }

  // Don't render ScrollArea wrapper in nodes mode (parent should handle scrolling)
  const content = (
    <div ref={treeContainerRef} className="space-y-1 px-4 bg-sidebar">
      {flattenedData.map((node) => renderTreeNode(node))}
    </div>
  )

  if (isNodesMode) {
    return content
  }

  return <div className="h-full overflow-y-auto">{content}</div>
}

export default FileTree
