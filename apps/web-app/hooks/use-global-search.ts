"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { IDirectoryEntry } from "@/packages/core/types/IExternalFileSystem"
import { useDebounce } from "@/apps/web-app/hooks/use-debounce"

export interface SearchResult {
  type: "node" | "extension" | "file"
  id: string
  name: string
  path: string
  isDirectory?: boolean
  nodeType?: string
}

export function useGlobalSearch(sqlite: any, isGlobalSearchOpen: boolean) {
  const [searchTerm, setSearchTerm] = useState("")
  const [allNodes, setAllNodes] = useState<IDirectoryEntry[]>([])
  const [allExtensions, setAllExtensions] = useState<IDirectoryEntry[]>([])
  const [fileResults, setFileResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Helper function to convert directory entry to search result
  const entryToSearchResult = useCallback(
    (
      entry: IDirectoryEntry,
      type: "node" | "extension" | "file"
    ): SearchResult | null => {
      try {
        if (
          !entry.name ||
          !entry.path ||
          typeof entry.name !== "string" ||
          typeof entry.path !== "string"
        ) {
          console.warn(`Invalid ${type} entry:`, entry)
          return null
        }

        const parts = entry.path.split("/").filter(Boolean)
        const id = parts[parts.length - 1]

        if (!id) {
          console.warn(`Could not extract ${type} ID from path:`, entry.path)
          return null
        }

        const displayPath = entry.metadata?.namePath || entry.path

        return {
          type,
          id,
          name: entry.name || "Untitled",
          path: displayPath,
          isDirectory: type === "node" ? entry.kind === "directory" : undefined,
          nodeType: entry.metadata?.nodeType,
        }
      } catch (error) {
        console.error(`Error processing ${type} entry:`, entry, error)
        return null
      }
    },
    []
  )

  // Fetch all nodes and extensions when dialog opens
  useEffect(() => {
    if (!isGlobalSearchOpen || !sqlite?.fs) return

    const loadEntries = async () => {
      setIsLoading(true)
      try {
        const fs = sqlite.fs

        // Load nodes recursively
        console.time("readdir nodes")
        const nodesEntries = await fs.readdir("~/.eidos/__NODES__/", {
          withFileTypes: true,
          recursive: true,
        })
        console.timeEnd("readdir nodes")
        setAllNodes(nodesEntries)

        // Load extensions
        const extensionsEntries = await fs.readdir("~/.eidos/__EXTENSIONS__/", {
          withFileTypes: true,
        })
        setAllExtensions(extensionsEntries)
      } catch (error) {
        console.error("Failed to load entries:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadEntries()
  }, [isGlobalSearchOpen, sqlite])

  // Search files
  const performSearch = useCallback(
    async (term: string) => {
      if (!term || !sqlite?.fs) {
        setFileResults([])
        return
      }

      try {
        const paths = await sqlite.fs.search(term)
        const results: SearchResult[] = []

        for (const path of paths) {
          const name = path.split("/").pop() || ""
          // Create a mock entry for conversion
          const entry: IDirectoryEntry = {
            name,
            path,
            parentPath: "",
            kind: "file",
          }
          const result = entryToSearchResult(entry, "file")
          if (result) {
            results.push(result)
          }
        }
        setFileResults(results)
      } catch (error) {
        console.error("File search failed:", error)
      }
    },
    [sqlite, entryToSearchResult]
  )

  const debouncedSearch = useDebounce(performSearch, 300)

  useEffect(() => {
    debouncedSearch(searchTerm)
  }, [searchTerm, debouncedSearch])


  // Filter node results based on search term
  const nodeResults = useMemo(() => {
    const results: SearchResult[] = []

    // If no search term, show first 10 nodes
    if (!searchTerm) {
      allNodes.slice(0, 10).forEach((entry) => {
        const result = entryToSearchResult(entry, "node")
        if (result) results.push(result)
      })
      return results
    }

    // Filter nodes based on search term
    const term = searchTerm.toLowerCase()
    const nodeMatches: Array<{
      result: SearchResult
      matchType: "name" | "path"
    }> = []

    allNodes.forEach((entry) => {
      const result = entryToSearchResult(entry, "node")
      if (result) {
        const nameMatch = result.name.toLowerCase().includes(term)
        const namePathMatch =
          entry.metadata?.namePath?.toLowerCase().includes(term) || false
        const idPathMatch = entry.path.toLowerCase().includes(term)

        if (nameMatch) {
          nodeMatches.push({ result, matchType: "name" })
        } else if (namePathMatch || idPathMatch) {
          nodeMatches.push({ result, matchType: "path" })
        }
      }
    })

    // Sort: name matches first, then path matches
    nodeMatches.sort((a, b) => {
      if (a.matchType === "name" && b.matchType === "path") return -1
      if (a.matchType === "path" && b.matchType === "name") return 1
      return 0
    })

    // Add sorted node results
    nodeMatches.forEach(({ result }) => results.push(result))

    return results
  }, [searchTerm, allNodes, entryToSearchResult])

  // Filter extension results based on search term
  const extensionResults = useMemo(() => {
    const results: SearchResult[] = []

    // If no search term, show first 10 extensions
    if (!searchTerm) {
      allExtensions.slice(0, 10).forEach((entry) => {
        const result = entryToSearchResult(entry, "extension")
        if (result) results.push(result)
      })
      return results
    }

    // Filter extensions based on search term
    const term = searchTerm.toLowerCase()
    allExtensions.forEach((entry) => {
      const result = entryToSearchResult(entry, "extension")
      if (result && result.name.toLowerCase().includes(term)) {
        results.push(result)
      }
    })

    return results
  }, [searchTerm, allExtensions, entryToSearchResult])

  return {
    searchTerm,
    setSearchTerm,
    nodeResults,
    extensionResults,
    fileResults,
    isLoading,
    performSearch,
  }
}
