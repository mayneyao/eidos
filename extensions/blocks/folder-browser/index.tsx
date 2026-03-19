import { useEffect, useMemo, useState } from "react"
import type { IDirectoryEntry } from "@eidos.space/core/types/IExternalFileSystem"
import {
  useEidos,
  useExtensionContext,
  type FolderHandlerContext,
} from "@eidos.space/react"
import {
  FolderIcon,
  FileIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

/**
 * Extension metadata for Eidos
 * FolderHandler type - Finder-style folder browser
 */
export const meta = {
  type: "folderHandler",
  componentName: "FolderBrowser",
  icon: "folder",
  folderHandler: {
    title: "Finder",
    description:
      "macOS Finder-style folder browser with clean list view and breadcrumb navigation.",
    patterns: ["*"],
    priority: 0,
    allowRoot: true,
  },
}

interface FileEntry {
  name: string
  path: string
  kind: "file" | "directory"
  size?: number
  mtimeMs?: number
}

export function FolderBrowser() {
  const ctx = useExtensionContext<FolderHandlerContext>()
  const { folderPath, folderName } = ctx

  const eidos = useEidos()
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [filteredEntries, setFilteredEntries] = useState<FileEntry[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEntries = async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await eidos.currentSpace.fs.readdir(folderPath, {
        withFileTypes: true,
      })

      const fileEntries: FileEntry[] = await Promise.all(
        items.map(async (item: IDirectoryEntry) => {
          const fullPath = `${folderPath}/${item.name}`
          try {
            const stats = await eidos.currentSpace.fs.stat(fullPath)
            return {
              name: item.name,
              path: fullPath,
              kind: item.kind as "file" | "directory",
              size: stats.size,
              mtimeMs: stats.mtimeMs,
            }
          } catch {
            return {
              name: item.name,
              path: fullPath,
              kind: item.kind as "file" | "directory",
            }
          }
        })
      )

      // Sort: directories first, then alphabetically
      fileEntries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      setEntries(fileEntries)
      setFilteredEntries(fileEntries)
    } catch (err: any) {
      setError(err.message || "Failed to load folder contents")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries()
  }, [folderPath])

  // Filter entries based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredEntries(entries)
      return
    }
    const query = searchQuery.toLowerCase()
    setFilteredEntries(
      entries.filter((entry) => entry.name.toLowerCase().includes(query))
    )
  }, [searchQuery, entries])

  const formatSize = (bytes?: number): string => {
    if (bytes === undefined) return "--"
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return "--"
    const date = new Date(timestamp)
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    )
  }

  const openEntry = (entry: FileEntry) => {
    if (entry.kind === "directory") {
      const encodedPath = encodeURIComponent(entry.path)
      eidos.currentSpace.navigate(`/folder#${encodedPath}`)
    } else {
      const encodedPath = encodeURIComponent(entry.path)
      eidos.currentSpace.navigate(`/file#${encodedPath}`)
    }
  }

  const navigateUp = () => {
    if (folderPath === "~/" || folderPath === "@/") return
    const parentPath = folderPath.split("/").slice(0, -1).join("/") || "~/"
    const encodedPath = encodeURIComponent(parentPath + "/")
    eidos.currentSpace.navigate(`/folder#${encodedPath}`)
  }

  // Build breadcrumb segments
  const breadcrumbSegments = useMemo(() => {
    const parts = folderPath.split("/").filter(Boolean)
    const segments: { name: string; path: string }[] = []
    let currentPath = ""

    parts.forEach((part, index) => {
      currentPath += (index === 0 ? "" : "/") + part
      segments.push({
        name: part,
        path: currentPath + (index === 0 ? "/" : ""),
      })
    })

    return segments
  }, [folderPath])

  const navigateToSegment = (path: string) => {
    const encodedPath = encodeURIComponent(path)
    eidos.currentSpace.navigate(`/folder#${encodedPath}`)
  }

  const isRoot = folderPath === "~/" || folderPath === "@/"

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-3">{error}</p>
          <button
            onClick={loadEntries}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background pb-8">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 sticky top-0 z-10">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={navigateUp}
            disabled={isRoot}
            className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Go to parent folder"
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-sm text-muted-foreground font-medium">
            {folderPath.startsWith("~") ? "~" : "@"}
          </span>
          {breadcrumbSegments.slice(1).map((segment, index) => (
            <div key={segment.path} className="flex items-center">
              <ChevronRightIcon className="h-3 w-3 text-muted-foreground mx-0.5" />
              <button
                onClick={() => navigateToSegment(segment.path)}
                className="text-sm hover:bg-muted px-1.5 py-0.5 rounded transition-colors truncate max-w-[120px]"
              >
                {segment.name}
              </button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-40 pl-7 pr-7 py-1 text-sm bg-muted rounded-md border-0 focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted-foreground/20 rounded"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* List header */}
      <div className="flex items-center px-4 py-1.5 border-b bg-muted/20 text-xs text-muted-foreground font-medium sticky top-[45px] z-10">
        <div className="flex-1">Name</div>
        <div className="w-24 text-right">Size</div>
        <div className="w-32 text-right ml-4">Modified</div>
      </div>

      {/* File list */}
      <div>
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            {searchQuery ? (
              <>
                <SearchIcon className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No matches found</p>
              </>
            ) : (
              <>
                <FolderIcon className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">This folder is empty</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filteredEntries.map((entry) => (
              <div
                key={entry.path}
                onClick={() => openEntry(entry)}
                onDoubleClick={() => openEntry(entry)}
                className="flex items-center px-4 py-2 hover:bg-accent/50 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {entry.kind === "directory" ? (
                    <FolderIcon className="h-5 w-5 text-blue-500 shrink-0" />
                  ) : (
                    <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm truncate">{entry.name}</span>
                </div>
                <div className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                  {entry.kind === "file" ? formatSize(entry.size) : "--"}
                </div>
                <div className="w-32 text-right ml-4 text-xs text-muted-foreground tabular-nums">
                  {formatDate(entry.mtimeMs)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground sticky bottom-0">
        <div>
          {filteredEntries.length}{" "}
          {filteredEntries.length === 1 ? "item" : "items"}
          {searchQuery && ` (${entries.length} total)`}
        </div>
        <div className="tabular-nums">
          {formatSize(
            filteredEntries
              .filter((e) => e.kind === "file" && e.size)
              .reduce((sum, e) => sum + (e.size || 0), 0)
          )}
        </div>
      </div>
    </div>
  )
}
