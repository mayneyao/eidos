import { useState, useEffect, useCallback, useMemo } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import type { DataSpace } from "@eidos.space/core"
import type { FileEntry, SortField, SortOrder } from "../types"
import { filterEntries, sortEntriesByField, calculateStats } from "../utils"

export function useFolderEntries(folderPath: string, dataSpace: DataSpace) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [filteredEntries, setFilteredEntries] = useState<FileEntry[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await dataSpace.fs.readdir(folderPath, {
        withFileTypes: true,
      })

      const fileEntries: FileEntry[] = await Promise.all(
        items.map(async (item: IDirectoryEntry) => {
          const fullPath = `${folderPath}/${item.name}`
          try {
            const stats = await dataSpace.fs.stat(fullPath)
            return {
              name: item.name,
              path: fullPath,
              kind: item.kind as "file" | "directory",
              size: stats.size,
              mtimeMs: stats.mtimeMs,
              extension:
                item.kind === "file"
                  ? item.name.split(".").pop()?.toLowerCase()
                  : undefined,
            }
          } catch {
            return {
              name: item.name,
              path: fullPath,
              kind: item.kind as "file" | "directory",
              extension:
                item.kind === "file"
                  ? item.name.split(".").pop()?.toLowerCase()
                  : undefined,
            }
          }
        })
      )

      setEntries(fileEntries)
    } catch (err: any) {
      setError(err.message || "Failed to load folder contents")
    } finally {
      setLoading(false)
    }
  }, [folderPath, dataSpace])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // Filter and sort entries
  useEffect(() => {
    const filtered = filterEntries(entries, searchQuery)
    const sorted = sortEntriesByField(filtered, sortField, sortOrder)
    setFilteredEntries(sorted)
  }, [searchQuery, entries, sortField, sortOrder])

  const handleSort = useCallback((field: SortField) => {
    setSortField((currentField) => {
      if (currentField === field) {
        // Toggle order if same field
        setSortOrder((currentOrder) =>
          currentOrder === "asc" ? "desc" : "asc"
        )
        return field
      } else {
        // Default to ascending for new field
        setSortOrder("asc")
        return field
      }
    })
  }, [])

  const stats = useMemo(
    () => calculateStats(filteredEntries),
    [filteredEntries]
  )

  return {
    entries,
    filteredEntries,
    searchQuery,
    setSearchQuery,
    sortField,
    sortOrder,
    handleSort,
    loading,
    error,
    loadEntries,
    stats,
  }
}
