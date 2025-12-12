import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
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
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [pendingMove, setPendingMove] = useState<{
    sources: FileTreeNode[]
    target: FileTreeNode
    newPaths: string[]
    resolve: (allow: boolean) => void
  } | null>(null)

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
    handleOpenInNewTab,
    handleCreateDoc,
    handleCreateTable,
    handleCreateFolder,
    handleCopySlug,
    handleCopyExtension,
    handleShareExtension,
    handleCopyExtensionCode,
    handleOpenExtensionStandalone,
    handleOpenExtensionDefaultBrowser,
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

  const handleFileClick = (
    node: FileTreeNode,
    event?: React.MouseEvent | React.KeyboardEvent
  ) => {
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

    const isMouseEvent = event?.nativeEvent instanceof MouseEvent
    const mouseButton =
      isMouseEvent && event ? (event as React.MouseEvent).button : undefined
    const shouldOpenInNewTab = Boolean(
      isMouseEvent
        ? event.metaKey || event.ctrlKey || mouseButton === 1
        : event?.metaKey || event?.ctrlKey
    )
    const target = shouldOpenInNewTab ? "_blank" : undefined

    // Delegate to navigate with options (tab logic handled internally)
    navigate(targetPath, {
      target,
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
      // Check if this is a virtual node (has nodeType in metadata)
      const isVirtualNode = node.metadata?.nodeType !== undefined

      if (isVirtualNode && node.metadata?.nodeId) {
        // For virtual nodes, update the node name directly via database API
        // This prevents path-based rename logic from interpreting "/" as parent changes
        await sqlite.tree.updateNodeName(node.metadata.nodeId, newName)
      } else {
        // For regular files/directories, use filesystem rename
        // Construct new path
        // For virtual paths, we just need to change the last segment (the name)
        const pathParts = node.path.split("/")
        pathParts[pathParts.length - 1] = newName
        const newPath = pathParts.join("/")

        // Call rename API
        await sqlite.fs.rename(node.path, newPath)
      }

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

  const confirmMove = useCallback(
    async (payload: {
      sources: FileTreeNode[]
      target: FileTreeNode
      newPaths: string[]
    }) =>
      new Promise<boolean>((resolve) => {
        setPendingMove({
          ...payload,
          resolve,
        })
        setIsMoveDialogOpen(true)
      }),
    []
  )

  const handleMoveConfirm = () => {
    if (pendingMove) {
      pendingMove.resolve(true)
    }
    setPendingMove(null)
    setIsMoveDialogOpen(false)
  }

  const handleMoveCancel = () => {
    if (pendingMove) {
      pendingMove.resolve(false)
    }
    setPendingMove(null)
    setIsMoveDialogOpen(false)
  }

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

  const getNodeByPath = useCallback(
    (path: string) => pathToNodeMap.get(path),
    [pathToNodeMap]
  )

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
    confirmMove,
    selectedNodes,
    getNodeByPath,
  })

  const updateSelectionState = useCallback(
    (paths: Set<string>, anchorOverride?: string | null) => {
      const anchor =
        anchorOverride !== undefined
          ? anchorOverride
          : paths.size
            ? Array.from(paths).slice(-1)[0]
            : null
      setSelectedNodes(paths)
      setSelectedNode(anchor || null)
      setSelectionAnchor(anchor || null)
    },
    []
  )

  const focusNodeElement = useCallback((path: string) => {
    const element = nodeRefs.current.get(path)
    if (element) {
      element.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (!selectedNode) return
    if (renamingNode && renamingNode === selectedNode) return
    focusNodeElement(selectedNode)
  }, [selectedNode, renamingNode, focusNodeElement])

  const focusAndSelect = useCallback(
    (path: string) => {
      if (!path) return
      updateSelectionState(new Set([path]), path)
      requestAnimationFrame(() => focusNodeElement(path))
    },
    [updateSelectionState, focusNodeElement]
  )

  const moveFocusByOffset = useCallback(
    (currentPath: string, offset: number) => {
      const currentIndex = flattenedPaths.indexOf(currentPath)
      if (currentIndex === -1) return

      const nextIndex = currentIndex + offset
      if (nextIndex < 0 || nextIndex >= flattenedPaths.length) return

      const targetPath = flattenedPaths[nextIndex]
      focusAndSelect(targetPath)
    },
    [flattenedPaths, focusAndSelect]
  )

  const getNodeLevel = useCallback(
    (index: number) => ((flattenedData[index] as any)?.level ?? 0),
    [flattenedData]
  )

  const findParentPath = useCallback(
    (path: string) => {
      const currentIndex = flattenedPaths.indexOf(path)
      if (currentIndex === -1) return null

      const currentLevel = getNodeLevel(currentIndex)

      for (let i = currentIndex - 1; i >= 0; i--) {
        if (getNodeLevel(i) < currentLevel) {
          return flattenedData[i].path
        }
      }

      return null
    },
    [flattenedData, flattenedPaths, getNodeLevel]
  )

  const findFirstChildPath = useCallback(
    (path: string) => {
      const currentIndex = flattenedPaths.indexOf(path)
      if (currentIndex === -1) return null

      const nextNode = flattenedData[currentIndex + 1]
      if (!nextNode) return null

      const currentLevel = getNodeLevel(currentIndex)
      const nextLevel = getNodeLevel(currentIndex + 1)

      if (nextLevel === currentLevel + 1) {
        return nextNode.path
      }

      return null
    },
    [flattenedData, flattenedPaths, getNodeLevel]
  )

  useEffect(() => {
    const handleExpandToSelect = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>
      const targetPath = customEvent.detail?.path
      if (!targetPath) return
      updateSelectionState(new Set([targetPath]), targetPath)
    }

    window.addEventListener("file-tree-expand-to" as any, handleExpandToSelect)
    return () => {
      window.removeEventListener(
        "file-tree-expand-to" as any,
        handleExpandToSelect
      )
    }
  }, [updateSelectionState])

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
    event?: React.MouseEvent | React.KeyboardEvent,
    options?: { viaContextMenu?: boolean; forceSingleSelection?: boolean }
  ) => {
    const viaContextMenu = options?.viaContextMenu ?? false
    const forceSingleSelection = options?.forceSingleSelection ?? false
    const path = node.path
    const isShift = Boolean(event?.shiftKey)
    const isMeta = Boolean(event?.metaKey || event?.ctrlKey)
    const anchorPath = selectionAnchor || selectedNode || path

    if (forceSingleSelection) {
      updateSelectionState(new Set([path]), path)
      return
    }

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
    event: React.MouseEvent | React.KeyboardEvent
  ) => {
    // If currently renaming, cancel the rename first
    if (renamingNode) {
      cancelRename()
      return
    }

    let openInNewTab = false
    if (event.nativeEvent instanceof MouseEvent) {
      const mouseEvent = event as React.MouseEvent
      openInNewTab =
        mouseEvent.metaKey ||
        mouseEvent.ctrlKey ||
        mouseEvent.button === 1 /* middle click */
    }

    const hasSelectionModifier = event.shiftKey

    applySelection(node, event, { forceSingleSelection: openInNewTab })

    if (hasChildren) {
      if (!hasSelectionModifier && !openInNewTab) {
        toggleNode(node)
      }
    } else if (!hasSelectionModifier) {
      handleFileClick(node, event)
    }
  }

  const handleContextMenuSelection = (
    node: FileTreeNode,
    event: React.MouseEvent
  ) => {
    // Ignore ctrl/meta + left click opening the native menu; still toggle selection
    if ((event.ctrlKey || event.metaKey) && event.button === 0) {
      event.preventDefault()
      event.stopPropagation()
      applySelection(node, event)
      return
    }
    applySelection(node, event, { viaContextMenu: true })
  }

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    node: FileTreeNode,
    hasChildren: boolean,
    isExpanded: boolean
  ) => {
    if (renamingNode === node.path) return

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        moveFocusByOffset(node.path, 1)
        return
      case "ArrowUp":
        event.preventDefault()
        moveFocusByOffset(node.path, -1)
        return
      case "ArrowRight":
        if (hasChildren) {
          event.preventDefault()
          if (!isExpanded) {
            toggleNode(node)
          } else {
            const firstChildPath = findFirstChildPath(node.path)
            if (firstChildPath) {
              focusAndSelect(firstChildPath)
            }
          }
        }
        return
      case "ArrowLeft": {
        event.preventDefault()
        if (hasChildren && isExpanded) {
          toggleNode(node)
        } else {
          const parentPath = findParentPath(node.path)
          if (parentPath) {
            focusAndSelect(parentPath)
          }
        }
        return
      }
      case "Home":
        event.preventDefault()
        if (flattenedPaths.length) {
          focusAndSelect(flattenedPaths[0])
        }
        return
      case "End":
        event.preventDefault()
        if (flattenedPaths.length) {
          focusAndSelect(flattenedPaths[flattenedPaths.length - 1])
        }
        return
      case "Enter":
      case " ":
        event.preventDefault()
        handleRowClick(node, hasChildren, event)
        return
      default:
        return
    }
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

    // Execute deletions sequentially; confirmation handled by context menus
    ;(async () => {
      for (const n of nodesToDelete) {
        // eslint-disable-next-line no-await-in-loop
        await handleDelete(n)
      }
      updateSelectionState(new Set(), null)
    })()
  }

  const renderTreeNode = (node: FileTreeNode, index: number) => {
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
    const isMultiSelection = selectedNodes.size > 1
    const selectionPaths =
      selectedNodes.size > 0 ? selectedNodes : new Set([node.path])
    const selectionNodes: FileTreeNode[] = []
    selectionPaths.forEach((path) => {
      const targetNode = pathToNodeMap.get(path)
      if (targetNode) {
        selectionNodes.push(targetNode)
      }
    })
    const selectionCount = selectionNodes.length
    const selectionHasDataview = selectionNodes.some(
      (n) => n.metadata?.nodeType === "dataview"
    )

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

    const isActive = selectedNode
      ? selectedNode === node.path
      : index === 0

    const setNodeRef = (el: HTMLDivElement | null) => {
      if (el) {
        nodeRefs.current.set(node.path, el)
      } else {
        nodeRefs.current.delete(node.path)
      }
    }

    return (
      <div
        key={node.path}
        data-path={node.path}
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
          isActive={isActive}
          ariaLevel={level + 1}
          ariaSelected={isSelected}
          ariaExpanded={hasChildren ? isExpanded : undefined}
          isVirtualNode={isVirtualNode}
          isPinned={isPinned}
          nodeRef={setNodeRef}
          onToggle={() => toggleNode(node)}
          onRowClick={(event) => handleRowClick(node, hasChildren, event)}
          onRowKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) =>
            handleRowKeyDown(event, node, hasChildren, isExpanded)
          }
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
          onOpenInNewTab={handleOpenInNewTab}
          onCreateDoc={handleCreateDoc}
          onCreateTable={handleCreateTable}
          onCreateFolder={handleCreateFolder}
          onCopySlug={handleCopySlug}
          onCopyExtension={handleCopyExtension}
          onShareExtension={handleShareExtension}
          onCopyExtensionCode={handleCopyExtensionCode}
          onOpenExtensionStandalone={handleOpenExtensionStandalone}
          onOpenExtensionDefaultBrowser={handleOpenExtensionDefaultBrowser}
          onDragStart={(e) => handleDragStart(e, node)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragEnter={
            hasChildren ? (e) => handleDragEnter(e, node) : undefined
          }
          onDragLeave={handleDragLeave}
          onDrop={hasChildren ? (e) => handleDrop(e, node) : undefined}
          isMultiSelection={isMultiSelection}
          selectionCount={selectionCount}
          selectionHasDataview={selectionHasDataview}
        />
      </div>
    )
  }

  return (
    <>
      <div
        ref={treeContainerRef}
        role="tree"
        aria-multiselectable="true"
        className={cn(
          "space-y-1 px-4 bg-sidebar",
          !isNodesMode && "h-full overflow-y-auto"
        )}
      >
        {flattenedData.map((node, index) => renderTreeNode(node, index))}
      </div>

      <AlertDialog
        open={isMoveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleMoveCancel()
          } else {
            setIsMoveDialogOpen(true)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move item?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove
                ? pendingMove.sources.length === 1
                  ? `Move “${
                      pendingMove.sources[0].name?.trim() ||
                      getPlaceholderText(pendingMove.sources[0])
                    }” to “${
                      pendingMove.target.name?.trim() ||
                      getPlaceholderText(pendingMove.target)
                    }”?`
                  : `Move ${pendingMove.sources.length} items to “${
                      pendingMove.target.name?.trim() ||
                      getPlaceholderText(pendingMove.target)
                    }”?`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleMoveCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleMoveConfirm}>
              Move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default FileTree
