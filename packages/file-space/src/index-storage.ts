import type { FileSpaceMarkdownMetadata } from "./markdown-metadata"

export const FILE_SPACE_INDEX_FORMAT_VERSION = 1

export interface FileSpaceIndexRecord {
  path: string
  name: string
  size: number
  mtimeMs: number
  content?: string
  metadata?: FileSpaceMarkdownMetadata
}

export interface FileSpaceIndexSnapshot {
  formatVersion: typeof FILE_SPACE_INDEX_FORMAT_VERSION
  optionsKey: string
  indexedAt: number
  directories: string[]
  entries: FileSpaceIndexRecord[]
}

/**
 * Disposable persistence for the derived file index.
 *
 * Implementations must never be treated as canonical storage. Returning null
 * from load, or deleting the store entirely, must only cause a filesystem
 * rebuild.
 */
export interface FileSpaceIndexStorage {
  load(): FileSpaceIndexSnapshot | null
  replace(snapshot: FileSpaceIndexSnapshot): void
  upsert(record: FileSpaceIndexRecord): void
  removePath(relativePath: string): void
  clear(): void
  close(): void
}
