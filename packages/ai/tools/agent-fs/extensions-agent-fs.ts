import type { IFileSystem, FsStat, FileContent } from "@eidos.space/just-bash"
import type { DataSpace } from "@/packages/core/data-space"
import type { IExtension } from "@/packages/core/types/IExtension"
import { getUuid } from "@/lib/utils"

const DEFAULT_FILE_MODE = 0o644
const DEFAULT_DIR_MODE = 0o755

interface DirentEntry {
  name: string
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

function notFound(path: string): never {
  const err = new Error(`ENOENT: no such file or directory, '${path}'`) as any
  err.code = "ENOENT"
  throw err
}

function permDenied(path: string): never {
  const err = new Error(`EPERM: operation not permitted, '${path}'`) as any
  err.code = "EPERM"
  throw err
}

/**
 * An IFileSystem backed by eidos__extensions.
 * Maps extension slugs to a hierarchical file structure.
 * Read-only: extensions can be browsed but not modified via the agent.
 *
 * File extension: .ts for script type, .tsx for block type.
 * Hierarchical slugs like "ejected/journals/index" become nested directories.
 */
export class ExtensionsAgentFs implements IFileSystem {
  private ds: DataSpace
  private loaded = false
  /** slug → extension data (including ts_code) */
  private extensions = new Map<string, IExtension>()
  /** Virtual directory tree: path → Set of child names */
  private dirTree = new Map<string, Set<string>>()
  /** Normalized file path → extension slug */
  private pathToSlug = new Map<string, string>()

  constructor(ds: DataSpace) {
    this.ds = ds
  }

  /** Load all extensions into memory and build directory tree */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return

    const rows = (await this.ds.db.selectObjects(
      `SELECT id, slug, name, description, type, ts_code, meta, enabled FROM eidos__extensions ORDER BY slug`
    )) as IExtension[]

    this.dirTree.clear()
    this.pathToSlug.clear()
    this.extensions.clear()

    // Ensure root directory exists
    this.dirTree.set("/", new Set())

    for (const ext of rows) {
      if (!ext.slug) continue

      this.extensions.set(ext.slug, ext)

      const fileExt = ext.type === "script" ? "ts" : "tsx"
      const filePath = `/${ext.slug}.${fileExt}`
      this.pathToSlug.set(this.normalize(filePath), ext.slug)

      // Build directory entries for each path segment
      const parts = ext.slug.split("/")
      let currentPath = "/"

      for (let i = 0; i < parts.length; i++) {
        let children = this.dirTree.get(currentPath)
        if (!children) {
          children = new Set()
          this.dirTree.set(currentPath, children)
        }

        if (i === parts.length - 1) {
          // Last segment: add file entry
          children.add(`${parts[i]}.${fileExt}`)
        } else {
          // Intermediate segment: add directory entry
          children.add(parts[i])
          currentPath =
            currentPath === "/" ? `/${parts[i]}` : `${currentPath}/${parts[i]}`
        }
      }
    }

    this.loaded = true
  }

  async healthCheck(): Promise<void> {
    await this.ds.db.selectObjects(`SELECT id FROM eidos__extensions LIMIT 1`)
  }

  private normalize(path: string): string {
    if (!path.startsWith("/")) path = "/" + path
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
    return path
  }

  /** Check if a normalized path is a directory in the virtual tree */
  private isDirectory(normalizedPath: string): boolean {
    return this.dirTree.has(normalizedPath)
  }

  /** Check if a normalized path is a file (extension) */
  private isFile(normalizedPath: string): boolean {
    return this.pathToSlug.has(normalizedPath)
  }

  /** Get children of a directory path */
  private getChildren(normalizedPath: string): string[] {
    const children = this.dirTree.get(normalizedPath)
    return children ? [...children].sort() : []
  }

  /** Resolve a file path to its extension slug */
  private resolveSlug(normalizedPath: string): string | undefined {
    return this.pathToSlug.get(normalizedPath)
  }

