import type { IFileSystem, FsStat, FileContent } from "just-bash"
import type { DataSpace } from "@/packages/core/data-space"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { getRawTableNameById, uuidv7, extractIdFromShortId } from "@/lib/utils"

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
 * An IFileSystem backed by eidos__tree.
 * Loads all nodes into memory on first access for fast traversal.
 *
 * Tables appear as both a .table file (schema JSON, read-only) and a
 * same-named directory listing their child docs (.md, writable).
 * Creating a doc under a table directory also inserts a table row
 * with title = doc name. Deleting a doc removes the tree node and
 * eidos__docs content, but leaves the table row intact.
 *
 * mkdir creates folder nodes (supports recursive mode).
 */
export class EidosAgentFs implements IFileSystem {
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

  private getVirtualName(node: ITreeNode): string {
    if (node.type === "table") return `${node.name}.table`
    if (node.type === "doc") return `${node.name}.md`
    return node.name
  }

  private stripExtension(seg: string): { name: string; type?: string } {
    if (seg.endsWith(".table")) {
      return { name: seg.slice(0, -6), type: "table" }
    }
    if (seg.endsWith(".md")) {
      return { name: seg.slice(0, -3), type: "doc" }
    }
    return { name: seg }
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
      const { name, type } = this.stripExtension(seg)
      node =
        children.find((c) => {
          // If we explicitly used a virtual extension, it MUST match the type
          if (type && c.type !== type) return false
          // Match virtual name OR original name (for compatibility)
          return this.getVirtualName(c) === seg || c.name === seg
        }) || null
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

  private decodeContent(
    content: FileContent,
    options?: { encoding?: string } | string
  ): string {
    if (typeof content === "string") return content
    const encoding =
      typeof options === "string" ? options : (options?.encoding ?? "utf-8")
    return new TextDecoder(encoding).decode(content)
  }

  private async resolveWritableDoc(path: string): Promise<ITreeNode> {
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
    if (node.type !== "doc") {
      permDenied(path)
    }
    return node
  }

  private nodeToStat(node: ITreeNode, normalizedPath?: string): FsStat {
    const isTableDir =
      node.type === "table" &&
      !!normalizedPath &&
      !normalizedPath.endsWith(".table")
    const isDir = node.type === "folder" || isTableDir
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
      if (node.type !== "folder" && node.type !== "table") {
        const err = new Error(`ENOTDIR: not a directory, '${path}'`) as any
        err.code = "ENOTDIR"
        throw err
      }
      parentId = node.id
    }

    const result: string[] = []
    for (const c of this.getChildren(parentId)) {
      if (c.type === "table") {
        result.push(`${c.name}.table`)
        result.push(c.name)
      } else {
        result.push(this.getVirtualName(c))
      }
    }
    return result
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)

    let parentId: string | null = null
    if (normalized !== "/") {
      const node = this.resolveNodeSync(normalized)
      if (!node) notFound(path)
      if (node.type !== "folder" && node.type !== "table") {
        const err = new Error(`ENOTDIR: not a directory, '${path}'`) as any
        err.code = "ENOTDIR"
        throw err
      }
      parentId = node.id
    }

