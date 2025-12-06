import React, { useMemo, useRef, useState } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"

import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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
  const { navigate } = useRouterAdapter()
  const { isFavorite } = useFavBlocks()

  // Determine which mode we're in
  const isNodesMode = nodes !== undefined
  const effectiveRootDir = rootDir || baseDir || "~/"

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [renamingNode, setRenamingNode] = useState<string | null>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [pendingDeleteNodes, setPendingDeleteNodes] = useState<FileTreeNode[]>(
    []
  )

  const scrollToNode = (nodePath: string, retryCount = 0) => {
    const nodeElement = nodeRefs.current.get(nodePath)

    if (nodeElement) {
      nodeElement.scrollIntoView({
        behavior: "auto",
        block: "center",
      })
      // Add a small highlight effect
      nodeElement.classList.add("bg-accent/50")
      setTimeout(() => {
        nodeElement.classList.remove("bg-accent/50")
      }, 2000)
    } else if (retryCount < 20) {
      // Retry after a short delay to allow for rendering
      setTimeout(() => scrollToNode(nodePath, retryCount + 1), 100)
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

  const handleFileClick = (node: FileTreeNode, event?: React.MouseEvent) => {
    // Determine navigation path
    let targetPath = ""
    if (node.metadata?.nodeType && node.metadata?.nodeType !== "extension") {
      // Navigate to node (table, doc, folder, dataview)
      targetPath = `/${node.metadata.nodeId}`
    } else if (node.metadata?.nodeType === "extension") {
      // Navigate to extension
      targetPath = `/extensions/${node.metadata.nodeId}`
    } else if (node.kind === "file") {
      // Regular file - use file handler
      targetPath = `/file-handler#${node.path}`
    }

    if (!targetPath) return

    // Use Alt/Option to open in new tab (Cmd/Ctrl is reserved for multi-select)
    const openInNewTab = Boolean(event?.altKey)

    // Delegate to navigate with options (tab logic handled internally)
    navigate(targetPath, {
      openInNewTab,
    })
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
    onClearSelection: () => {
      setSelectedNode(null)
      setSelectedNodes(new Set())
      setSelectionAnchor(null)
    },
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

  const flattenedPaths = useMemo(
    () => flattenedData.map((node) => node.path),
    [flattenedData]
  )

  const pathToNodeMap = useMemo(() => {
    const map = new Map<string, FileTreeNode>()
    flattenedData.forEach((node) => {
      map.set(node.path, node)
    })
    return map
  }, [flattenedData])

  const updateSelectionState = (
    paths: Set<string>,
    anchorOverride?: string | null
  ) => {
    const anchor =
      anchorOverride !== undefined
        ? anchorOverride
        : paths.size
          ? Array.from(paths).slice(-1)[0]
          : null
    setSelectedNodes(paths)
    setSelectedNode(anchor || null)
    setSelectionAnchor(anchor || null)
  }

  const selectRange = (anchorPath: string, targetPath: string) => {
    const anchorIndex = flattenedPaths.indexOf(anchorPath)
    const targetIndex = flattenedPaths.indexOf(targetPath)

    if (anchorIndex === -1 || targetIndex === -1) {
      return new Set([targetPath])
    }

    const start = Math.min(anchorIndex, targetIndex)
    const end = Math.max(anchorIndex, targetIndex)
    const rangePaths = flattenedPaths.slice(start, end + 1)
    return new Set(rangePaths)
  }

  const applySelection = (
    node: FileTreeNode,
    event?: React.MouseEvent,
    options?: { viaContextMenu?: boolean }
  ) => {
    const viaContextMenu = options?.viaContextMenu ?? false
    const path = node.path
    const isShift = Boolean(event?.shiftKey)
    const isMeta = Boolean(event?.metaKey || event?.ctrlKey)
    const anchorPath = selectionAnchor || selectedNode || path

    // Preserve existing multi-selection on context menu when already selected
    if (viaContextMenu && selectedNodes.has(path)) {
      updateSelectionState(new Set(selectedNodes), selectionAnchor)
      return
    }

    if (isShift) {
      const rangeSelection = selectRange(anchorPath, path)
      updateSelectionState(rangeSelection, anchorPath)
      return
    }

    if (isMeta) {
      const next = new Set(selectedNodes)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }

      if (next.size === 0) {
        updateSelectionState(new Set(), null)
      } else {
        updateSelectionState(next, anchorPath)
      }
      return
    }

    // Default: single selection
    updateSelectionState(new Set([path]), path)
  }

  const handleRowClick = (
    node: FileTreeNode,
    hasChildren: boolean,
    event: React.MouseEvent
  ) => {
    // If currently renaming, cancel the rename first
    if (renamingNode) {
      cancelRename()
      return
    }

    applySelection(node, event)

    const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey

    if (hasChildren) {
      if (!hasModifier) {
        toggleNode(node)
      }
    } else if (!hasModifier) {
      handleFileClick(node, event)
    }
  }

  const handleContextMenuSelection = (
    node: FileTreeNode,
    event: React.MouseEvent
  ) => {
    // Prevent React warnings for unused event in future handlers
    if (event) {
      // no-op
    }
    applySelection(node, event, { viaContextMenu: true })
  }

  const handleDeleteRequest = (node: FileTreeNode) => {
    const selectionPaths =
      selectedNodes.size > 0 ? selectedNodes : new Set([node.path])

    const nodesToDelete: FileTreeNode[] = []
    selectionPaths.forEach((path) => {
      const targetNode = pathToNodeMap.get(path)
      if (targetNode) {
        nodesToDelete.push(targetNode)
      }
    })

    if (nodesToDelete.length === 0) return

    updateSelectionState(new Set(nodesToDelete.map((n) => n.path)))
    setPendingDeleteNodes(nodesToDelete)
    setIsDeleteDialogOpen(true)
  }

  const confirmDeleteNodes = async () => {
    for (const node of pendingDeleteNodes) {
      // eslint-disable-next-line no-await-in-loop
      await handleDelete(node)
    }

    setPendingDeleteNodes([])
    setIsDeleteDialogOpen(false)
    updateSelectionState(new Set(), null)
  }

  const renderTreeNode = (node: FileTreeNode) => {
    // Cast to any to access level property added by flattenTree
    const level = (node as any).level || 0

    const isExpanded = expandedNodes.has(node.path)
    const isLoading = loadingNodes.has(node.path)
    const hasChildren = node.kind === "directory"
    const isPinned = Boolean(node.metadata?.isPinned)
    const isSelected = selectedNodes.has(node.path)
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
        data-path={node.path}
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
          onRowClick={(event) => handleRowClick(node, hasChildren, event)}
          onRowContextMenu={(event) =>
            handleContextMenuSelection(node, event)
          }
          onRename={(node) => startRename(node.path)}
          onRenameConfirm={(newName) => handleRenameConfirm(node, newName)}
          onRenameCancel={cancelRename}
          onDelete={(n) => handleDeleteRequest(n)}
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

  return (
    <>
      <div
        ref={treeContainerRef}
        className={cn(
          "space-y-1 px-4 bg-sidebar",
          !isNodesMode && "h-full overflow-y-auto"
        )}
      >
        {flattenedData.map((node) => renderTreeNode(node))}
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected items?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const count = pendingDeleteNodes.length
                const hasDataview = pendingDeleteNodes.some(
                  (n) => n.metadata?.nodeType === "dataview"
                )
                const base = `This will delete ${count} item${
                  count === 1 ? "" : "s"
                }.`

                if (hasDataview) {
                  return `${base} Regular items can be restored from Trash, but dataview items will be permanently removed.`
                }
                return `${base} You can restore them from Trash.`
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingDeleteNodes([])
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteNodes}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default FileTree
