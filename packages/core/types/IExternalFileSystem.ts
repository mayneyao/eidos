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
  readdir(path: string): Promise<string[]>
  readdir(path: string, options: { withFileTypes: true }): Promise<IDirectoryEntry[]>
  readdir(path: string, options?: IReaddirOptions): Promise<string[] | IDirectoryEntry[]>

  /**
   * Create directory (like fs.mkdir)
   * @param path Directory path to create
   * @param options Creation options
   * @returns Created directory path or undefined
   */
  mkdir(path: string, options?: IMkdirOptions): Promise<string | undefined>
}

