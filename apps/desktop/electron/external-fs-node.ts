import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Dirent } from 'node:fs'
import type { 
  IExternalFileSystem, 
  IReaddirOptions, 
  IMkdirOptions 
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
  ) {}

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
   * Read directory contents
   */
  async readdir(fsPath: string): Promise<string[]>
  async readdir(fsPath: string, options: { withFileTypes: true }): Promise<Dirent[]>
  async readdir(fsPath: string, options?: IReaddirOptions): Promise<string[] | Dirent[]> {
    const absolutePath = await this.getAbsolutePath(fsPath)
    
    if (options?.withFileTypes) {
      return await fs.readdir(absolutePath, { 
        withFileTypes: true,
        recursive: options.recursive 
      })
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

