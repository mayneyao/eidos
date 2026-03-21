import { watch as fsWatch, type Dirent, type FSWatcher } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type {
  IDirectoryEntry,
  IExternalFileSystem,
  IMkdirOptions,
  IReadFileOptions,
  IReaddirOptions,
  IStats,
  IWatchEvent,
  IWatchOptions,
  IWriteFileOptions,
} from "@eidos.space/core/types/IExternalFileSystem"

/**
 * Helper to get the path to the ripgrep binary
 * Handles both development and production (ASAR) environments
 */
import { searchWithRg } from "./search"

/**
 * Node.js implementation for desktop environment
 * Uses node:fs/promises
 *
 * Supports:
 * - ~ or ~/ (project folder) - ~ is normalized to ~/
 * - @/mountName (mounted folders)
 *   Note: @/ must be followed by a mount name, cannot be used alone
 */
export class NodeExternalFileSystem implements IExternalFileSystem {
  /**
   * @param resolvePath Function to resolve ~/ and @/mountName paths to absolute file system paths
   *
   * @example
   * new NodeExternalFileSystem(async (fsPath) => {
   *   if (fsPath.startsWith('~/')) {
   *     // Project folder: ~/ -> project root (or ~ normalized to ~/)
   *     return path.join(projectRoot, fsPath.substring(2))
   *   } else if (fsPath.startsWith('@/')) {
   *     // Mounted folder: @/music/song.mp3 (must have mount name after @/)
   *     const [, mountName, ...rest] = fsPath.split('/')
   *     const mountPath = await getMountPath(mountName)
   *     return path.join(mountPath, ...rest)
   *   }
   *   return null
   * })
   * })
   */
  constructor(
    private resolvePath: (path: string) => Promise<string | null>,
    private getMounts: () => Promise<Array<{ name: string; path: string }>>
  ) {}

  /**
   * Normalize virtual path to ensure consistent format
   * - '~' is normalized to '~/' (project folder, can be used alone)
   * - '@/mountName' is kept as-is (mounted folders, @/ must be followed by mount name)
   * - '@/' alone is invalid and will be rejected by resolvePath
   */
  private normalizeVirtualPath(fsPath: string): string {
    // Handle ~ path: '~' can be used alone and is normalized to '~/'
    if (fsPath === "~" || fsPath.startsWith("~/")) {
      return fsPath === "~" ? "~/" : fsPath
    }
    // Handle @ path: '@/mountName/...' format
    // Note: '@/' alone is invalid and will be rejected by resolvePath
    if (fsPath.startsWith("@/")) {
      return fsPath
    }
    // If it starts with ~ but not ~/, normalize it (e.g., '~file' -> '~/file')
    if (fsPath.startsWith("~") && fsPath.length > 1 && fsPath[1] !== "/") {
      return "~/" + fsPath.substring(1)
    }
    return fsPath
  }

  /**
   * Convert ~/ or @/ path to absolute file system path
   */
  private async getAbsolutePath(fsPath: string): Promise<string> {
    // Normalize the path first to ensure consistent handling
    const normalizedPath = this.normalizeVirtualPath(fsPath)
    const resolved = await this.resolvePath(normalizedPath)
    if (!resolved) {
      throw new Error(`Cannot resolve path: ${fsPath}`)
    }
    return resolved
  }

