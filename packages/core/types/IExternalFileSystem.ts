/**
 * Serializable directory entry that can be passed through message communication
 * Replaces Node.js Dirent for IPC compatibility
 */
export interface IDirectoryEntry {
  /** Entry name (matches Dirent.name behavior: filename in non-recursive, relative path in recursive) */
  name: string
  /** Relative path from queried directory (matches Node.js readdir recursive behavior) */
  path: string
  /** Parent directory path relative to queried directory */
  parentPath: string
  /** Entry type */
  kind: 'file' | 'directory' | 'blockDevice' | 'characterDevice' | 'symbolicLink' | 'fifo' | 'socket'
  /** Optional metadata for virtual file system entries */
  metadata?: {
    nodeType?: "table" | "doc" | "folder" | "extension" | "dataview" | `ext__${string}`
    nodeId?: string
    isPinned?: boolean
    icon?: string
    /** Extension type (only for nodeType === "extension") */
    extensionType?: "script" | "block"
    /** Path based on node names (instead of IDs) */
    namePath?: string
  }
}

/**
 * Options for readdir
 */
export interface IReaddirOptions {
  withFileTypes?: boolean
  recursive?: boolean
}

/**
 * Options for mkdir
 */
export interface IMkdirOptions {
  recursive?: boolean
}

/**
 * Options for readFile
 */
export interface IReadFileOptions {
  encoding?: BufferEncoding | null
  flag?: string
}

/**
 * Options for writeFile
 */
export interface IWriteFileOptions {
  encoding?: BufferEncoding | null
  mode?: number
  flag?: string
}

/**
 * Serializable file stats object (no methods, only properties)
 * Compatible with Node.js fs.Stats but serializable for IPC
 */
export interface IStats {
  size: number
  mtimeMs: number
  atimeMs: number
  ctimeMs: number
  birthtimeMs: number
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
  isBlockDevice: boolean
  isCharacterDevice: boolean
  isFIFO: boolean
  isSocket: boolean
  mode: number
  uid: number
  gid: number
}

/**
 * Watch event interface
 * Compatible with Node.js fs watch event
 */
export interface IWatchEvent {
  eventType: 'rename' | 'change'
  filename: string
}

/**
 * Watch options interface
 * Compatible with Node.js fs watch options
 */
export interface IWatchOptions {
  encoding?: BufferEncoding
  persistent?: boolean
  recursive?: boolean
  signal?: AbortSignal
}

/**
 * External file system interface
 * API follows Node.js fs/promises
 * 
 * Supports:
 * - ~/ (project folder)
 * - @/ (mounted folders)
 */
export interface IExternalFileSystem {
  /**
   * List directory contents (like fs.readdir)
   * @param path Directory path (~/ or @/)
   * @param options Read options
   * @returns Array of file names or IDirectoryEntry objects
   */
  // Overload signature: when withFileTypes is true, returns IDirectoryEntry[]
  readdir(path: string, options: { withFileTypes: true; recursive?: boolean }): Promise<IDirectoryEntry[]>
  // Overload signature: when withFileTypes is false or undefined, returns string[]
  readdir(path: string, options?: { withFileTypes?: false; recursive?: boolean }): Promise<string[]>

  /**
   * Create directory (like fs.mkdir)
   * @param path Directory path to create
   * @param options Creation options
   * @returns Created directory path or undefined
   */
  mkdir(path: string, options?: IMkdirOptions): Promise<string | undefined>

  /**
   * Read file contents (like fs.readFile)
   * @param path File path (~/ or @/)
   * @param options Encoding or read options
   * @returns File contents as Uint8Array (binary) or string (with encoding)
   */
  // Overload signature: no options returns Uint8Array
  readFile(path: string): Promise<Uint8Array>
  // Overload signature: with encoding returns string
  readFile(path: string, options: { encoding: BufferEncoding; flag?: string } | BufferEncoding): Promise<string>
  // Implementation signature: must be compatible with all overload signatures
  readFile(path: string, options?: IReadFileOptions | BufferEncoding): Promise<string | Uint8Array>

  /**
   * Write file contents (like fs.writeFile)
   * @param path File path (~/ or @/)
   * @param data File contents as string or Uint8Array
   * @param options Encoding or write options
   */
  writeFile(path: string, data: string | Uint8Array, options?: IWriteFileOptions | BufferEncoding): Promise<void>

  /**
   * Get file stats (like fs.stat)
   * @param path File path (~/ or @/)
   * @returns Serializable file stats object
   */
  stat(path: string): Promise<IStats>

  /**
   * Rename file or directory (like fs.rename)
   * @param oldPath Current path
   * @param newPath New path
   */
  rename(oldPath: string, newPath: string): Promise<void>

  /**
   * Watch for changes on a file or directory (like fs.watch)
   * @param path File or directory path to watch
   * @param options Watch options
   * @returns AsyncIterable of watch events
   */
  watch(path: string, options?: IWatchOptions): AsyncIterable<IWatchEvent>
}

