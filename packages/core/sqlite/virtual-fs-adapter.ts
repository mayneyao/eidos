import type { IDirectoryEntry, IExternalFileSystem } from "../types/IExternalFileSystem"
import type { ITreeNode } from "../types/ITreeNode"
import type { IExtension } from "../types/IExtension"
import type { BaseServerDatabase } from "./interface"

/**
 * Virtual File System Adapter
 * Wraps an IExternalFileSystem to add support for virtual paths that map to database tables
 * 
 * Virtual paths:
 * - ~/.eidos/__NODES__/ → eidos__tree table
 * - ~/.eidos/__EXTENSIONS__/ → eidos__extensions table
 */
export class VirtualFsAdapter implements IExternalFileSystem {
  constructor(
    private underlyingFS: IExternalFileSystem,
    private db: BaseServerDatabase
  ) {}

  /**
   * Check if a path is a virtual path
   */
  isVirtualPath(path: string): boolean {
    return path.startsWith("~/.eidos/__NODES__") || path.startsWith("~/.eidos/__EXTENSIONS__")
  }

  /**
   * Parse a virtual path to extract the type and subpath
   * Returns null if not a virtual path
   */
  parseVirtualPath(path: string): { type: "nodes" | "extensions"; subPath: string } | null {
    const nodesMatch = path.match(/^~\/\.eidos\/__NODES__(\/.*)?$/)
    if (nodesMatch) {
      return {
        type: "nodes",
        subPath: nodesMatch[1] || "/",
      }
    }

    const extensionsMatch = path.match(/^~\/\.eidos\/__EXTENSIONS__(\/.*)?$/)
    if (extensionsMatch) {
      return {
        type: "extensions",
        subPath: extensionsMatch[1] || "/",
      }
    }

    return null
  }

  /**
   * Extract node ID from a subpath
   * E.g., "/abc-123" -> "abc-123"
   */
  private getNodeIdFromPath(subPath: string): string | null {
    if (subPath === "/" || !subPath) return null
    const parts = subPath.split("/").filter(Boolean)
    return parts[parts.length - 1] || null
  }

  /**
   * Read a virtual directory based on the virtual path
   */
  async readVirtualDir(path: string): Promise<IDirectoryEntry[]> {
    const parsed = this.parseVirtualPath(path)
    if (!parsed) return []

    switch (parsed.type) {
      case "nodes":
        return this.readNodesDir(parsed.subPath)
      case "extensions":
        return this.readExtensionsDir(parsed.subPath)
      default:
        return []
    }
  }

  /**
   * Read nodes from eidos__tree table
   */
  private async readNodesDir(subPath: string): Promise<IDirectoryEntry[]> {
    const parentId = this.getNodeIdFromPath(subPath)

    // Query the tree table
    let query: string
    let bind: any[] = []
    
    if (parentId) {
      query = `
        SELECT * FROM eidos__tree 
        WHERE parent_id = ?
          AND is_deleted = 0
        ORDER BY 
          CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END,
          name ASC
      `
      bind = [parentId]
    } else {
      query = `
        SELECT * FROM eidos__tree 
        WHERE parent_id IS NULL
          AND is_deleted = 0
        ORDER BY 
          CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END,
          name ASC
      `
    }

    const nodes = await this.db.selectObjects(query, bind) as ITreeNode[]

    // Transform to IDirectoryEntry
    return nodes.map((node) => this.nodeToEntry(node))
  }

  /**
   * Read extensions from eidos__extensions table
   */
  private async readExtensionsDir(subPath: string): Promise<IDirectoryEntry[]> {
    // Extensions are flat, only root path is supported
    if (subPath !== "/") {
      return []
    }

    const query = `SELECT * FROM eidos__extensions ORDER BY slug ASC`
    const extensions = await this.db.selectObjects(query) as IExtension[]

    // Transform to IDirectoryEntry
    return extensions.map((ext) => this.extensionToEntry(ext))
  }