  /**
   * Convert Dirent to IDirectoryEntry
   * Converts absolute paths from Dirent to virtual paths (~/ or @/)
   */
  private direntToEntry(
    dirent: Dirent,
    fsPath: string,
    queryAbsolutePath: string,
    isRecursive: boolean = false
  ): IDirectoryEntry {
    let entryName: string
    let relativePath: string
    let relativeParentPath: string

    if (isRecursive) {
      // In recursive mode, dirent.name is already the relative path (e.g., "subdir/file.txt")
      // This is the full relative path from the queried directory
      entryName = dirent.name.replace(/\\/g, "/")
      relativePath = entryName

      // For parent path, get the directory part
      const lastSlashIndex = entryName.lastIndexOf("/")
      if (lastSlashIndex > 0) {
        relativeParentPath = entryName.substring(0, lastSlashIndex)
      } else {
        relativeParentPath = ""
      }
    } else {
      // Non-recursive mode: dirent.name is just the filename/directory name
      entryName = dirent.name

      // Calculate relative path from query directory to this entry
      const entryAbsolutePath = path.join(dirent.path, dirent.name)
      relativePath = path.relative(queryAbsolutePath, entryAbsolutePath)

      // Calculate relative parent path
      relativeParentPath = path.relative(queryAbsolutePath, dirent.parentPath)
    }

    // Normalize to forward slashes for virtual paths
    relativePath = relativePath.replace(/\\/g, "/")
    relativeParentPath = relativeParentPath.replace(/\\/g, "/")

    // Convert relative paths back to virtual paths (~/ or @/)
    const normalizeVirtualPath = (relPath: string): string => {
      if (!relPath || relPath === ".") {
        // Root level entries should have the query path as their parent
        // Ensure it ends with / for consistency
        return fsPath.endsWith("/") ? fsPath : fsPath + "/"
      }
      // Ensure fsPath ends with / for proper path joining
      const virtualPathBase = fsPath.endsWith("/") ? fsPath : fsPath + "/"
      return virtualPathBase + relPath
    }

    const virtualPath = normalizeVirtualPath(relativePath)
    const virtualParentPath = normalizeVirtualPath(relativeParentPath)

    // Only convert kind from Dirent methods to serializable string
    let kind: IDirectoryEntry["kind"]
    if (dirent.isFile()) {
      kind = "file"
    } else if (dirent.isDirectory()) {
      kind = "directory"
    } else if (dirent.isSymbolicLink()) {
      kind = "symbolicLink"
    } else if (dirent.isBlockDevice()) {
      kind = "blockDevice"
    } else if (dirent.isCharacterDevice()) {
      kind = "characterDevice"
    } else if (dirent.isFIFO()) {
      kind = "fifo"
    } else if (dirent.isSocket()) {
      kind = "socket"
    } else {
      kind = "file" // Fallback
    }

    return {
      name: entryName,
      path: virtualPath,
      parentPath: virtualParentPath,
      kind,
    }
  }

  /**
   * Read directory contents
   */
  async readdir(
    fsPath: string,
    options: { withFileTypes: true; recursive?: boolean }
  ): Promise<IDirectoryEntry[]>
  async readdir(
    fsPath: string,
    options?: { withFileTypes?: false; recursive?: boolean }
  ): Promise<string[]>
  async readdir(
    fsPath: string,
    options?: IReaddirOptions
  ): Promise<string[] | IDirectoryEntry[]> {
    // Normalize the path to ensure consistent format (e.g., '~' -> '~/')
    const normalizedFsPath = this.normalizeVirtualPath(fsPath)
    const absolutePath = await this.getAbsolutePath(fsPath)

    if (options?.withFileTypes) {
      const dirents = (await fs.readdir(absolutePath, {
        withFileTypes: true,
        recursive: options.recursive,
      })) as Dirent[]

      // Use normalized path for consistent virtual path generation
      return dirents.map((dirent) =>
        this.direntToEntry(
          dirent,
          normalizedFsPath,
          absolutePath,
          !!options.recursive
        )
      )
    }

    return await fs.readdir(absolutePath, { recursive: options?.recursive })
  }

  /**
   * Create directory
   */
  async mkdir(
    fsPath: string,
    options?: IMkdirOptions
  ): Promise<string | undefined> {
    const absolutePath = await this.getAbsolutePath(fsPath)
    return await fs.mkdir(absolutePath, { recursive: options?.recursive })
  }

  /**
   * Read file contents
   */
  async readFile(fsPath: string): Promise<Uint8Array>
  async readFile(
    fsPath: string,
    options: { encoding: BufferEncoding; flag?: string } | BufferEncoding
  ): Promise<string>
  async readFile(
    fsPath: string,
    options?: IReadFileOptions | BufferEncoding
  ): Promise<string | Uint8Array> {
    const absolutePath = await this.getAbsolutePath(fsPath)

    if (!options) {
      // Return Buffer as Uint8Array
      const buffer = await fs.readFile(absolutePath)
      return new Uint8Array(buffer)
    }

    // Handle string encoding or options object
    const encoding = typeof options === "string" ? options : options.encoding
    if (encoding) {
      const flag = typeof options === "object" ? options.flag : undefined
      return await fs.readFile(absolutePath, { encoding, flag })
    }

    // No encoding but has options (e.g., just flag)
    const buffer = await fs.readFile(
      absolutePath,
      typeof options === "object" ? { flag: options.flag } : undefined
    )
    return new Uint8Array(buffer)
  }

