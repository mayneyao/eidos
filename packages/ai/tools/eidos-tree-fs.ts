import type { IFileSystem, FsStat } from "just-bash"
import type { DataSpace } from "@/packages/core/data-space"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"

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
 * A read-only IFileSystem backed by eidos__tree.
 * Loads all nodes into memory on first access for fast traversal.
 */
export class EidosTreeFs implements IFileSystem {
  private ds: DataSpace
  private loaded = false
  /** id → node */
  private idToNode = new Map<string, ITreeNode>()
  /** parentId (null = root) → children sorted by name */
  private parentToChildren = new Map<string | null, ITreeNode[]>()
  /** normalized path → node (or null for "not found") */
  private pathCache = new Map<string, ITreeNode | null>()

  constructor(ds: DataSpace) {
    this.ds = ds
  }

  /** Load all non-deleted nodes into memory in one query */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return

    const rows = (await this.ds.db.selectObjects(
      `SELECT * FROM eidos__tree WHERE is_deleted = 0 ORDER BY name`
    )) as ITreeNode[]

    for (const node of rows) {
      this.idToNode.set(node.id, node)
    }

    // Group children by parent_id
    for (const node of rows) {
      const pid = node.parent_id ?? null
      let list = this.parentToChildren.get(pid)
      if (!list) {
        list = []
        this.parentToChildren.set(pid, list)
      }
      list.push(node)
    }

    // Already sorted by SQL ORDER BY name, but ensure it
    for (const list of this.parentToChildren.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }

    this.loaded = true
  }

  /** Verify DB connection */
  async healthCheck(): Promise<void> {
    await this.ds.db.selectObjects(
      `SELECT id FROM eidos__tree WHERE parent_id IS NULL LIMIT 1`
    )
  }

  private getChildren(parentId: string | null): ITreeNode[] {
    return this.parentToChildren.get(parentId) ?? []
  }

  private resolveNodeSync(path: string): ITreeNode | null {
    const normalized = this.normalize(path)
    if (normalized === "/" || normalized === "") return null

    const cached = this.pathCache.get(normalized)
    if (cached !== undefined) return cached

    const segments = normalized.split("/").filter(Boolean)
    let parentId: string | null = null
    let node: ITreeNode | null = null

    for (const seg of segments) {
      const children = this.getChildren(parentId)
      node = children.find((c) => c.name === seg) || null
      if (!node) {
        this.pathCache.set(normalized, null)
        return null
      }
      parentId = node.id
    }

    this.pathCache.set(normalized, node)
    return node
  }

  private normalize(path: string): string {
    if (!path.startsWith("/")) path = "/" + path
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
    return path
  }

  private nodeToStat(node: ITreeNode): FsStat {
    const isDir = node.type === "folder"
    return {
      isFile: !isDir,
      isDirectory: isDir,
      isSymbolicLink: false,
      mode: isDir ? DEFAULT_DIR_MODE : DEFAULT_FILE_MODE,
      size: 0,
      mtime: new Date(node.updated_at || node.created_at || Date.now()),
    }
  }

  // ── IFileSystem implementation (read-only) ─────────────────────────

  async readdir(path: string): Promise<string[]> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    let parentId: string | null = null
    if (normalized !== "/") {
      const node = this.resolveNodeSync(normalized)
      if (!node) notFound(path)
      if (node.type !== "folder") {
        const err = new Error(`ENOTDIR: not a directory, '${path}'`) as any
        err.code = "ENOTDIR"
        throw err
      }
      parentId = node.id
    }

    return this.getChildren(parentId).map((c) => c.name)
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    let parentId: string | null = null
    if (normalized !== "/") {
      const node = this.resolveNodeSync(normalized)
      if (!node) notFound(path)
      if (node.type !== "folder") {
        const err = new Error(`ENOTDIR: not a directory, '${path}'`) as any
        err.code = "ENOTDIR"
        throw err
      }
      parentId = node.id
    }

    return this.getChildren(parentId).map((r) => ({
      name: r.name,
      isFile: r.type !== "folder",
      isDirectory: r.type === "folder",
      isSymbolicLink: false,
    }))
  }

  async readFile(path: string): Promise<string> {
    await this.ensureLoaded()
    const node = this.resolveNodeSync(path)
    if (!node) notFound(path)
    if (node.type === "folder") {
      const err = new Error(
        `EISDIR: illegal operation on a directory, '${path}'`
      ) as any
      err.code = "EISDIR"
      throw err
    }

    if (node.type === "doc") {
      const doc = await this.ds.doc.get(node.id)
      return doc?.markdown || ""
    }

    if (node.type === "table") {
      try {
        const info = await this.ds.schema.getTable(node.id)
        return JSON.stringify(
          {
            id: info.id,
            name: info.name,
            fields: info.fields.map((f: any) => ({
              name: f.name,
              columnName: f.columnName,
              type: f.type,
            })),
          },
          null,
          2
        )
      } catch {
        return JSON.stringify(
          { id: node.id, name: node.name, type: "table" },
          null,
          2
        )
      }
    }

    return JSON.stringify(
      { id: node.id, name: node.name, type: node.type, ref: node.ref },
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

    const node = this.resolveNodeSync(normalized)
    if (!node) notFound(path)
    return this.nodeToStat(node)
  }

  async lstat(path: string): Promise<FsStat> {
    return this.stat(path)
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    if (normalized === "/") return true
    return this.resolveNodeSync(normalized) !== null
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

  // ── Write operations — all rejected ────────────────────────────────

  async writeFile(path: string): Promise<void> {
    permDenied(path)
  }
  async appendFile(path: string): Promise<void> {
    permDenied(path)
  }
  async mkdir(path: string): Promise<void> {
    permDenied(path)
  }
  async rm(path: string): Promise<void> {
    permDenied(path)
  }
  async cp(_src: string, dest: string): Promise<void> {
    permDenied(dest)
  }
  async mv(_src: string, dest: string): Promise<void> {
    permDenied(dest)
  }
  async chmod(path: string): Promise<void> {
    permDenied(path)
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
    permDenied(path)
  }
}
