import type { BaseDataSpace } from "../data-space/base"
import type { IReaddirOptions, IMkdirOptions, IDirectoryEntry } from "../types/IExternalFileSystem"

/**
 * File system SDK for external files
 * Environment-agnostic wrapper around IExternalFileSystem
 * 
 * API follows Node.js fs/promises for familiarity
 */
export class FSManager {
  constructor(public dataSpace: BaseDataSpace) { }

  private get externalFS() {
    if (!this.dataSpace.externalFS) {
      throw new Error('External file system not configured')
    }
    return this.dataSpace.externalFS
  }

  /**
   * List directory contents
   * 
   * @example
   * // Get file names
   * const files = await eidos.currentSpace.fs.readdir("~/")
   * console.log(files) // ["package.json", "src", "README.md"]
   * 
   * @example
   * // Get directory entries with type information
   * const entries = await eidos.currentSpace.fs.readdir("~/", { withFileTypes: true })
   * entries.forEach(e => console.log(e.name, e.kind === 'directory'))
   * 
   * @example
   * // Recursively list all files
   * const allFiles = await eidos.currentSpace.fs.readdir("~/", { recursive: true })
   * console.log(allFiles) // ["package.json", "src/index.ts", "src/utils/helper.ts", ...]
   * 
   * @example
   * // List mounted folder
   * const music = await eidos.currentSpace.fs.readdir("@/music")
   */
  // Overload signature: when withFileTypes is true, returns IDirectoryEntry[]
  async readdir(path: string, options: { withFileTypes: true; recursive?: boolean }): Promise<IDirectoryEntry[]>
  // Overload signature: when withFileTypes is false or undefined, returns string[]
  async readdir(path: string, options?: { withFileTypes?: false; recursive?: boolean }): Promise<string[]>
  // Implementation signature: must be compatible with all overload signatures
  async readdir(path: string, options?: IReaddirOptions): Promise<string[] | IDirectoryEntry[]> {
    // TypeScript needs type assertion to match overload signatures
    if (options?.withFileTypes === true) {
      return await this.externalFS.readdir(path, options as { withFileTypes: true; recursive?: boolean })
    }
    return await this.externalFS.readdir(path, options as { withFileTypes?: false; recursive?: boolean } | undefined)
  }

  /**
   * Create directory
   * 
   * @example
   * // Create single directory
   * await eidos.currentSpace.fs.mkdir("@/work/projects")
   * 
   * @example
   * // Create nested directories
   * await eidos.currentSpace.fs.mkdir("@/work/2024/Q1", { recursive: true })
   */
  async mkdir(path: string, options?: IMkdirOptions): Promise<string | undefined> {
    return await this.externalFS.mkdir(path, options)
  }
}