  /**
   * Write file contents
   */
  async writeFile(
    fsPath: string,
    data: string | Uint8Array,
    options?: IWriteFileOptions | BufferEncoding
  ): Promise<void> {
    const absolutePath = await this.getAbsolutePath(fsPath)

    // Convert Uint8Array to Buffer for Node.js
    const nodeData = data instanceof Uint8Array ? Buffer.from(data) : data

    if (!options) {
      await fs.writeFile(absolutePath, nodeData)
      return
    }

    if (typeof options === "string") {
      await fs.writeFile(absolutePath, nodeData, { encoding: options })
    } else {
      await fs.writeFile(absolutePath, nodeData, options)
    }
  }

  /**
   * Get file stats
   */
  async stat(fsPath: string): Promise<IStats> {
    const absolutePath = await this.getAbsolutePath(fsPath)
    const stats = await fs.stat(absolutePath)

    // Convert Stats object to serializable plain object
    return {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      atimeMs: stats.atimeMs,
      ctimeMs: stats.ctimeMs,
      birthtimeMs: stats.birthtimeMs,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      isBlockDevice: stats.isBlockDevice(),
      isCharacterDevice: stats.isCharacterDevice(),
      isFIFO: stats.isFIFO(),
      isSocket: stats.isSocket(),
      mode: stats.mode,
      uid: stats.uid,
      gid: stats.gid,
    }
  }

  /**
   * Rename file or directory
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldAbsolutePath = await this.getAbsolutePath(oldPath)
    const newAbsolutePath = await this.getAbsolutePath(newPath)
    await fs.rename(oldAbsolutePath, newAbsolutePath)
  }

  /**
   * Delete a file
   */
  async unlink(fsPath: string): Promise<void> {
    const absolutePath = await this.getAbsolutePath(fsPath)
    await fs.unlink(absolutePath)
  }

  /**
   * Delete a directory
   */
  async rmdir(fsPath: string): Promise<void> {
    const absolutePath = await this.getAbsolutePath(fsPath)
    await fs.rm(absolutePath, { recursive: true, force: true })
  }

  /**
   * Watch for changes on a file or directory
   * Returns an AsyncIterable that yields watch events
   */
  async *watch(
    fsPath: string,
    options?: IWatchOptions
  ): AsyncIterable<IWatchEvent> {
    const absolutePath = await this.getAbsolutePath(fsPath)

    // Create a watcher using Node.js fs.watch
    const watcher = fsWatch(absolutePath, {
      encoding: options?.encoding || "utf8",
      persistent: options?.persistent !== false, // default true
      recursive: options?.recursive || false,
    })

    // Handle abort signal
    let abortListener: (() => void) | undefined
    if (options?.signal) {
      abortListener = () => {
        watcher.close()
      }
      options.signal.addEventListener("abort", abortListener)
    }

    try {
      // Convert Node.js watcher events to our AsyncIterable format
      for await (const event of this.createWatchAsyncIterator(
        watcher,
        fsPath
      )) {
        if (options?.signal?.aborted) {
          break
        }
        yield event
      }
    } finally {
      // Clean up
      if (abortListener && options?.signal) {
        options.signal.removeEventListener("abort", abortListener)
      }
      watcher.close()
    }
  }

