import type { FileEntry } from "./types"

// Format file size
export const formatSize = (bytes?: number): string => {
  if (bytes === undefined) return "—"
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)) +
    " " +
    sizes[i]
  )
}

// Format date
export const formatDate = (timestamp?: number): string => {
  if (!timestamp) return "—"
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const isYesterday =
    new Date(now.getTime() - 86400000).toDateString() === date.toDateString()

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (isYesterday) {
    return "Yesterday"
  }
  return date
    .toLocaleDateString(undefined, {
      year: now.getFullYear() === date.getFullYear() ? undefined : "numeric",
      month: "short",
      day: "numeric",
    })
    .replace(",", "")
}

// Filter entries based on search query
export const filterEntries = (
  entries: FileEntry[],
  searchQuery: string
): FileEntry[] => {
  if (!searchQuery.trim()) {
    return entries
  }
  const query = searchQuery.toLowerCase()
  return entries.filter((entry) => entry.name.toLowerCase().includes(query))
}

import type { SortField, SortOrder } from "./types"

// Sort entries: directories first, then alphabetically
export const sortEntries = (entries: FileEntry[]): FileEntry[] => {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// Sort entries with custom field and order
export const sortEntriesByField = (
  entries: FileEntry[],
  field: SortField,
  order: SortOrder
): FileEntry[] => {
  return [...entries].sort((a, b) => {
    // Directories always come first when sorting by name
    // For other fields, mix files and directories
    if (field === "name") {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
    }

    let comparison = 0

    switch (field) {
      case "name":
        comparison = a.name.localeCompare(b.name)
        break
      case "size":
        const sizeA = a.size ?? 0
        const sizeB = b.size ?? 0
        comparison = sizeA - sizeB
        break
      case "mtime":
        const timeA = a.mtimeMs ?? 0
        const timeB = b.mtimeMs ?? 0
        comparison = timeA - timeB
        break
    }

    return order === "asc" ? comparison : -comparison
  })
}

// Build breadcrumb segments from folder path
export const buildBreadcrumbSegments = (
  folderPath: string
): Array<{ name: string; path: string; isLast: boolean }> => {
  const segments: Array<{ name: string; path: string; isLast: boolean }> = []

  // Handle special root prefixes @/ and ~/
  if (folderPath.startsWith("@/") || folderPath.startsWith("~/")) {
    const prefix = folderPath.slice(0, 2) // "@/" or "~/"
    const rest = folderPath.slice(2) // content after prefix
    const parts = rest.split("/").filter(Boolean)
    let currentPath = prefix

    // Add root prefix as first segment (will be skipped in render via slice(1))
    segments.push({ name: prefix, path: prefix, isLast: parts.length === 0 })

    // Add remaining path parts
    parts.forEach((part, index) => {
      currentPath += part + "/"
      segments.push({
        name: part,
        path: currentPath,
        isLast: index === parts.length - 1,
      })
    })
  } else {
    // Regular paths without special prefix
    const parts = folderPath.split("/").filter(Boolean)
    let currentPath = ""

    parts.forEach((part, index) => {
      currentPath += (index === 0 ? "" : "/") + part
      segments.push({
        name: part,
        path: currentPath,
        isLast: index === parts.length - 1,
      })
    })
  }

  return segments
}

// Get file extension from file name
export const getFileExtension = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf(".")
  if (dotIndex === -1 || dotIndex === 0) return ""
  return fileName.substring(dotIndex).toLowerCase()
}

// Calculate file statistics
export const calculateStats = (
  entries: FileEntry[]
): { folders: number; files: number; totalSize: number } => {
  const folders = entries.filter((e) => e.kind === "directory").length
  const files = entries.filter((e) => e.kind === "file").length
  const totalSize = entries
    .filter((e) => e.kind === "file" && e.size)
    .reduce((sum, e) => sum + (e.size || 0), 0)
  return { folders, files, totalSize }
}
