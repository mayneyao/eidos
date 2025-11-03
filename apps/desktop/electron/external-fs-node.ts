import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Dirent } from 'node:fs'
import type {
  IExternalFileSystem,
  IReaddirOptions,
  IMkdirOptions,
  IDirectoryEntry
} from '@eidos.space/core/types/IExternalFileSystem'

/**
 * Node.js implementation for desktop environment
 * Uses node:fs/promises
 * 
 * Supports:
 * - ~/ (project folder) - read-only
 * - @/ (mounted folders) - read/write based on permissions
 */
export class NodeExternalFileSystem implements IExternalFileSystem {
  /**
   * @param resolvePath Function to resolve ~/ and @/ paths to absolute file system paths
   * 
   * @example
   * new NodeExternalFileSystem(async (fsPath) => {
   *   if (fsPath.startsWith('~/')) {
   *     // Project folder: ~/ -> project root
   *     return path.join(projectRoot, fsPath.substring(2))
   *   } else if (fsPath.startsWith('@/')) {
   *     // Mounted folder: @/music/song.mp3
   *     const [, mountName, ...rest] = fsPath.split('/')
   *     const mountPath = await getMountPath(mountName)
   *     return path.join(mountPath, ...rest)
   *   }
   *   return null
   * })
   */
  constructor(
    private resolvePath: (path: string) => Promise<string | null>
  ) { }

  /**
   * Convert ~/ or @/ path to absolute file system path
   */
  private async getAbsolutePath(fsPath: string): Promise<string> {
    const resolved = await this.resolvePath(fsPath)
    if (!resolved) {
      throw new Error(`Cannot resolve path: ${fsPath}`)
    }
    return resolved
  }

  /**
   * Convert Dirent to IDirectoryEntry
   * Reuses Node.js Dirent properties (name, path, parentPath), only converts kind
   */
  private direntToEntry(dirent: Dirent): IDirectoryEntry {
    // Reuse Node.js Dirent properties directly (available in Node.js 20.1.0+)
    const name = dirent.name
    const path = dirent.path
    const parentPath = dirent.parentPath

    // Only convert kind from Dirent methods to serializable string
    // Optimize: check most common types first
    let kind: IDirectoryEntry['kind']
    if (dirent.isFile()) {
      kind = 'file'
    } else if (dirent.isDirectory()) {
      kind = 'directory'
    } else if (dirent.isSymbolicLink()) {
      kind = 'symbolicLink'
    } else if (dirent.isBlockDevice()) {
      kind = 'blockDevice'
    } else if (dirent.isCharacterDevice()) {
      kind = 'characterDevice'
    } else if (dirent.isFIFO()) {
      kind = 'fifo'
    } else if (dirent.isSocket()) {
      kind = 'socket'
    } else {
      kind = 'file' // Fallback
    }

    return {
      name,
      path,
      parentPath,
      kind
    }
  }

  /**
   * Read directory contents
   */
  async readdir(fsPath: string, options: { withFileTypes: true; recursive?: boolean }): Promise<IDirectoryEntry[]>
  async readdir(fsPath: string, options?: { withFileTypes?: false; recursive?: boolean }): Promise<string[]>
  async readdir(fsPath: string, options?: IReaddirOptions): Promise<string[] | IDirectoryEntry[]> {
    const absolutePath = await this.getAbsolutePath(fsPath)

    if (options?.withFileTypes) {
      const dirents = await fs.readdir(absolutePath, {
        withFileTypes: true,
        recursive: options.recursive
      }) as Dirent[]

      return dirents.map(dirent => this.direntToEntry(dirent))
    }

    return await fs.readdir(absolutePath, { recursive: options?.recursive })
  }

  /**
   * Create directory
   * 
   * Note: Project folder (~/) is read-only
   */
  async mkdir(fsPath: string, options?: IMkdirOptions): Promise<string | undefined> {
    // Project folder is read-only
    if (fsPath.startsWith('~/')) {
      throw new Error('Cannot create directories in project folder (~/). Project folder is read-only.')
    }

    const absolutePath = await this.getAbsolutePath(fsPath)
    return await fs.mkdir(absolutePath, { recursive: options?.recursive })
  }
}

