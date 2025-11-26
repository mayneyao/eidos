import { useCallback, useEffect, useRef, useState } from "react"
import type { IWatchEvent } from "@eidos.space/core/types/IExternalFileSystem"

import { useSqlite } from "@/hooks/use-sqlite"

import type { FileTreeNode } from "./index"

interface UseFileTreeDataOptions {
  rootDir?: string
  initialNodes?: FileTreeNode[]
  isNodesMode: boolean
  expandedNodes: Set<string>
  setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>
  onScrollToNode?: (path: string) => void
}

/**
 * Hook for managing file tree data loading and file system watching
 */
export const useFileTreeData = ({
  rootDir,
  initialNodes,
  isNodesMode,
  expandedNodes,
  setExpandedNodes,
  onScrollToNode,
}: UseFileTreeDataOptions) => {
  const { sqlite } = useSqlite()

  const [treeData, setTreeData] = useState<FileTreeNode[]>(initialNodes || [])
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())

  // Add a ref to track pending reloads to avoid duplicates
  const pendingReloadsRef = useRef<Set<string>>(new Set())
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Track timeouts per mount directory for nodes mode
  const mountTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Helper function to sort entries (directories first, then by name)
  const sortEntries = (entries: FileTreeNode[]) => {
    return entries.sort((a, b) => {
      if (a.kind === "directory" && b.kind !== "directory") return -1
      if (a.kind !== "directory" && b.kind === "directory") return 1
      return a.name.localeCompare(b.name)
    })
  }

  const loadSubDirectory = useCallback(
    async (path: string) => {
      console.log(`loadSubDirectory called with path: ${path}`)
      if (!sqlite) {
        console.log("No sqlite instance")
        return
      }

      setLoadingNodes((prev) => {
        if (prev.has(path)) {
          console.log(`Already loading: ${path}`)
          return prev // Already loading, return same reference
        }
        return new Set(prev).add(path)
      })

      try {
        console.log(`Reading directory: ${path}`)
        const entries = await sqlite.fs.readdir(path, {
          withFileTypes: true,
        })
        console.log(`Directory entries for ${path}:`, entries)

        const sortedEntries = sortEntries(entries)

        const updateTreeData = (
          nodes: FileTreeNode[],
          targetPath: string,
          newChildren: FileTreeNode[]
        ): FileTreeNode[] => {
          console.log(`updateTreeData called with targetPath: ${targetPath}, newChildren count: ${newChildren.length}`)
          console.log("Current nodes:", nodes.map(n => ({ name: n.name, path: n.path })))

          return nodes.map((node) => {
            if (node.path === targetPath) {
              console.log(`Found matching node: ${node.path}`)
              // Create a map of existing children for quick lookup
              const existingChildrenMap = new Map()
              if (node.children) {
                node.children.forEach((child) => {
                  existingChildrenMap.set(child.name, child)
                })
              }

              // Merge new children with existing ones to preserve grandchildren
              const mergedChildren = newChildren.map((newChild) => {
                const existingChild = existingChildrenMap.get(newChild.name)
                // If child existed before and was a directory with children, preserve them
                if (
                  existingChild &&
                  existingChild.kind === "directory" &&
                  existingChild.children
                ) {
                  return {
                    ...newChild,
                    children: existingChild.children,
                  }
                }
                return newChild
              })
              console.log(`Updated node ${targetPath} with ${mergedChildren.length} children`)
              return { ...node, children: mergedChildren }
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
    },
    [sqlite]
  )

  // Keep a ref to expandedNodes to access it in loadRootDirectory without adding it to dependencies
  const expandedNodesRef = useRef(expandedNodes)
  useEffect(() => {
    expandedNodesRef.current = expandedNodes
  }, [expandedNodes])

  const loadRootDirectory = useCallback(async () => {
    if (!sqlite || !rootDir) return

    try {
      const entries = await sqlite.fs.readdir(rootDir, {
        withFileTypes: true,
      })

      const sortedEntries = sortEntries(entries)

      // Preserve existing children for directories that are still present
      setTreeData((prevTreeData) => {
        const existingNodesMap = new Map(
          prevTreeData.map((node) => [node.name, node])
        )

        return sortedEntries.map((newNode) => {
          const existingNode = existingNodesMap.get(newNode.name)
          // If node existed before and was a directory with children, preserve them
          if (
            existingNode &&
            existingNode.kind === "directory" &&
            existingNode.children
          ) {
            return {
              ...newNode,
              children: existingNode.children,
            }
          }
          return newNode
        })
      })

      // Reload children for all expanded directories to keep them in sync
      const reloadPromises = Array.from(expandedNodesRef.current).map(async (path) => {
        if (path !== rootDir) {
          await loadSubDirectory(path)
        }
      })

      await Promise.all(reloadPromises)
    } catch (error) {
      console.error("Failed to load root directory:", error)
    }
  }, [sqlite, rootDir, loadSubDirectory])

  // Load root directory only in rootDir mode
  useEffect(() => {
    if (!isNodesMode && sqlite && rootDir) {
      loadRootDirectory()
    }
  }, [isNodesMode, sqlite, rootDir, loadRootDirectory])

  // Initialize with nodes if provided
  useEffect(() => {
    if (isNodesMode && initialNodes) {
      setTreeData(initialNodes)
    }
  }, [isNodesMode, initialNodes])

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
          // Smart reload: determine which directory needs to be reloaded
          await handleWatchEvent(event)
        }
      } catch (error) {
        // Ignore abort errors (expected when component unmounts)
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("FileTree watch error:", error)
        }
      }
    }

    // Handle watch events intelligently with debouncing
    const handleWatchEvent = (event: IWatchEvent) => {
      // Clear any existing timeout
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current)
      }

      // Set a new timeout to debounce reloads
      // Increased delay for Windows compatibility (may fire events faster)
      reloadTimeoutRef.current = setTimeout(async () => {
        await processWatchEvent(event)
      }, 150) // 150ms debounce
    }

    // Process the actual watch event
    const processWatchEvent = async (event: IWatchEvent) => {
      try {
        // For virtual file system, event.filename contains ID path like "id1/id2/id3"
        const pathParts = event.filename.split("/").filter(Boolean)

        if (pathParts.length === 0) {
          await loadRootDirectory()
          return
        }

        // Find the deepest directory in the path that is currently expanded
        // We start from the parent of the changed file and walk up
        let targetPathToReload = rootDir

        // Construct full paths for all segments
        // If path is "a/b/c", we check "root/a/b", then "root/a", then "root"
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const subPath = pathParts.slice(0, i + 1).join("/")
          const fullPath = `${rootDir}/${subPath}`

          // If this directory is expanded, we should reload it
          // This ensures we reload the closest visible parent to the change
          if (expandedNodes.has(fullPath)) {
            targetPathToReload = fullPath
            break
          }
        }

        // Check if this reload is already pending
        if (pendingReloadsRef.current.has(targetPathToReload)) {
          return
        }

        // Mark this reload as pending
        pendingReloadsRef.current.add(targetPathToReload)

        try {
          if (targetPathToReload === rootDir) {
            await loadRootDirectory()
          } else {
            await loadSubDirectory(targetPathToReload)
          }
        } finally {
          // Remove from pending reloads
          pendingReloadsRef.current.delete(targetPathToReload)
        }
      } catch (error) {
        console.error("[FileTree Watch] Error handling watch event:", error)
        // Fallback to full reload on error
        try {
          await loadRootDirectory()
        } catch (fallbackError) {
          // Silently ignore fallback errors to prevent watch loop from breaking
          console.error("[FileTree Watch] Fallback reload failed:", fallbackError)
        }
      }
    }

    watchDirectory()

    // Cleanup: abort watch when component unmounts or dependencies change
    return () => {
      abortController.abort()
    }
  }, [sqlite, rootDir, isNodesMode, expandedNodes, loadRootDirectory, loadSubDirectory])

  // Watch for file system changes in nodes mode (watch each mount directory)
  useEffect(() => {
    if (!isNodesMode || !sqlite || !initialNodes) return

    const abortControllers = new Map<string, AbortController>()

    // Helper function to process watch event for a specific mount directory
    const processWatchEventForMount = async (
      mountPath: string,
      event: IWatchEvent
    ) => {
      try {
        // For virtual file system, event.filename contains ID path like "id1/id2/id3"
        const pathParts = event.filename.split("/").filter(Boolean)

        if (pathParts.length === 0) {
          // Root level change - reload the mount directory itself
          await loadSubDirectory(mountPath)
          return
        }

        // Find the deepest directory in the path that is currently expanded
        // We start from the parent of the changed file and walk up to the mount path
        let targetPathToReload = mountPath
        const mountPathNormalized = mountPath.endsWith("/")
          ? mountPath.slice(0, -1)
          : mountPath

        // Construct full paths for all segments relative to mount path
        // If path is "a/b/c" relative to mount, we check "mount/a/b", then "mount/a", then "mount"
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const subPath = pathParts.slice(0, i + 1).join("/")
          const fullPath = `${mountPathNormalized}/${subPath}`

          // If this directory is expanded, we should reload it
          if (expandedNodes.has(fullPath)) {
            targetPathToReload = fullPath
            break
          }
        }

        // Check if this reload is already pending
        if (pendingReloadsRef.current.has(targetPathToReload)) {
          return
        }

        // Mark this reload as pending
        pendingReloadsRef.current.add(targetPathToReload)

        try {
          await loadSubDirectory(targetPathToReload)
        } finally {
          // Remove from pending reloads
          pendingReloadsRef.current.delete(targetPathToReload)
        }
      } catch (error) {
        console.error(
          `[FileTree Watch] Error handling watch event for ${mountPath}:`,
          error
        )
        // Fallback to reload mount directory on error
        try {
          await loadSubDirectory(mountPath)
        } catch (fallbackError) {
          // Silently ignore fallback errors to prevent watch loop from breaking
          console.error(
            `[FileTree Watch] Fallback reload failed for ${mountPath}:`,
            fallbackError
          )
        }
      }
    }

    // Handle watch events intelligently with debouncing (per mount)
    const handleWatchEvent = (mountPath: string, event: IWatchEvent) => {
      // Clear any existing timeout for this mount
      const existingTimeout = mountTimeoutsRef.current.get(mountPath)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      // Set a new timeout to debounce reloads for this mount
      // Increased delay for Windows compatibility (may fire events faster)
      const timeout = setTimeout(async () => {
        await processWatchEventForMount(mountPath, event)
        mountTimeoutsRef.current.delete(mountPath)
      }, 150) // 150ms debounce

      mountTimeoutsRef.current.set(mountPath, timeout)
    }

    // Start watching each directory node
    const watchPromises = initialNodes
      .filter((node) => node.kind === "directory")
      .map(async (node) => {
        const mountPath = node.path
        const abortController = new AbortController()
        abortControllers.set(mountPath, abortController)
        const { signal } = abortController

        try {
          for await (const event of sqlite.fs.watch(mountPath, {
            recursive: true,
            signal,
          })) {
            await handleWatchEvent(mountPath, event)
          }
        } catch (error) {
          // Ignore abort errors (expected when component unmounts)
          if (error instanceof Error && error.name !== "AbortError") {
            console.error(
              `FileTree watch error for ${mountPath}:`,
              error
            )
          }
        }
      })

    // Start all watch operations
    Promise.all(watchPromises).catch((error) => {
      console.error("Error starting file tree watches:", error)
    })

    // Cleanup: abort all watches when component unmounts or dependencies change
    return () => {
      abortControllers.forEach((controller) => {
        controller.abort()
      })
      abortControllers.clear()
      // Clear all mount timeouts
      mountTimeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout)
      })
      mountTimeoutsRef.current.clear()
    }
  }, [
    sqlite,
    isNodesMode,
    initialNodes,
    expandedNodes,
    loadSubDirectory,
  ])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current)
      }
    }
  }, [])

  // Flatten the tree data for rendering
  const flattenTree = useCallback(
    (
      nodes: FileTreeNode[],
      expanded: Set<string>,
      level = 0,
      result: FileTreeNode[] = []
    ) => {
      for (const node of nodes) {
        // Clone node to avoid mutating original data and add level info if needed
        // But here we just pass the node and handle level in the renderer or add a transient property
        // For now, we'll rely on the renderer to know the level, BUT
        // since we are flattening, we lose the structural level info unless we attach it.
        // We can't easily attach it to FileTreeNode without changing the type.
        // Let's assume the renderer will receive a wrapper or we extend the type in the hook return.
        // Actually, let's just return the node and the level.
        // Wait, the FileTreeNode interface in index.tsx doesn't have 'level'.
        // We should probably return a new structure or just the node and let the renderer handle it?
        // No, in a flat list, the item MUST know its level.
        // Let's extend the type locally or just add it to the node if it's extensible.
        // IDirectoryEntry might not be extensible.
        // Let's create a FlattenedFileTreeNode type.

        result.push({ ...node, level } as any) // We'll cast to any or a new type for now

        if (
          node.kind === "directory" &&
          expanded.has(node.path) &&
          node.children
        ) {
          flattenTree(node.children, expanded, level + 1, result)
        }
      }
      return result
    },
    []
  )

  // Memoize the flattened data
  const flattenedData = useCallback(() => {
    return flattenTree(treeData, expandedNodes)
  }, [treeData, expandedNodes, flattenTree])()

  return {
    treeData,
    flattenedData, // Export the flattened data
    setTreeData,
    loadingNodes,
    loadRootDirectory,
    loadSubDirectory,
  }
}

