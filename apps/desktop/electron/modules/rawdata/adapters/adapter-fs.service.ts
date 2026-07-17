import * as fsNode from "node:fs/promises"
import * as path from "node:path"

/**
 * File system wrapper for RawDataManager
 * Provides sandboxed file access within a base path
 */
export class AdapterFsService {
  private eidosFilePath: string

  constructor(eidosFilePath: string) {
    this.eidosFilePath = eidosFilePath
  }

  private resolvePath(inputPath: string): string {
    if (inputPath.startsWith("~/")) {
      return path.join(this.eidosFilePath, inputPath.slice(2))
    }
    return path.join(this.eidosFilePath, inputPath)
  }

  async readFile(inputPath: string): Promise<Uint8Array>
  async readFile(
    inputPath: string,
    options: { encoding: string }
  ): Promise<string>
  async readFile(
    inputPath: string,
    options?: { encoding: string }
  ): Promise<string | Uint8Array> {
    const fullPath = this.resolvePath(inputPath)
    if (options?.encoding === "utf8") {
      return fsNode.readFile(fullPath, "utf8")
    }
    return fsNode.readFile(fullPath)
  }

  async writeFile(
    inputPath: string,
    data: string | Uint8Array,
    encoding?: string
  ): Promise<void> {
    const fullPath = this.resolvePath(inputPath)
    await fsNode.mkdir(path.dirname(fullPath), { recursive: true })
    if (typeof data === "string") {
      await fsNode.writeFile(fullPath, data, encoding as BufferEncoding)
    } else {
      await fsNode.writeFile(fullPath, data)
    }
  }

  async readdir(
    inputPath: string,
    options?: { recursive?: boolean }
  ): Promise<string[]> {
    const fullPath = this.resolvePath(inputPath)

    async function walk(dir: string, baseDir: string): Promise<string[]> {
      const entries = await fsNode.readdir(dir, { withFileTypes: true })
      const files: string[] = []

      for (const entry of entries) {
        const relativePath = path.relative(baseDir, path.join(dir, entry.name))
        if (entry.isDirectory() && options?.recursive) {
          files.push(...(await walk(path.join(dir, entry.name), baseDir)))
        } else if (entry.isFile()) {
          files.push(relativePath)
        }
      }

      return files
    }

    return walk(fullPath, fullPath)
  }

  async exists(inputPath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(inputPath)
      await fsNode.access(fullPath)
      return true
    } catch {
      return false
    }
  }

  async mkdir(inputPath: string): Promise<void> {
    const fullPath = this.resolvePath(inputPath)
    await fsNode.mkdir(fullPath, { recursive: true })
  }
}