  /**
   * Convert ITreeNode to IDirectoryEntry
   */
  private nodeToEntry(node: ITreeNode): IDirectoryEntry {
    return {
      name: node.name,
      path: `~/.eidos/__NODES__/${node.id}`,
      parentPath: node.parent_id ? `~/.eidos/__NODES__/${node.parent_id}` : "~/.eidos/__NODES__",
      kind: node.type === "folder" ? "directory" : "file",
      metadata: {
        nodeType: node.type as any,
        nodeId: node.id,
        isPinned: node.is_pinned || false,
        icon: node.icon,
      },
    }
  }

  /**
   * Convert IExtension to IDirectoryEntry
   */
  private extensionToEntry(ext: IExtension): IDirectoryEntry {
    return {
      name: `${ext.slug}.${ext.type === "script" ? "ts" : "tsx"}`,
      path: `~/.eidos/__EXTENSIONS__/${ext.id}`,
      parentPath: "~/.eidos/__EXTENSIONS__",
      kind: "file",
      metadata: {
        nodeType: "extension",
        nodeId: ext.id,
        isPinned: false,
        icon: ext.icon,
      },
    }
  }

  // Implement IExternalFileSystem interface - delegate to underlying FS or handle virtual paths

  async readdir(path: string, options: { withFileTypes: true; recursive?: boolean }): Promise<IDirectoryEntry[]>
  async readdir(path: string, options?: { withFileTypes?: false; recursive?: boolean }): Promise<string[]>
  async readdir(path: string, options?: any): Promise<string[] | IDirectoryEntry[]> {
    // Handle virtual paths
    if (this.isVirtualPath(path)) {
      const entries = await this.readVirtualDir(path)
      
      if (options?.withFileTypes) {
        return entries
      } else {
        return entries.map((entry) => entry.name)
      }
    }

    // Delegate to underlying filesystem
    return this.underlyingFS.readdir(path, options)
  }

  async mkdir(path: string, options?: any): Promise<string | undefined> {
    // Virtual paths don't support mkdir
    if (this.isVirtualPath(path)) {
      throw new Error("mkdir not supported for virtual paths")
    }
    return this.underlyingFS.mkdir(path, options)
  }

  async readFile(path: string): Promise<Uint8Array>
  async readFile(path: string, options: { encoding: BufferEncoding; flag?: string } | BufferEncoding): Promise<string>
  async readFile(path: string, options?: any): Promise<string | Uint8Array> {
    // Virtual paths don't support readFile
    if (this.isVirtualPath(path)) {
      throw new Error("readFile not supported for virtual paths")
    }
    return this.underlyingFS.readFile(path, options)
  }

  async writeFile(path: string, data: string | Uint8Array, options?: any): Promise<void> {
    // Virtual paths don't support writeFile
    if (this.isVirtualPath(path)) {
      throw new Error("writeFile not supported for virtual paths")
    }
    return this.underlyingFS.writeFile(path, data, options)
  }

  async stat(path: string): Promise<any> {
    // Virtual paths don't support stat
    if (this.isVirtualPath(path)) {
      throw new Error("stat not supported for virtual paths")
    }
    return this.underlyingFS.stat(path)
  }