    const result: DirentEntry[] = []
    for (const r of this.getChildren(parentId)) {
      if (r.type === "table") {
        result.push({
          name: `${r.name}.table`,
          isFile: true,
          isDirectory: false,
          isSymbolicLink: false,
        })
        result.push({
          name: r.name,
          isFile: false,
          isDirectory: true,
          isSymbolicLink: false,
        })
      } else {
        result.push({
          name: this.getVirtualName(r),
          isFile: r.type !== "folder",
          isDirectory: r.type === "folder",
          isSymbolicLink: false,
        })
      }
    }
    return result
  }

  async readFile(path: string): Promise<string> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    const node = this.resolveNodeSync(normalized)
    if (!node) notFound(path)

    const isTableDir = node.type === "table" && !normalized.endsWith(".table")
    if (node.type === "folder" || isTableDir) {
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
    return this.nodeToStat(node, normalized)
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

  // ── Write operations ───────────────────────────────────────────────

  async writeFile(
    path: string,
    content: FileContent,
    options?: { encoding?: string } | string
  ): Promise<void> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    let node = this.resolveNodeSync(normalized)

    if (!node) {
      // Auto-create doc node: extract parent path and node name
      const segments = normalized.split("/").filter(Boolean)
      const rawName = segments.pop()!
      const { name } = this.stripExtension(rawName)
      const parentPath = segments.length > 0 ? "/" + segments.join("/") : "/"
      let parentId: string | null = null
      let parentType: string | null = null

      if (parentPath !== "/") {
        const parentNode = this.resolveNodeSync(parentPath)
        if (!parentNode) notFound(path)
        if (parentNode.type !== "folder" && parentNode.type !== "table") {
          const err = new Error(
            `ENOTDIR: not a directory, '${parentPath}'`
          ) as any
          err.code = "ENOTDIR"
          throw err
        }
        parentId = parentNode.id
        parentType = parentNode.type
      }

      // If parent is a table, check for an existing record with this title
      let id: string
      let isNewRecord = true
      if (parentType === "table" && parentId) {
        const [existing] = await this.ds
          .table(parentId)
          .findMany({ where: { title: name }, take: 1 })
        if (existing) {
          id = existing._id.replace(/-/g, "")
          isNewRecord = false
        } else {
          id = uuidv7().replace(/-/g, "")
        }
      } else {
        id = uuidv7().replace(/-/g, "")
      }

      node = await this.ds.tree.add({
        id,
        name,
        type: "doc",
        parent_id: parentId || undefined,
        hide_properties: true,
      } as any)

      // Update in-memory caches
      this.idToNode.set(node.id, node)
      const pid = node.parent_id ?? null
      let list = this.parentToChildren.get(pid)
      if (!list) {
        list = []
        this.parentToChildren.set(pid, list)
      }
      list.push(node)
      list.sort((a, b) => a.name.localeCompare(b.name))
      this.pathCache.clear()

      // Only create a new table row if no existing record with this title
      if (isNewRecord && parentType === "table" && parentId) {
        const tableRawName = getRawTableNameById(parentId)
        await this.ds.syncExec2(
          `INSERT OR IGNORE INTO ${tableRawName} (_id, title) VALUES (?, ?)`,
          [extractIdFromShortId(id), name]
        )
      }
    } else {
      if (node.type === "folder") {
        const err = new Error(
          `EISDIR: illegal operation on a directory, '${path}'`
        ) as any
        err.code = "EISDIR"
        throw err
      }
      if (node.type !== "doc") {
        permDenied(path)
      }
    }

    const markdown = this.decodeContent(content, options)
    try {
      await this.ds.doc.createOrUpdateWithMarkdown(node.id, markdown)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const eio = new Error(
        `EIO: i/o error writing '${path}': ${message}`
      ) as any
      eio.code = "EIO"
      throw eio
    }
  }

  async appendFile(
    path: string,
    content: FileContent,
    options?: { encoding?: string } | string
  ): Promise<void> {
    const node = await this.resolveWritableDoc(path)
    const markdown = this.decodeContent(content, options)
    try {
      await this.ds.doc.createOrUpdate({
        id: node.id,
        text: markdown,
        type: "markdown",
        mode: "append",
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const eio = new Error(
        `EIO: i/o error appending '${path}': ${message}`
      ) as any
      eio.code = "EIO"
      throw eio
    }
  }
  async mkdir(
    path: string,
    options?: { recursive?: boolean } | boolean
  ): Promise<void> {
    const recursive =
      typeof options === "boolean" ? options : (options?.recursive ?? false)
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    const segments = normalized.split("/").filter(Boolean)

    if (segments.length === 0) return // root always exists

    let parentId: string | null = null

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const children = this.getChildren(parentId)
      const existing = children.find((c) => c.name === seg)

      if (existing) {
        if (i === segments.length - 1) {
          // Target already exists
          if (existing.type === "folder" || existing.type === "table") return
          const err = new Error(`ENOTDIR: not a directory, '${path}'`) as any
          err.code = "ENOTDIR"
          throw err
        }
        if (existing.type !== "folder" && existing.type !== "table") {
          if (!recursive) {
            const err = new Error(
              `ENOTDIR: not a directory, '${normalized}'`
            ) as any
            err.code = "ENOTDIR"
            throw err
          }
          permDenied(path)
        }
        parentId = existing.id
      } else {
        // Segment doesn't exist
        if (!recursive && i < segments.length - 1) {
          notFound(path)
        }
        // Create folder node
        const id = uuidv7().replace(/-/g, "")
        const node = await this.ds.tree.add({
          id,
          name: seg,
          type: "folder",
          parent_id: parentId || undefined,
        } as any)

        // Update in-memory caches
        this.idToNode.set(node.id, node)
        const pid = node.parent_id ?? null
        let list = this.parentToChildren.get(pid)
        if (!list) {
          list = []
          this.parentToChildren.set(pid, list)
        }
        list.push(node)
        list.sort((a, b) => a.name.localeCompare(b.name))
        this.pathCache.clear()

        parentId = node.id
      }
    }
  }
  async rm(path: string): Promise<void> {
    await this.ensureLoaded()
    const normalized = this.normalize(path)
    const node = this.resolveNodeSync(normalized)
    if (!node) notFound(path)

    if (node.type === "doc") {
      // Soft-delete the tree node (does not affect table row)
      await this.ds.tree.deleteNode(node.id)
      // Delete doc content from eidos__docs
      await this.ds.doc.del(node.id)

      // Update in-memory caches
      this.idToNode.delete(node.id)
      const pid = node.parent_id ?? null
      const siblings = this.parentToChildren.get(pid)
      if (siblings) {
        const idx = siblings.findIndex((c) => c.id === node.id)
        if (idx !== -1) siblings.splice(idx, 1)
      }
      this.pathCache.clear()
      return
    }

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
