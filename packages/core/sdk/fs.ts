import type { BaseDataSpace } from "../data-space/base"
import type { Dirent } from 'node:fs'
import type { IReaddirOptions, IMkdirOptions } from "../types/IExternalFileSystem"

/**
 * File system SDK for external files
 * Environment-agnostic wrapper around IExternalFileSystem
 * 
 * API follows Node.js fs/promises for familiarity
 */
export class FSManager {
  constructor(public dataSpace: BaseDataSpace) {}

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
   * // Get Dirent objects
   * const entries = await eidos.currentSpace.fs.readdir("~/", { withFileTypes: true })
   * entries.forEach(e => console.log(e.name, e.isDirectory()))
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
  async readdir(path: string): Promise<string[]>
  async readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>
  async readdir(path: string, options?: IReaddirOptions): Promise<string[] | Dirent[]> {
    return await this.externalFS.readdir(path, options)
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