  /**
   * Rename a file or directory
   * For virtual paths, this updates the database
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldParsed = this.parseVirtualPath(oldPath)
    const newParsed = this.parseVirtualPath(newPath)

    // Both paths must be virtual or both must be real
    if ((oldParsed === null) !== (newParsed === null)) {
      throw new Error("Cannot rename between virtual and real paths")
    }

    // Handle virtual path rename
    if (oldParsed && newParsed) {
      // Both must be the same type
      if (oldParsed.type !== newParsed.type) {
        throw new Error("Cannot rename between different virtual path types")
      }

      switch (oldParsed.type) {
        case "nodes":
          return this.renameNode(oldPath, newPath)
        case "extensions":
          return this.renameExtension(oldPath, newPath)
        default:
          throw new Error(`Rename not supported for virtual path type: ${oldParsed.type}`)
      }
    }

    // Delegate to underlying filesystem
    return this.underlyingFS.rename(oldPath, newPath)
  }

  /**
   * Rename a node in the eidos__tree table
   * Also supports moving a node to a different parent folder
   */
  private async renameNode(oldPath: string, newPath: string): Promise<void> {
    // Extract node ID from old path
    const nodeId = this.getNodeIdFromPath(oldPath.replace("~/.eidos/__NODES__", ""))
    if (!nodeId) {
      throw new Error("Cannot rename root nodes directory")
    }

    // Get current node data to compare
    const currentNode = await this.db.selectObjects(
      "SELECT * FROM eidos__tree WHERE id = ?",
      [nodeId]
    ) as ITreeNode[]
    
    if (currentNode.length === 0) {
      throw new Error(`Node not found: ${nodeId}`)
    }

    const node = currentNode[0]

    // Parse new path to extract parent ID and name
    // newPath formats:
    // - ~/.eidos/__NODES__/new-name (rename at root level)
    // - ~/.eidos/__NODES__/parent-id/node-id (move to folder, keep name/ID)
    // - ~/.eidos/__NODES__/parent-id/new-name (move and rename)
    const pathParts = newPath.replace("~/.eidos/__NODES__/", "").split("/").filter(Boolean)
    
    if (pathParts.length === 0) {
      throw new Error("Invalid new path: path cannot be empty")
    }

    let newParentId: string | undefined = undefined
    let newName: string | undefined = undefined

    if (pathParts.length === 1) {
      // Single part: could be new name at same level, or node ID (no change)
      const lastPart = pathParts[0]
      if (lastPart !== nodeId) {
        // It's a new name
        newName = lastPart
      }
      // Parent stays the same (implicitly)
    } else {
      // Multiple parts: parent-id/.../node-id-or-name
      const lastPart = pathParts[pathParts.length - 1]
      const parentPart = pathParts[pathParts.length - 2]
      
      // Check if parent changed
      if (parentPart !== node.parent_id) {
        newParentId = parentPart
      }
      
      // Check if name changed (lastPart is not the node ID)
      if (lastPart !== nodeId && lastPart !== node.name) {
        newName = lastPart
      }
    }

    // Build update query dynamically based on what changed
    const updates: string[] = []
    const binds: any[] = []

    if (newName !== undefined) {
      updates.push("name = ?")
      binds.push(newName)
    }

    if (newParentId !== undefined) {
      updates.push("parent_id = ?")
      binds.push(newParentId)
    }

    if (updates.length === 0) {
      // Nothing to update
      return
    }

    binds.push(nodeId)
    const query = `UPDATE eidos__tree SET ${updates.join(", ")} WHERE id = ?`
    await this.db.exec({ sql: query, bind: binds })
  }

  /**
   * Rename an extension in the eidos__extensions table
   */
  private async renameExtension(oldPath: string, newPath: string): Promise<void> {
    // Extract extension ID from old path
    const extensionId = this.getNodeIdFromPath(oldPath.replace("~/.eidos/__EXTENSIONS__", ""))
    if (!extensionId) {
      throw new Error("Invalid extension path")
    }

    // Extract new slug from new path
    // newPath format: ~/.eidos/__EXTENSIONS__/new-slug.ts or new-slug.tsx
    const fileName = newPath.replace("~/.eidos/__EXTENSIONS__/", "")
    const newSlug = fileName.replace(/\.(ts|tsx)$/, "")

    if (!newSlug) {
      throw new Error("Invalid new path: slug cannot be empty")
    }

    // Update the extension slug in database
    const query = `UPDATE eidos__extensions SET slug = ? WHERE id = ?`
    await this.db.exec({ sql: query, bind: [newSlug, extensionId] })
  }
}
