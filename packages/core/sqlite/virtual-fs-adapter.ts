import type { IDirectoryEntry, IExternalFileSystem, IWatchEvent, IWatchOptions } from "../types/IExternalFileSystem"
import type { ITreeNode } from "../types/ITreeNode"
import type { IExtension } from "../types/IExtension"
import type { BaseServerDatabase } from "./interface"

/**
 * Global event queue for virtual file system watch events
 * Key: watched path (e.g., "~/.eidos/__NODES__/")
 * Value: array of event queues for different watchers
 */
const watchEventQueues = new Map<string, Array<{
  queue: IWatchEvent[]
  resolve: ((event: IWatchEvent) => void) | null
  reject: ((error: Error) => void) | null
  signal?: AbortSignal
}>>()

/**
 * Push a watch event to all watchers for a given path
 */
function pushWatchEvent(path: string, event: IWatchEvent) {
  const watchers = watchEventQueues.get(path)
  if (!watchers || watchers.length === 0) return

  // Push event to all watchers
  watchers.forEach(watcher => {
    if (watcher.resolve) {
      watcher.resolve(event)
      watcher.resolve = null
      watcher.reject = null
    } else {
      watcher.queue.push(event)
    }
  })
}

/**
 * Virtual File System Adapter
 * Wraps an IExternalFileSystem to add support for virtual paths that map to database tables
 * 
 * Virtual paths:
 * - ~/.eidos/__NODES__/ → eidos__tree table
 * - ~/.eidos/__EXTENSIONS__/ → eidos__extensions table
 */
export class VirtualFsAdapter implements IExternalFileSystem {
  private triggersInitialized = false

  constructor(
    private underlyingFS: IExternalFileSystem,
    private db: BaseServerDatabase
  ) {
    this.initializeWatchTriggers()
  }

  /**
   * Initialize watch triggers and UDF for virtual file system
   */
  private initializeWatchTriggers() {
    if (this.triggersInitialized) return

    try {
      // Register UDF function for watch events
      this.db.createFunction({
        name: "eidos_virtual_fs_watch_event",
        xFunc: (path: string, eventType: string, filename: string) => {
          const event: IWatchEvent = {
            eventType: eventType as 'rename' | 'change',
            filename: filename || ''
          }
          pushWatchEvent(path, event)
          return null
        }
      })

      // Create triggers for eidos__tree table
      const treeInsertTrigger = `
        CREATE TEMP TRIGGER IF NOT EXISTS virtual_fs_tree_insert_trigger
        AFTER INSERT ON eidos__tree
        FOR EACH ROW
        WHEN NEW.is_deleted = 0
        BEGIN
          SELECT eidos_virtual_fs_watch_event(
            '~/.eidos/__NODES__/',
            'rename',
            NEW.id
          );
        END;
      `

      const treeUpdateTrigger = `
        CREATE TEMP TRIGGER IF NOT EXISTS virtual_fs_tree_update_trigger
        AFTER UPDATE ON eidos__tree
        FOR EACH ROW
        WHEN NEW.is_deleted = 0
        BEGIN
          -- If name or parent_id changed, emit rename event, otherwise emit change event
          SELECT eidos_virtual_fs_watch_event(
            '~/.eidos/__NODES__/',
            CASE 
              WHEN OLD.name != NEW.name OR OLD.parent_id != NEW.parent_id THEN 'rename'
              ELSE 'change'
            END,
            NEW.id
          );
        END;
      `

      const treeDeleteTrigger = `
        CREATE TEMP TRIGGER IF NOT EXISTS virtual_fs_tree_delete_trigger
        AFTER UPDATE ON eidos__tree
        FOR EACH ROW
        WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0
        BEGIN
          SELECT eidos_virtual_fs_watch_event(
            '~/.eidos/__NODES__/',
            'rename',
            NEW.id
          );
        END;
      `

      // Create triggers for eidos__extensions table
      const extensionInsertTrigger = `
        CREATE TEMP TRIGGER IF NOT EXISTS virtual_fs_extension_insert_trigger
        AFTER INSERT ON eidos__extensions
        FOR EACH ROW
        BEGIN
          SELECT eidos_virtual_fs_watch_event(
            '~/.eidos/__EXTENSIONS__/',
            'rename',
            NEW.id
          );
        END;
      `

      const extensionUpdateTrigger = `
        CREATE TEMP TRIGGER IF NOT EXISTS virtual_fs_extension_update_trigger
        AFTER UPDATE ON eidos__extensions
        FOR EACH ROW
        BEGIN
          -- If slug changed, emit rename event, otherwise emit change event
          SELECT eidos_virtual_fs_watch_event(
            '~/.eidos/__EXTENSIONS__/',
            CASE 
              WHEN OLD.slug != NEW.slug THEN 'rename'
              ELSE 'change'
            END,
            NEW.id
          );
        END;
      `

      const extensionDeleteTrigger = `
        CREATE TEMP TRIGGER IF NOT EXISTS virtual_fs_extension_delete_trigger
        AFTER DELETE ON eidos__extensions
        FOR EACH ROW
        BEGIN
          SELECT eidos_virtual_fs_watch_event(
            '~/.eidos/__EXTENSIONS__/',
            'rename',
            OLD.id
          );
        END;
      `

      // Execute all trigger creation statements
      this.db.exec(treeInsertTrigger)
      this.db.exec(treeUpdateTrigger)
      this.db.exec(treeDeleteTrigger)
      this.db.exec(extensionInsertTrigger)
      this.db.exec(extensionUpdateTrigger)
      this.db.exec(extensionDeleteTrigger)

      this.triggersInitialized = true
    } catch (error) {
      console.error('Failed to initialize watch triggers:', error)
      // Don't throw, just log - watch will still work for non-virtual paths
    }
  }

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
  async readVirtualDir(path: string, recursive = false): Promise<IDirectoryEntry[]> {
    const parsed = this.parseVirtualPath(path)
    if (!parsed) return []

    switch (parsed.type) {
      case "nodes":
        return this.readNodesDir(parsed.subPath, recursive)
      case "extensions":
        return this.readExtensionsDir(parsed.subPath, recursive)
      default:
        return []
    }
  }

