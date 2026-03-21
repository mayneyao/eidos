"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"

import { useSqlite } from "@/hooks/use-sqlite"
import { useMounts } from "@/hooks/use-mounts"

export interface FinderLocation {
  id: string
  name: string
  path: string
  type: "space" | "mount" | "directory"
  icon?: string
}

export interface FinderItem extends IDirectoryEntry {
  isSelected?: boolean
}

export type FinderSelectMode = "file" | "directory"

export interface UseFinderOptions {
  initialPath?: string
  /**
   * Selection mode:
   * - "file": Select files only
   * - "directory": Select directories only
   */
  selectMode?: FinderSelectMode
  /** Allow multiple selection */
  allowMultiple?: boolean
  onSelect?: (paths: string[]) => void
}

export function useFinder(options: UseFinderOptions = {}) {
  const {
    initialPath = "~/",
    selectMode = "file",
    allowMultiple = false,
    onSelect,
  } = options

  // Refs for stable references
  const onSelectRef = useRef(onSelect)
  const sqliteRef = useRef(useSqlite().sqlite)
  const { mounts, isLoading: isMountsLoading } = useMounts()

  // Update refs when values change
  onSelectRef.current = onSelect
  sqliteRef.current = useSqlite().sqlite

  // State
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [items, setItems] = useState<FinderItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQueryState] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([initialPath])
  const [historyIndex, setHistoryIndex] = useState(0)

  const searchTimeoutRef = useRef<NodeJS.Timeout>()
  const displayItemsRef = useRef<FinderItem[]>([])

  // Debounced search query update
  const setSearchQuery = useCallback((value: string) => {
    setSearchQueryState(value)
    // Use transition for UI updates, debounce for API calls
    startTransition(() => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      searchTimeoutRef.current = setTimeout(() => {
        setDebouncedQuery(value.trim())
      }, 300)
    })
  }, [])

  // Locations - memoized
  const locations: FinderLocation[] = useMemo(() => {
    const baseLocations: FinderLocation[] = [
      {
        id: "space",
        name: "Space",
        path: "~/",
        type: "space",
        icon: "Database",
      },
    ]
    const mountLocations: FinderLocation[] = mounts.map((mount) => ({
      id: `mount-${mount.name}`,
      name: mount.name,
      path: `@/${mount.name}`,
      type: "mount",
      icon: "FolderOpen",
    }))
    return [...baseLocations, ...mountLocations]
  }, [mounts])

  // Load directory - stable callback using refs
  const loadDirectory = useCallback(
    async (path: string) => {
      const sqlite = sqliteRef.current
      if (!sqlite?.fs) return
      if (searchQuery) return

      setIsLoading(true)
      try {
        const entries = await sqlite.fs.readdir(path, { withFileTypes: true })
        const finderItems: FinderItem[] = entries.map((entry) => ({
          ...entry,
          isSelected: selectedPaths.has(entry.path),
        }))
        finderItems.sort((a, b) => {
          if (a.kind === "directory" && b.kind !== "directory") return -1
          if (a.kind !== "directory" && b.kind === "directory") return 1
          return a.name.localeCompare(b.name)
        })
        setItems(finderItems)
      } catch (err) {
        console.error("Failed to load directory:", err)
        setItems([])
      } finally {
        setIsLoading(false)
      }
    },
    [searchQuery]
  ) // Only depend on searchQuery

  // Load on path change - no dependencies that change every render
  useEffect(() => {
    if (!searchQuery) {
      loadDirectory(currentPath)
    }
  }, [currentPath, searchQuery]) // Intentionally omit loadDirectory

  // Search effect using debounced query
  // Note: Search only works in file mode since it searches file contents
  useEffect(() => {
    const query = debouncedQuery
    if (!query) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    // Disable search in directory selection mode
    if (selectMode === "directory") {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    let cancelled = false

    const doSearch = async () => {
      const sqlite = sqliteRef.current
      if (!sqlite?.fs?.search) {
        if (!cancelled) {
          setSearchResults([])
          setIsSearching(false)
        }
        return
      }

      setIsSearching(true)
      try {
        const results = await sqlite.fs.search(query)
        if (!cancelled) {
          setSearchResults(results)
        }
      } catch (err) {
        console.error("Search failed:", err)
        if (!cancelled) {
          setSearchResults([])
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false)
        }
      }
    }

    doSearch()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  // Navigation
  const navigateTo = useCallback(
    (path: string, addToHistory = true) => {
      setCurrentPath(path)
      setSelectedPaths(new Set())
      setSelectionAnchor(null)

      if (addToHistory) {
        setHistory((prev) => {
          const newHistory = prev.slice(0, historyIndex + 1)
          newHistory.push(path)
          return newHistory
        })
        setHistoryIndex((prev) => prev + 1)
      }
    },
    [historyIndex]
  )

  const navigateBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setCurrentPath(history[newIndex])
      setSelectedPaths(new Set())
    }
  }, [history, historyIndex])

  const navigateForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setCurrentPath(history[newIndex])
      setSelectedPaths(new Set())
    }
  }, [history, historyIndex])

  const navigateUp = useCallback(() => {
    if (currentPath === "~/" || currentPath === "~") return
    if (currentPath.startsWith("@/")) {
      const parts = currentPath.split("/")
      if (parts.length <= 2) {
        navigateTo("~/")
        return
      }
    }
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "~/"
    navigateTo(parentPath)
  }, [currentPath, navigateTo])

  // Selection - uses displayItemsRef to always work with current displayed items
  const toggleSelection = useCallback(
    (path: string, isShiftKey = false, isMetaKey = false) => {
      const currentItems = displayItemsRef.current
      const item = currentItems.find((i) => i.path === path)
      if (!item) return

      const isDirectory = item.kind === "directory"
      // Strict selection: only select items matching the selectMode
      const isAllowed =
        (selectMode === "directory" && isDirectory) ||
        (selectMode === "file" && !isDirectory)

      if (!isAllowed) return

      if (isShiftKey && selectionAnchor && allowMultiple) {
        const anchorIndex = currentItems.findIndex(
          (i) => i.path === selectionAnchor
        )
        const targetIndex = currentItems.findIndex((i) => i.path === path)
        // Ensure valid indices before calculating range
        if (anchorIndex === -1 || targetIndex === -1) {
          setSelectedPaths(new Set([path]))
          setSelectionAnchor(path)
          return
        }
        const start = Math.min(anchorIndex, targetIndex)
        const end = Math.max(anchorIndex, targetIndex)

        const newSelection = new Set(selectedPaths)
        for (let i = start; i <= end; i++) {
          const item = currentItems[i]
          const isDirectory = item.kind === "directory"
          // Strict selection: only select items matching the selectMode
          const itemAllowed =
            (selectMode === "directory" && isDirectory) ||
            (selectMode === "file" && !isDirectory)
          if (itemAllowed) {
            newSelection.add(item.path)
          }
        }
        setSelectedPaths(newSelection)
      } else if (isMetaKey && allowMultiple) {
        const newSelection = new Set(selectedPaths)
        if (newSelection.has(path)) {
          newSelection.delete(path)
        } else {
          newSelection.add(path)
        }
        setSelectedPaths(newSelection)
        setSelectionAnchor(path)
      } else {
        setSelectedPaths(new Set([path]))
        setSelectionAnchor(path)
      }
    },
    [selectedPaths, selectionAnchor, allowMultiple, selectMode]
  )

  const selectAll = useCallback(() => {
    const currentItems = displayItemsRef.current
    const allowedItems = currentItems.filter((item) => {
      const isDirectory = item.kind === "directory"
      return (
        (selectMode === "directory" && isDirectory) ||
        (selectMode === "file" && !isDirectory)
      )
    })
    setSelectedPaths(new Set(allowedItems.map((i) => i.path)))
  }, [selectMode])

  const handleItemDoubleClick = useCallback(
    (item: FinderItem) => {
      const isDirectory = item.kind === "directory"
      if (isDirectory) {
        navigateTo(item.path)
      } else if (selectMode === "file") {
        // In file mode, double-click selects and confirms
        setSelectedPaths(new Set([item.path]))
        onSelectRef.current?.([item.path])
      }
    },
    [navigateTo, selectMode]
  )

  const confirmSelection = useCallback(() => {
    if (selectedPaths.size > 0) {
      onSelectRef.current?.(Array.from(selectedPaths))
    }
  }, [selectedPaths])

  // Display searching state during both debounce and actual search
  const showSearchResults = !!debouncedQuery
  const isSearchMode = !!debouncedQuery

  // Derived state - current displayed items (directory or search results)
  const searchResultItems: FinderItem[] = useMemo(() => {
    return searchResults.map((path) => ({
      path,
      name: path.split("/").pop() || path,
      kind: "file" as const,
      parentPath: path.split("/").slice(0, -1).join("/") || "~/",
      isSelected: selectedPaths.has(path),
    }))
  }, [searchResults])

  const displayItems = useMemo(() => {
    return showSearchResults ? searchResultItems : items
  }, [showSearchResults, searchResultItems, items])

  // Keep displayItemsRef updated
  displayItemsRef.current = displayItems

  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < history.length - 1
  const canGoUp = currentPath !== "~/" && currentPath !== "~"

  return {
    currentPath,
    locations,
    items: displayItems,
    isLoading: isLoading || isMountsLoading,
    isSearching:
      isSearching ||
      isPending ||
      (searchQuery !== debouncedQuery && !!searchQuery),
    selectedPaths,
    searchQuery,
    canGoBack,
    canGoForward,
    canGoUp,
    isSearchMode,
    navigateTo,
    navigateBack,
    navigateForward,
    navigateUp,
    toggleSelection,
    selectAll,
    handleItemDoubleClick,
    setSearchQuery,
    confirmSelection,
    refresh: () => loadDirectory(currentPath),
  }
}
