/**
 * Node SDK - Unified interface for node operations
 *
 * This module provides a clean, path-based API for managing nodes
 * while internally delegating to the existing TreeTable implementation.
 *
 * Design principles:
 * 1. Path-first: Human-readable paths are the primary interface
 * 2. Type-aware: Methods adapt behavior based on node type
 * 3. Consistent: Same patterns across all node operations
 * 4. Safe: Auto-rename on conflicts, soft-delete by default
 */

import { uuidv7 } from "@/lib/utils"

import type { DataSpace } from "../data-space"
import type { ITreeNode } from "../types/ITreeNode"

export interface NodeApiOptions {
  content?: string
  schema?: TableSchema
  query?: string
  hideProperties?: boolean
}

export interface TableSchema {
  columns: Array<{
    name: string
    type: string
    options?: any
  }>
}

export interface DeleteOptions {
  permanent?: boolean
  recursive?: boolean
}

export interface FindQuery {
  name?: string
  type?: string | string[]
  parent?: string
  isDeleted?: boolean
}

/**
 * Node SDK client - provides path-based node operations
 *
 * @example
 * ```typescript
 * // Get node by path
 * const node = await space.node.get("projects/roadmap")
 *
 * // Create a document
 * await space.node.create("notes/idea", "doc", {
 *   content: "# My Idea\n\nThis is brilliant!"
 * })
 *
 * // Move node
 * await space.node.move("drafts/article", "published/article")
 *
 * // Delete node
 * await space.node.delete("old-document")
 * ```
 */
export class NodeClient {
  constructor(private dataSpace: DataSpace) {}

  /**
   * Check if path-based operations are available
   * Requires node name uniqueness to be enabled
   */
  async isPathEnabled(): Promise<boolean> {
    return this.dataSpace.tree.hasUniqueIndex()
  }

  /**
   * Parse a path into parent path and name
   * Paths are relative to space root, no "/" prefix
   * @example "folder/doc" -> { parentPath: "folder", name: "doc" }
   * @example "doc" -> { parentPath: "", name: "doc" }
   */
  private parsePath(path: string): { parentPath: string; name: string } {
    // Remove leading "/" if present for consistency
    const normalized = path.startsWith("/") ? path.slice(1) : path
    const parts = normalized.split("/").filter(Boolean)
    const name = parts.pop() || ""
    const parentPath = parts.join("/")
    return { parentPath, name }
  }

  /**
   * Resolve a path to a node ID
   * Returns null if path doesn't exist or uniqueness is not enabled
   * Paths are relative to space root, no "/" prefix needed
   */
  async resolvePath(
    path: string
  ): Promise<{ id: string; node: ITreeNode } | null> {
    const hasUniqueIndex = await this.dataSpace.tree.hasUniqueIndex()
    if (!hasUniqueIndex) {
      return null
    }

    // Normalize path - remove leading "/" if present
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path
    const parts = normalizedPath.split("/").filter(Boolean)

    if (parts.length === 0) {
      return null // Root doesn't have an ID
    }

    let currentId: string | null = null
    for (const name of parts) {
      const nodes = await this.dataSpace.tree.list(
        { parent_id: currentId, name },
        { limit: 1 }
      )
      const match = nodes.find((n) => !n.is_deleted)
      if (!match) {
        return null
      }
      currentId = match.id
    }

    const node = await this.dataSpace.tree.get(currentId!)
    return node ? { id: currentId!, node } : null
  }

  /**
   * Get a node by its path
   * Requires name uniqueness to be enabled
   */
  async get(path: string): Promise<ITreeNode | null> {
    const resolved = await this.resolvePath(path)
    return resolved?.node || null
  }

  /**
   * Get a node by its ID
   * Works regardless of name uniqueness setting
   */
  async getById(id: string): Promise<ITreeNode | null> {
    return this.dataSpace.tree.getNode(id)
  }

  /**
   * List child nodes at a path
   * Use empty string "" for root
   */
  async list(path: string = ""): Promise<ITreeNode[]> {
    // Normalize path - treat "/" or "" as root
    const normalizedPath =
      path === "/" ? "" : path.startsWith("/") ? path.slice(1) : path

    if (normalizedPath === "") {
      return this.dataSpace.tree.list(
        { parent_id: null },
        { orderBy: "position", order: "DESC" }
      )
    }

    const resolved = await this.resolvePath(normalizedPath)
    if (!resolved) {
      throw new Error(`Path not found: ${path}`)
    }

    return this.dataSpace.tree.list(
      { parent_id: resolved.id },
      { orderBy: "position", order: "DESC" }
    )
  }

  /**
   * Create a new node at the specified path
   */
  async create(
    path: string,
    type: "doc" | "table" | "folder" | "dataview" | string,
    options: NodeApiOptions = {}
  ): Promise<ITreeNode> {
    const { parentPath, name } = this.parsePath(path)

    // Resolve parent ID
    let parentId: string | null = null
    if (parentPath !== "") {
      const parent = await this.resolvePath(parentPath)
      if (!parent) {
        throw new Error(`Parent path not found: ${parentPath}`)
      }
      parentId = parent.id
    }

    // Check if node already exists
    const exists = await this.exists(path)
    if (exists) {
      throw new Error(`Node already exists at path: ${path}`)
    }

    // Create the node
    // Use _skipAutoRename because we've already checked for existence above
    // This prevents tree.add from auto-renaming and lets the UNIQUE constraint catch duplicates
    const node = await this.dataSpace.tree.add({
      id: uuidv7().split("-").join(""),
      name,
      type: type as any,
      parent_id: parentId || undefined,
      hide_properties: options.hideProperties ? true : false,
      _skipAutoRename: true,
    } as any)

    // Handle type-specific creation
    switch (type) {
      case "doc":
        if (options.content) {
          await this.dataSpace.doc.createOrUpdateWithMarkdown(
            node.id,
            options.content
          )
        }
        break
      case "table":
        if (options.schema) {
          // Create table with schema
          const columns = options.schema.columns.map((c) => ({
            name: c.name,
            type: c.type as any,
          }))
          await this.dataSpace.createTableViaSchema(
            node.id,
            name,
            "", // Will generate SQL from columns
            parentId || undefined
          )
        }
        break
      case "dataview":
        if (options.query) {
          await this.dataSpace.dataView.createDataView(node.id, options.query)
        }
        break
    }

    return node
  }