  /**
   * Create an AsyncIterator from Node.js fs.FSWatcher
   */
  private async *createWatchAsyncIterator(
    watcher: FSWatcher,
    watchedPath: string
  ): AsyncIterable<IWatchEvent> {
    const eventQueue: IWatchEvent[] = []
    let resolveNext: ((value: IWatchEvent) => void) | undefined
    let rejectNext: ((error: Error) => void) | undefined
    let isDone = false

    // Set up event handlers
    const onChange = (
      eventType: "rename" | "change",
      filename: string | null
    ) => {
      // Convert filename to relative path based on watched path
      let relativeFilename = filename
      if (filename) {
        // Convert absolute path back to virtual path
        const watchedVirtualPath = this.normalizeVirtualPath(watchedPath)
        if (
          watchedVirtualPath.startsWith("~/") ||
          watchedVirtualPath.startsWith("@/")
        ) {
          // For virtual paths, we need to maintain the relative structure
          // Just use the filename as-is since it should already be relative
          relativeFilename = filename
        }
      }

      const event: IWatchEvent = {
        eventType,
        filename: relativeFilename || "",
      }

      if (resolveNext) {
        resolveNext(event)
        resolveNext = undefined
      } else {
        eventQueue.push(event)
      }
    }

    const onError = (error: Error) => {
      if (rejectNext) {
        rejectNext(error)
        rejectNext = undefined
      } else {
        // If no one is waiting, just log the error for now
        console.error("Watch error:", error)
      }
    }

    const onClose = () => {
      isDone = true
      if (rejectNext) {
        // Don't reject on close, just resolve with a signal to stop iteration
        resolveNext?.({ eventType: "change", filename: "" } as IWatchEvent)
        rejectNext = undefined
        resolveNext = undefined
      }
    }

    // Attach event listeners
    watcher.on("change", onChange)
    watcher.on("error", onError)
    watcher.on("close", onClose)

    try {
      while (!isDone) {
        // If we have queued events, yield them
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!
        } else {
          // Otherwise, wait for the next event
          const event = await new Promise<IWatchEvent>((resolve, reject) => {
            resolveNext = resolve
            rejectNext = reject
          })

          // Check if this was a close signal (empty event)
          if (event.filename === "" && isDone) {
            break
          }

          yield event
        }
      }
    } finally {
      // Clean up event listeners
      watcher.off("change", onChange)
      watcher.off("error", onError)
      watcher.off("close", onClose)
    }
  }

  /**
   * Search for files using ripgrep
   * @param query Search query
   * @param searchPaths Optional array of virtual paths to search within
   */
  async search(query: string, searchPaths?: string[]): Promise<string[]> {
    // Parse query into keywords for filtering results
    const keywords = query.split(/\s+/).filter((k) => k.length > 0)
    if (keywords.length === 0) {
      return []
    }

    // Get mounts for path resolution
    const mounts = await this.getMounts()
    const projectRoot = await this.resolvePath("~/")
    const spaceFilePath = await this.resolvePath("~/.eidos")

    if (!projectRoot || !spaceFilePath) {
      return []
    }

    // Filter mounts to only include paths that exist on this platform
    const validMounts: typeof mounts = []
    for (const mount of mounts) {
      try {
        await fs.access(mount.path)
        validMounts.push(mount)
      } catch {
        console.warn(
          `[Search] Skipping unavailable mount path: ${mount.name} -> ${mount.path}`
        )
      }
    }

    let absoluteSearchPaths: string[]

    if (searchPaths && searchPaths.length > 0) {
      // Resolve provided virtual paths to absolute paths
      absoluteSearchPaths = []
      for (const virtualPath of searchPaths) {
        try {
          const absolutePath = await this.resolvePath(virtualPath)
          if (absolutePath) {
            // Check if path exists
            try {
              await fs.access(absolutePath)
              absoluteSearchPaths.push(absolutePath)
            } catch {
              console.warn(`[Search] Path does not exist: ${virtualPath}`)
            }
          }
        } catch (err) {
          console.warn(`[Search] Failed to resolve path: ${virtualPath}`, err)
        }
      }
    } else {
      // Default: search all paths (project root + space files + mounts)
      absoluteSearchPaths = [
        projectRoot,
        spaceFilePath,
        ...validMounts.map((m) => m.path),
      ]
    }

    if (absoluteSearchPaths.length === 0) {
      return []
    }

    try {
      // Perform search using the helper
      const lines = await searchWithRg(query, absoluteSearchPaths)

      // Parse results and map back to virtual paths
      const results: Set<string> = new Set()

      for (const absolutePath of lines) {
        let virtualPath: string | null = null

        // First check if it's in a mount (mounts take precedence over project root)
        let foundInMount = false
        for (const mount of validMounts) {
          if (absolutePath.startsWith(mount.path)) {
            // Normalize path separators to forward slashes (Windows compatibility)
            const relative = path
              .relative(mount.path, absolutePath)
              .replace(/\\/g, "/")
            virtualPath = relative
              ? `@/${mount.name}/${relative}`
              : `@/${mount.name}`
            foundInMount = true
            break
          }
        }

        // If not in a mount, check if it's in project root
        if (!foundInMount && absolutePath.startsWith(projectRoot)) {
          // Normalize path separators to forward slashes (Windows compatibility)
          const relative = path
            .relative(projectRoot, absolutePath)
            .replace(/\\/g, "/")
          virtualPath = `~/${relative}`
        }

        if (virtualPath) {
          // Filter against ALL keywords (case-insensitive)
          // We check against the virtual path so it matches what user sees
          const lowerPath = virtualPath.toLowerCase()
          const allMatch = keywords.every((k) =>
            lowerPath.includes(k.toLowerCase())
          )

          if (allMatch) {
            results.add(virtualPath)
          }
        }
      }

      return Array.from(results)
    } catch (error: any) {
      console.error("Search failed:", error)
      return []
    }
  }
}
