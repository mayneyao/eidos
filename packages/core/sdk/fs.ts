import type { BaseDataSpace } from "../data-space/base"
import type {
  IReaddirOptions,
  IMkdirOptions,
  IDirectoryEntry,
  IReadFileOptions,
  IWriteFileOptions,
  IStats,
  IWatchEvent,
  IWatchOptions,
} from "../types/IExternalFileSystem"
import { VirtualFsAdapter } from "../sqlite/virtual-fs-adapter"
import type { IExternalFileSystem } from "../types/IExternalFileSystem"

/**
 * File system SDK for external files
 * Environment-agnostic wrapper around IExternalFileSystem
 *
 * API follows Node.js fs/promises for familiarity
 */
export class FSManager {
  private _virtualAdapter?: IExternalFileSystem

  constructor(public dataSpace: BaseDataSpace) {}

  private get externalFS(): IExternalFileSystem {
    if (!this.dataSpace.externalFS) {
      throw new Error("External file system not configured")
    }

    // Lazily create virtual adapter that wraps the external FS
    if (!this._virtualAdapter) {
      this._virtualAdapter = new VirtualFsAdapter(
        this.dataSpace.externalFS,
        this.dataSpace.db
      )
    }

    return this._virtualAdapter!
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
  async readdir(
    path: string,
    options: { withFileTypes: true; recursive?: boolean }
  ): Promise<IDirectoryEntry[]>
  // Overload signature: when withFileTypes is false or undefined, returns string[]
  async readdir(
    path: string,
    options?: { withFileTypes?: false; recursive?: boolean }
  ): Promise<string[]>
  // Implementation signature: must be compatible with all overload signatures
  async readdir(
    path: string,
    options?: IReaddirOptions
  ): Promise<string[] | IDirectoryEntry[]> {
    // TypeScript needs type assertion to match overload signatures
    if (options?.withFileTypes === true) {
      return await this.externalFS.readdir(
        path,
        options as { withFileTypes: true; recursive?: boolean }
      )
    }
    return await this.externalFS.readdir(
      path,
      options as { withFileTypes?: false; recursive?: boolean } | undefined
    )
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
  async mkdir(
    path: string,
    options?: IMkdirOptions
  ): Promise<string | undefined> {
    return await this.externalFS.mkdir(path, options)
  }

  /**
   * Read file contents
   *
   * @example
   * // Read binary file
   * const data = await eidos.currentSpace.fs.readFile("~/image.png")
   * console.log(data) // Uint8Array
   *
   * @example
   * // Read text file with encoding
   * const text = await eidos.currentSpace.fs.readFile("~/readme.md", "utf8")
   * console.log(text) // string
   *
   * @example
   * // Read with options
   * const content = await eidos.currentSpace.fs.readFile("~/data.json", { encoding: "utf8" })
   */
  // Overload signature: no options returns Uint8Array
  async readFile(path: string): Promise<Uint8Array>
  // Overload signature: with encoding returns string
  async readFile(
    path: string,
    options: { encoding: BufferEncoding; flag?: string } | BufferEncoding
  ): Promise<string>
  // Implementation signature: must be compatible with all overload signatures
  async readFile(
    path: string,
    options?: IReadFileOptions | BufferEncoding
  ): Promise<string | Uint8Array> {
    if (!options) {
      return await this.externalFS.readFile(path)
    }
    if (
      typeof options === "string" ||
      (typeof options === "object" && options.encoding)
    ) {
      return await this.externalFS.readFile(path, options as any)
    }
    return await this.externalFS.readFile(path, options)
  }

  /**
   * Write file contents
   *
   * @example
   * // Write text file
   * await eidos.currentSpace.fs.writeFile("~/hello.txt", "Hello, World!")
   *
   * @example
   * // Write binary file
   * const data = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
   * await eidos.currentSpace.fs.writeFile("~/data.bin", data)
   *
   * @example
   * // Write with encoding
   * await eidos.currentSpace.fs.writeFile("~/config.json", JSON.stringify(config), "utf8")
   */
  async writeFile(
    path: string,
    data: string | Uint8Array,
    options?: IWriteFileOptions | BufferEncoding
  ): Promise<void> {
    return await this.externalFS.writeFile(path, data, options)
  }

  /**
   * Get file statistics
   *
   * @example
   * // Get file stats
   * const stats = await eidos.currentSpace.fs.stat("~/readme.md")
   * console.log(stats.size) // file size in bytes
   * console.log(stats.isFile) // true
   * console.log(stats.isDirectory) // false
   * console.log(new Date(stats.mtimeMs)) // last modified time
   */
  async stat(path: string): Promise<IStats> {
    return await this.externalFS.stat(path)
  }

  /**
   * Check if file or directory exists
   *
   * @example
   * if (await eidos.currentSpace.fs.exists("~/config.json")) {
   *   console.log("Config exists")
   * }
   */
  async exists(path: string): Promise<boolean> {
    try {
      await this.externalFS.stat(path)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Rename file or directory
   *
   * @example
   * // Rename a file
   * await eidos.currentSpace.fs.rename("~/old-name.md", "~/new-name.md")
   *
   * @example
   * // Rename a node
   * await eidos.currentSpace.fs.rename(
   *   "~/.eidos/__NODES__/node-id",
   *   "~/.eidos/__NODES__/New Name"
   * )
   *
   * @example
   * // Rename an extension
   * await eidos.currentSpace.fs.rename(
   *   "~/.eidos/__EXTENSIONS__/ext-id",
   *   "~/.eidos/__EXTENSIONS__/new-slug.ts"
   * )
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    return await this.externalFS.rename(oldPath, newPath)
  }

  /**
   * Delete a file
   *
   * @example
   * await eidos.currentSpace.fs.unlink("~/file.txt")
   */
  async unlink(path: string): Promise<void> {
    return await this.externalFS.unlink(path)
  }

  /**
   * Delete a directory
   *
   * @example
   * await eidos.currentSpace.fs.rmdir("~/folder")
   */
  async rmdir(path: string): Promise<void> {
    return await this.externalFS.rmdir(path)
  }

  /**
   * Watch for changes on a file or directory
   *
   * @example
   * // Watch nodes for changes
   * for await (const event of eidos.currentSpace.fs.watch("~/.eidos/__NODES__/")) {
   *   console.log(`Node ${event.filename} ${event.eventType}`)
   * }
   *
   * @example
   * // Watch specific folder with recursive option
   * for await (const event of eidos.currentSpace.fs.watch(
   *   "~/.eidos/__NODES__/folder-id/",
   *   { recursive: true }
   * )) {
   *   console.log(`File ${event.filename} ${event.eventType}`)
   * }
   *
   * @example
   * // Watch with AbortSignal
   * const controller = new AbortController()
   * const { signal } = controller
   *
   * setTimeout(() => controller.abort(), 5000)
   *
   * for await (const event of eidos.currentSpace.fs.watch(
   *   "~/.eidos/__EXTENSIONS__/",
   *   { signal }
   * )) {
   *   console.log(`Extension ${event.filename} ${event.eventType}`)
   * }
   */
  async *watch(
    path: string,
    options?: IWatchOptions
  ): AsyncIterable<IWatchEvent> {
    yield* this.externalFS.watch(path, options)
  }

  /**
   * Search for files
   *
   * @example
   * const results = await eidos.currentSpace.fs.search("query")
   */
  async search(query: string, searchPaths?: string[]): Promise<string[]> {
    return await this.externalFS.search(query, searchPaths)
  }
}
