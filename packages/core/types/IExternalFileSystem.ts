import type { Dirent } from 'node:fs'

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
   * @returns Array of file names or Dirent objects
   */
  readdir(path: string): Promise<string[]>
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  readdir(path: string, options?: IReaddirOptions): Promise<string[] | Dirent[]>

  /**
   * Create directory (like fs.mkdir)
   * @param path Directory path to create
   * @param options Creation options
   * @returns Created directory path or undefined
   */
  mkdir(path: string, options?: IMkdirOptions): Promise<string | undefined>
}