  // ── IFileSystem implementation (read-only) ─────────────────────────

  async readdir(path: string): Promise<string[]> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    if (!this.isDirectory(normalized)) {
      if (this.isFile(normalized)) {
        const err = new Error(`ENOTDIR: not a directory, '${path}'`) as any
        err.code = "ENOTDIR"
        throw err
      }
      notFound(path)
    }

    return this.getChildren(normalized)
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    if (!this.isDirectory(normalized)) {
      if (this.isFile(normalized)) {
        const err = new Error(`ENOTDIR: not a directory, '${path}'`) as any
        err.code = "ENOTDIR"
        throw err
      }
      notFound(path)
    }

    const children = this.getChildren(normalized)
    return children.map((name) => {
      const childPath =
        normalized === "/" ? `/${name}` : `${normalized}/${name}`
      const isDir = this.isDirectory(childPath)
      return {
        name,
        isFile: !isDir,
        isDirectory: isDir,
        isSymbolicLink: false,
      }
    })
  }

  async readFile(path: string): Promise<string> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    if (normalized === "/") {
      const err = new Error(
        `EISDIR: illegal operation on a directory, '${path}'`
      ) as any
      err.code = "EISDIR"
      throw err
    }

    const slug = this.resolveSlug(normalized)
    if (!slug) notFound(path)

    const ext = this.extensions.get(slug!)
    if (!ext) notFound(path)

    // Return ts_code (source) if available, otherwise a summary
    if (ext!.ts_code) {
      return ext!.ts_code
    }

    // Fallback: return metadata summary
    return JSON.stringify(
      {
        id: ext!.id,
        slug: ext!.slug,
        name: ext!.name,
        description: ext!.description,
        type: ext!.type,
        enabled: ext!.enabled,
      },
      null,
      2
    )
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const content = await this.readFile(path)
    return new TextEncoder().encode(content)
  }

  async stat(path: string): Promise<FsStat> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    if (normalized === "/") {
      return {
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        mode: DEFAULT_DIR_MODE,
        size: 0,
        mtime: new Date(),
      }
    }

    if (this.isDirectory(normalized)) {
      return {
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        mode: DEFAULT_DIR_MODE,
        size: 0,
        mtime: new Date(),
      }
    }

    if (this.isFile(normalized)) {
      const slug = this.resolveSlug(normalized)!
      const ext = this.extensions.get(slug)
      return {
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
        mode: DEFAULT_FILE_MODE,
        size: (ext?.ts_code || "").length,
        mtime: ext?.updated_at ? new Date(ext.updated_at) : new Date(),
      }
    }

    notFound(path)
  }

  async lstat(path: string): Promise<FsStat> {
    return this.stat(path)
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    if (normalized === "/") return true
    return this.isDirectory(normalized) || this.isFile(normalized)
  }

  async realpath(path: string): Promise<string> {
    return this.normalize(path)
  }

  resolvePath(_base: string, path: string): string {
    if (path.startsWith("/")) return path
    return _base === "/" ? `/${path}` : `${_base}/${path}`
  }

  getAllPaths(): string[] {
    return []
  }

  // ── Write operations ───────────────────────────────────────────────

  private decodeContent(
    content: FileContent,
    options?: { encoding?: string } | string
  ): string {
    if (typeof content === "string") return content
    const encoding =
      typeof options === "string" ? options : (options?.encoding ?? "utf-8")
    return new TextDecoder(encoding).decode(content)
  }

  private extractSlugAndType(normalizedPath: string): {
    slug: string
    type: "script" | "block"
  } | null {
    const match = normalizedPath.match(/^\/(.+)\.(ts|tsx)$/)
    if (!match) return null
    return {
      slug: match[1],
      type: match[2] === "ts" ? "script" : "block",
    }
  }

  async writeFile(
    path: string,
    content: FileContent,
    options?: { encoding?: string } | string
  ): Promise<void> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    const info = this.extractSlugAndType(normalized)
    if (!info) {
      const err = new Error(
        `EINVAL: invalid extension filename, '${path}' (expected .ts or .tsx)`
      ) as any
      err.code = "EINVAL"
      throw err
    }

    const { slug, type } = info
    const tsCode = this.decodeContent(content, options)

    // Try to find existing extension by slug
    const existing = await this.ds.extension.getExtensionBySlug(slug)

    // Compile extension if compiler is available to get meta/compiled code
    let compileRes: any = null
    if (this.ds.context.compileExtension) {
      try {
        compileRes = await this.ds.context.compileExtension(tsCode, normalized)
      } catch (e) {
        console.warn("[ExtensionsAgentFs] compilation failed:", e)
      }
    }

    if (existing) {
      const updateData: Partial<IExtension> = {
        ts_code: tsCode,
      }
      if (compileRes) {
        updateData.code = compileRes.compiledCode
        updateData.meta = compileRes.meta
        updateData.type = compileRes.type
        updateData.name = compileRes.name || existing.name
        updateData.description = compileRes.description || existing.description
      }
      await this.ds.extension.set(existing.id, updateData)
    } else {
      const newData: Partial<IExtension> = {
        id: getUuid(),
        slug,
        ts_code: tsCode,
        type,
        enabled: true,
        name: slug,
        version: "0.0.1",
      }
      if (compileRes) {
        newData.code = compileRes.compiledCode
        newData.meta = compileRes.meta
        newData.type = compileRes.type
        newData.name = compileRes.name || slug
        newData.description = compileRes.description
      }
      await this.ds.extension.add(newData)
    }

    // Force reload on next access
    this.loaded = false
    await this.ensureLoaded()
  }

  async appendFile(
    path: string,
    content: FileContent,
    options?: { encoding?: string } | string
  ): Promise<void> {
    const existing = await this.readFile(path)
    const extra = this.decodeContent(content, options)
    await this.writeFile(path, existing + extra, options)
  }

  async mkdir(path: string): Promise<void> {
    // Virtual directories are implicitly supported via hierarchical slugs.
    // We just ensure the path doesn't conflict with a file.
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    if (this.isFile(normalized)) {
      const err = new Error(`EEXIST: file already exists, '${path}'`) as any
      err.code = "EEXIST"
      throw err
    }
    // No-op otherwise, as directory existence is derived from slugs
  }

  async rm(path: string): Promise<void> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    const slug = this.resolveSlug(normalized)
    if (!slug) notFound(path)

    const ext = this.extensions.get(slug!)
    if (!ext) notFound(path)

    await this.ds.extension.del(ext.id)

    this.loaded = false
    await this.ensureLoaded()
  }

  async cp(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src)
    await this.writeFile(dest, content)
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.ensureLoaded()
    const normalizedSrc = this.normalize(src)
    const normalizedDest = this.normalize(dest)

    const srcSlug = this.resolveSlug(normalizedSrc)
    if (!srcSlug) notFound(src)

    const ext = this.extensions.get(srcSlug!)
    if (!ext) notFound(src)

    const destInfo = this.extractSlugAndType(normalizedDest)
    if (!destInfo) {
      const err = new Error(
        `EINVAL: invalid destination filename, '${dest}'`
      ) as any
      err.code = "EINVAL"
      throw err
    }

    await this.ds.extension.set(ext.id, {
      slug: destInfo.slug,
      type: destInfo.type,
    })

    this.loaded = false
    await this.ensureLoaded()
  }

  async chmod(path: string): Promise<void> {
    await this.stat(path) // check existence
  }

  async symlink(_target: string, linkPath: string): Promise<void> {
    permDenied(linkPath)
  }

  async link(_existingPath: string, newPath: string): Promise<void> {
    permDenied(newPath)
  }

  async readlink(path: string): Promise<string> {
    notFound(path)
  }

  async utimes(path: string): Promise<void> {
    await this.stat(path) // check existence
  }
}
