export interface FileEntry {
  name: string
  path: string
  kind: "file" | "directory"
  size?: number
  mtimeMs?: number
  extension?: string
}

export interface FileStats {
  folders: number
  files: number
  totalSize: number
}

export type SortField = "name" | "size" | "mtime"
export type SortOrder = "asc" | "desc"