  /**
   * Move or rename a node
   */
  async move(sourcePath: string, destPath: string): Promise<ITreeNode> {
    const source = await this.resolvePath(sourcePath)
    if (!source) {
      throw new Error(`Source path not found: ${sourcePath}`)
    }

    const { parentPath: destParentPath, name: destName } =
      this.parsePath(destPath)

    // Resolve destination parent
    let destParentId: string | null = null
    if (destParentPath !== "") {
      const destParent = await this.resolvePath(destParentPath)
      if (!destParent) {
        throw new Error(`Destination parent not found: ${destParentPath}`)
      }
      destParentId = destParent.id
    }

    // Check if we're just renaming (same parent)
    const currentNode = source.node
    const isSameParent = currentNode.parent_id === destParentId

    if (isSameParent && currentNode.name === destName) {
      return currentNode // Nothing to do
    }

    // Use nodeChangeParent for both move and rename
    await this.dataSpace.tree.nodeChangeParent(
      source.id,
      destParentId || undefined
    )

    // Update name if changed
    if (currentNode.name !== destName) {
      await this.dataSpace.tree.updateNodeName(source.id, destName)
    }

    return this.dataSpace.tree.get(source.id) as Promise<ITreeNode>
  }

  /**
   * Delete a node
   */
  async delete(path: string, options: DeleteOptions = {}): Promise<void> {
    const resolved = await this.resolvePath(path)
    if (!resolved) {
      throw new Error(`Path not found: ${path}`)
    }

    if (options.permanent) {
      if (options.recursive) {
        await this.dataSpace.tree.permanentlyDeleteNode(resolved.id)
      } else {
        await (this.dataSpace.tree as any).permanentlyDeleteNodeByType(
          resolved.node
        )
      }
    } else {
      // Soft delete
      await this.dataSpace.tree.deleteNode(resolved.id)
    }
  }

  /**
   * Check if a node exists at the given path
   */
  async exists(path: string): Promise<boolean> {
    const resolved = await this.resolvePath(path)
    return resolved !== null
  }

  /**
   * Duplicate a node
   */
  async duplicate(path: string, newPath?: string): Promise<ITreeNode> {
    const source = await this.resolvePath(path)
    if (!source) {
      throw new Error(`Source path not found: ${path}`)
    }

    // Duplicate the node (TreeTable handles naming)
    const duplicate = await this.dataSpace.tree.duplicateNode(source.id)
    if (!duplicate) {
      throw new Error(`Failed to duplicate node: ${path}`)
    }

    // If newPath specified, move the duplicate
    if (newPath) {
      const tempId = duplicate.id
      await this.move(`${path} Copy`, newPath)
      // Re-fetch to get updated node
      return this.dataSpace.tree.get(tempId) as Promise<ITreeNode>
    }

    return duplicate
  }

  /**
   * Search for nodes
   */
  async find(query: FindQuery = {}): Promise<ITreeNode[]> {
    let sql = `SELECT * FROM eidos__tree WHERE is_deleted = 0`
    const binds: any[] = []

    if (query.name) {
      sql += ` AND name LIKE ?`
      binds.push(`%${query.name}%`)
    }

    if (query.type) {
      if (Array.isArray(query.type)) {
        sql += ` AND type IN (${query.type.map(() => "?").join(",")})`
        binds.push(...query.type)
      } else {
        sql += ` AND type = ?`
        binds.push(query.type)
      }
    }

    if (query.parent) {
      const parentResolved = await this.resolvePath(query.parent)
      if (parentResolved) {
        sql += ` AND parent_id = ?`
        binds.push(parentResolved.id)
      }
    }

    if (query.isDeleted) {
      sql = sql.replace("is_deleted = 0", "is_deleted = 1")
    }

    sql += ` ORDER BY position DESC`

    return this.dataSpace.exec2(sql, binds) as Promise<ITreeNode[]>
  }

  // ============ Extension Node Data Operations ============

  /**
   * Get the text content of an extension node
   */
  async getText(id: string): Promise<string | null> {
    return this.dataSpace.extNode.getText(id)
  }

  /**
   * Set the text content of an extension node
   */
  async setText(id: string, text: string): Promise<boolean> {
    return this.dataSpace.extNode.setText(id, text)
  }

  /**
   * Get the binary data of an extension node
   */
  async getBlob(id: string): Promise<Buffer | null> {
    return this.dataSpace.extNode.getBlob(id)
  }

  /**
   * Set the binary data of an extension node
   */
  async setBlob(id: string, blob: Buffer): Promise<boolean> {
    return this.dataSpace.extNode.setBlob(id, blob)
  }

  // ============ Restore & Cleanup ============

  /**
   * Restore a deleted node
   */
  async restore(path: string): Promise<void> {
    // For restore, we need to find by ID since it's marked as deleted
    const allDeleted = await this.find({ isDeleted: true })
    const parts = path.split("/").filter(Boolean)
    const name = parts[parts.length - 1]

    const match = allDeleted.find((n) => n.name === name)
    if (!match) {
      throw new Error(`Deleted node not found at path: ${path}`)
    }

    await this.dataSpace.tree.restoreNode(match.id)
  }
}