  /**
   * Read nodes from eidos__tree table
   */
  private async readNodesDir(subPath: string, recursive = false): Promise<IDirectoryEntry[]> {
    const parentId = this.getNodeIdFromPath(subPath)

    if (recursive) {
      // Recursive mode: get all descendants
      return this.readNodesRecursive(parentId)
    } else {
      // Non-recursive: get direct children only
      return this.readNodesDirect(parentId)
    }
  }

  /**
   * Read direct children (non-recursive)
   */
  private async readNodesDirect(parentId: string | null): Promise<IDirectoryEntry[]> {
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
   * Read all descendants recursively
   */
  private async readNodesRecursive(parentId: string | null): Promise<IDirectoryEntry[]> {
    let query: string
    let bind: any[] = []
    
    if (parentId) {
      // Get the node and all its descendants using a recursive CTE
      query = `
        WITH RECURSIVE node_tree AS (
          -- Base case: start with the parent node
          SELECT * FROM eidos__tree WHERE id = ? AND is_deleted = 0
          UNION ALL
          -- Recursive case: get all children
          SELECT t.* FROM eidos__tree t
          INNER JOIN node_tree nt ON t.parent_id = nt.id
          WHERE t.is_deleted = 0
        )
        SELECT * FROM node_tree
        WHERE id != ? -- Exclude the parent node itself, we only want descendants
        ORDER BY 
          CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END,
          name ASC
      `
      bind = [parentId, parentId]
    } else {
      // Get all nodes (root level and all descendants)
      query = `
        SELECT * FROM eidos__tree 
        WHERE is_deleted = 0
        ORDER BY 
          CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END,
          name ASC
      `
    }

    const nodes = await this.db.selectObjects(query, bind) as ITreeNode[]

    // Transform to IDirectoryEntry with proper paths for recursive mode
    const entries = await Promise.all(nodes.map((node) => this.nodeToEntryRecursive(node)))
    return entries
  }

  /**
   * Read extensions from eidos__extensions table
   */
  private async readExtensionsDir(subPath: string, recursive = false): Promise<IDirectoryEntry[]> {
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
   * Convert ITreeNode to IDirectoryEntry (non-recursive mode)
   */
  private nodeToEntry(node: ITreeNode): IDirectoryEntry {
    if (!node.id) {
      throw new Error(`Node has no ID`)
    }
    
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
   * Convert ITreeNode to IDirectoryEntry for recursive mode
   * In recursive mode, we need to build the full path from root to this node
   */
  private async nodeToEntryRecursive(node: ITreeNode): Promise<IDirectoryEntry> {

    if (!node.id) {
      throw new Error(`Node has no ID`)
    }
    
    // Build the full path by traversing up the tree
    const pathParts: string[] = [node.id]
    let currentParentId: string | null = node.parent_id || null
    
    while (currentParentId) {
      pathParts.unshift(currentParentId)
      const parentNode = await this.db.selectObjects(
        "SELECT parent_id FROM eidos__tree WHERE id = ? AND is_deleted = 0",
        [currentParentId]
      ) as Array<{ parent_id: string | null }>
      
      if (parentNode.length > 0 && parentNode[0].parent_id) {
        currentParentId = parentNode[0].parent_id
      } else {
        break
      }
    }
    
    const fullPath = `~/.eidos/__NODES__/${pathParts.join("/")}`
    const parentPath = pathParts.length > 1 
      ? `~/.eidos/__NODES__/${pathParts.slice(0, -1).join("/")}`
      : "~/.eidos/__NODES__"
    
    return {
      name: node.name,  // ✅ 这是真实的节点名称，不是 ID
      path: fullPath,
      parentPath: parentPath,
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
        extensionType: ext.type,
      },
    }
  }

  // Implement IExternalFileSystem interface - delegate to underlying FS or handle virtual paths

  async readdir(path: string, options: { withFileTypes: true; recursive?: boolean }): Promise<IDirectoryEntry[]>
  async readdir(path: string, options?: { withFileTypes?: false; recursive?: boolean }): Promise<string[]>
  async readdir(path: string, options?: any): Promise<string[] | IDirectoryEntry[]> {
    // Handle virtual paths
    if (this.isVirtualPath(path)) {
      const entries = await this.readVirtualDir(path, options?.recursive)
      
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

  /**
   * Watch for changes on a file or directory
   * For virtual paths, uses database triggers and UDF
   * For real paths, delegates to underlying filesystem
   */
  async *watch(path: string, options?: IWatchOptions): AsyncIterable<IWatchEvent> {
    // Normalize path to ensure consistent format
    const normalizedPath = path.endsWith('/') ? path : path + '/'
    
    console.log('watch', normalizedPath)
    // Handle virtual paths
    if (this.isVirtualPath(normalizedPath)) {
      // Only watch root virtual directories
      const basePath = normalizedPath.startsWith("~/.eidos/__NODES__")
        ? "~/.eidos/__NODES__/"
        : normalizedPath.startsWith("~/.eidos/__EXTENSIONS__")
        ? "~/.eidos/__EXTENSIONS__/"
        : null

      if (!basePath) {
        throw new Error(`Cannot watch non-root virtual path: ${normalizedPath}`)
      }

      // Create watcher entry
      const watcher = {
        queue: [] as IWatchEvent[],
        resolve: null as ((event: IWatchEvent) => void) | null,
        reject: null as ((error: Error) => void) | null,
        signal: options?.signal
      }

      // Add to watchers map
      if (!watchEventQueues.has(basePath)) {
        watchEventQueues.set(basePath, [])
      }
      watchEventQueues.get(basePath)!.push(watcher)

      try {
        // Handle abort signal
        let abortListener: (() => void) | undefined
        if (options?.signal) {
          abortListener = () => {
            // Remove watcher from queue
            const watchers = watchEventQueues.get(basePath)
            if (watchers) {
              const index = watchers.indexOf(watcher)
              if (index > -1) {
                watchers.splice(index, 1)
              }
              if (watchers.length === 0) {
                watchEventQueues.delete(basePath)
              }
            }
          }
          options.signal.addEventListener('abort', abortListener)
        }

        try {
          while (true) {
            // Check if aborted
            if (options?.signal?.aborted) {
              break
            }

            // If we have queued events, yield them
            if (watcher.queue.length > 0) {
              yield watcher.queue.shift()!
              continue
            }

            // Otherwise, wait for next event
            const event = await new Promise<IWatchEvent>((resolve, reject) => {
              watcher.resolve = resolve
              watcher.reject = reject
            })

            // Check if aborted after waiting
            if (options?.signal?.aborted) {
              break
            }

            yield event
          }
        } finally {
          // Clean up
          if (abortListener && options?.signal) {
            options.signal.removeEventListener('abort', abortListener)
          }
          
          // Remove watcher from queue
          const watchers = watchEventQueues.get(basePath)
          if (watchers) {
            const index = watchers.indexOf(watcher)
            if (index > -1) {
              watchers.splice(index, 1)
            }
            if (watchers.length === 0) {
              watchEventQueues.delete(basePath)
            }
          }
        }
      } catch (error) {
        // Remove watcher on error
        const watchers = watchEventQueues.get(basePath)
        if (watchers) {
          const index = watchers.indexOf(watcher)
          if (index > -1) {
            watchers.splice(index, 1)
          }
          if (watchers.length === 0) {
            watchEventQueues.delete(basePath)
          }
        }
        throw error
      }
    } else {
      // Delegate to underlying filesystem for non-virtual paths
      yield* this.underlyingFS.watch(path, options)
    }
  }
}
