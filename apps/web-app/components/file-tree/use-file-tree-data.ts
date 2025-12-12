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
  const normalizedRootDir = rootDir ? rootDir.replace(/\/+$/, "") : rootDir

  // Flat data structure
  // rootNodes: Top level nodes
  // dirContent: Map of directory path -> list of children nodes
  const [rootNodes, setRootNodes] = useState<FileTreeNode[]>(initialNodes || [])
  const [dirContent, setDirContent] = useState<Map<string, FileTreeNode[]>>(
    new Map()
  )
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
      // console.log(`loadSubDirectory called with path: ${path}`)
      if (!sqlite) {
        console.log("No sqlite instance")
        return
      }

      setLoadingNodes((prev) => {
        if (prev.has(path)) {
          // console.log(`Already loading: ${path}`)
          return prev // Already loading, return same reference
        }
        return new Set(prev).add(path)
      })

      try {
        // console.log(`Reading directory: ${path}`)
        const entries = await sqlite.fs.readdir(path, {
          withFileTypes: true,
        })
        // console.log(`Directory entries for ${path}:`, entries)

        // Inject path into entries
        const entriesWithPaths = entries.map((entry) => ({
          ...entry,
          path: entry.path || `${path.endsWith("/") ? path : path + "/"}${entry.name}`,
        }))

        const sortedEntries = sortEntries(entriesWithPaths)

        setDirContent((prev) => {
          const newMap = new Map(prev)
          newMap.set(path, sortedEntries)
          return newMap
        })
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
    if (!sqlite || !normalizedRootDir) return

    try {
      const entries = await sqlite.fs.readdir(normalizedRootDir, {
        withFileTypes: true,
      })

      // Inject path into entries
      const entriesWithPaths = entries.map((entry) => ({
        ...entry,
        path: entry.path || `${normalizedRootDir.endsWith("/") ? normalizedRootDir : normalizedRootDir + "/"}${entry.name}`,
      }))

      const sortedEntries = sortEntries(entriesWithPaths)
      setRootNodes(sortedEntries)

      // Reload children for all expanded directories to keep them in sync
      const reloadPromises = Array.from(expandedNodesRef.current).map(
        async (path) => {
          if (path !== normalizedRootDir) {
            await loadSubDirectory(path)
          }
        }
      )

      await Promise.all(reloadPromises)
    } catch (error) {
      console.error("Failed to load root directory:", error)
    }
  }, [sqlite, normalizedRootDir, loadSubDirectory])

  // Load root directory only in rootDir mode
  useEffect(() => {
    if (!isNodesMode && sqlite && normalizedRootDir) {
      loadRootDirectory()
    }
  }, [isNodesMode, sqlite, normalizedRootDir, loadRootDirectory])

  // Initialize with nodes if provided
  useEffect(() => {
    if (isNodesMode && initialNodes) {
      setRootNodes(initialNodes)
    }
  }, [isNodesMode, initialNodes])

  // Watch for file system changes (only in rootDir mode)
  useEffect(() => {
    if (isNodesMode || !sqlite || !normalizedRootDir) return

    const abortController = new AbortController()
    const { signal } = abortController

    // Start watching the root directory
    const watchDirectory = async () => {
      try {
        for await (const event of sqlite.fs.watch(normalizedRootDir, {
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
        let targetPathToReload = normalizedRootDir

        // Construct full paths for all segments
        // If path is "a/b/c", we check "root/a/b", then "root/a", then "root"
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const subPath = pathParts.slice(0, i + 1).join("/")
          const fullPath = `${normalizedRootDir}/${subPath}`

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
        if (targetPathToReload === normalizedRootDir) {
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
          console.error(
            "[FileTree Watch] Fallback reload failed:",
            fallbackError
          )
        }
      }
    }

    watchDirectory()

    // Cleanup: abort watch when component unmounts or dependencies change
    return () => {
      abortController.abort()
    }
  }, [
    sqlite,
    normalizedRootDir,
    isNodesMode,
    expandedNodes,
    loadRootDirectory,
    loadSubDirectory,
  ])

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
            console.error(`FileTree watch error for ${mountPath}:`, error)
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
        // Get children from dirContent
        const children = dirContent.get(node.path)

        // Add current node with children attached (for compatibility)
        // We attach children so that the renderer knows if it has children loaded
        const nodeWithChildren = { ...node, children, level } as any
        result.push(nodeWithChildren)

        // If directory and expanded, add children to the flat list
        if (node.kind === "directory" && expanded.has(node.path) && children) {
          flattenTree(children, expanded, level + 1, result)
        }
      }
      return result
    },
    [dirContent]
  )

  // Memoize the flattened data
  const flattenedData = useCallback(() => {
    return flattenTree(rootNodes, expandedNodes)
  }, [rootNodes, expandedNodes, flattenTree])()

  // Expand to a specific path (Locator)
  const expandTo = useCallback(
    async (path: string) => {
      if (!sqlite) return

      try {
        // 1. Identify root node
        let rootNodePath = ""
        let rootNodeFound = false

        for (const rootNode of rootNodes) {
          if (path.startsWith(rootNode.path)) {
            rootNodeFound = true
            rootNodePath = rootNode.path
            break
          }
        }

        if (!rootNodeFound && normalizedRootDir && path.startsWith(normalizedRootDir)) {
          rootNodePath = normalizedRootDir
          rootNodeFound = true
        }

        if (!rootNodeFound) {
          console.warn(`[FileTree] Could not find root for path: ${path}`)
          return
        }

        // 2. Identify paths to expand
        const pathSegments = path.split("/")
        const pathsToExpand: string[] = []

        // Generate all parent paths that are descendants of rootNodePath
        // e.g. root=/a, path=/a/b/c -> expand /a, /a/b

        const relativePath = path.slice(rootNodePath.length).replace(/^\//, "")
        if (!relativePath) {
          // Path is exactly the root node; still scroll to it
          setTimeout(() => {
            onScrollToNode?.(path)
          }, 100)
          return
        }

        const relativeSegments = relativePath.split("/")

        // Add root path first
        pathsToExpand.push(rootNodePath)

        let accumulatedPath = rootNodePath.endsWith("/")
          ? rootNodePath.slice(0, -1)
          : rootNodePath

        for (let i = 0; i < relativeSegments.length - 1; i++) {
          accumulatedPath = `${accumulatedPath}/${relativeSegments[i]}`
          pathsToExpand.push(accumulatedPath)
        }

        // 3. Sequentially load and expand
        const newExpanded = new Set(expandedNodes)
        let changed = false

        for (const p of pathsToExpand) {
          if (!dirContent.has(p)) {
            await loadSubDirectory(p)
          }

          if (!newExpanded.has(p)) {
            newExpanded.add(p)
            changed = true
          }
        }

        if (changed) {
          setExpandedNodes(newExpanded)
        }

        // 4. Scroll to node
        setTimeout(() => {
          onScrollToNode?.(path)
        }, 100)

      } catch (e) {
        console.error(`[FileTree] expandTo failed for ${path}`, e)
      }
    },
    [sqlite, rootNodes, normalizedRootDir, expandedNodes, dirContent, loadSubDirectory, setExpandedNodes, onScrollToNode]
  )

  // Listen for custom event to trigger expandTo
  useEffect(() => {
    const handleExpandTo = (e: CustomEvent<{ path: string }>) => {
      if (e.detail && e.detail.path) {
        expandTo(e.detail.path)
      }
    }

    window.addEventListener("file-tree-expand-to" as any, handleExpandTo)
    return () => {
      window.removeEventListener("file-tree-expand-to" as any, handleExpandTo)
    }
  }, [expandTo])

  return {
    treeData: rootNodes,
    flattenedData,
    setTreeData: setRootNodes,
    loadingNodes,
    loadRootDirectory,
    loadSubDirectory,
    expandTo
  }
}
