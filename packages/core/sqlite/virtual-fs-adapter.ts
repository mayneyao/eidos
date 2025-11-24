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
      // Register UDF function for watch events - UDFs must be synchronous
      this.db.createFunction({
        name: "eidos_virtual_fs_watch_event",
        xFunc: (path: string, eventType: string, nodeId: string) => {
          try {
            // For UDFs, we cannot use async operations, so we'll use the nodeId directly
            // The full path building will be handled by the watch consumer if needed
            const event: IWatchEvent = {
              eventType: eventType as 'rename' | 'change',
              filename: nodeId || ''
            }
            pushWatchEvent(path, event)
          } catch (error) {
            console.error('Error in virtual fs watch event UDF:', error)
            // Fallback to just the node ID
            const event: IWatchEvent = {
              eventType: eventType as 'rename' | 'change',
              filename: nodeId || ''
            }
            pushWatchEvent(path, event)
          }
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
   * namePath is built directly in SQL using a subquery for each node
   */
  private async readNodesDirect(parentId: string | null): Promise<IDirectoryEntry[]> {
    // Query the tree table with namePath built directly in SQL
    let query: string
    let bind: any[] = []

    if (parentId) {
      query = `
        SELECT 
          t.*,
          (
            WITH RECURSIVE ancestor_path AS (
              -- Start with the current node
              SELECT id, name, parent_id, name AS path_part, 1 AS level
              FROM eidos__tree
              WHERE id = t.id
              
              UNION ALL
              
              -- Recursively get ancestors (include root nodes)
              SELECT p.id, p.name, p.parent_id, p.name AS path_part, ap.level + 1
              FROM eidos__tree p
              INNER JOIN ancestor_path ap ON p.id = ap.parent_id
            )
            SELECT '~/.eidos/__NODES__/' || group_concat(path_part, '/')
            FROM (
              SELECT path_part FROM ancestor_path ORDER BY level DESC
            )
          ) AS name_path
        FROM eidos__tree t
        WHERE t.parent_id = ?
          AND t.is_deleted = 0
        ORDER BY 
          CASE WHEN t.is_pinned = 1 THEN 0 ELSE 1 END,
          t.name ASC
      `
      bind = [parentId]
    } else {
      query = `
        SELECT 
          t.*,
          '~/.eidos/__NODES__/' || t.name AS name_path
        FROM eidos__tree t
        WHERE t.parent_id IS NULL
          AND t.is_deleted = 0
        ORDER BY 
          CASE WHEN t.is_pinned = 1 THEN 0 ELSE 1 END,
          t.name ASC
      `
    }

    const nodes = await this.db.selectObjects(query, bind) as Array<ITreeNode & { name_path: string }>

    // Transform to IDirectoryEntry - namePath is already built in SQL
    return nodes.map((node) => this.nodeToEntry(node, node.name_path))
  }

  /**
   * Read all descendants recursively
   * namePath is built directly in SQL using a subquery for each node
   */
  private async readNodesRecursive(parentId: string | null): Promise<IDirectoryEntry[]> {
    let query: string
    let bind: any[] = []

    if (parentId) {
      // Get the node and all its descendants using a recursive CTE, with namePath built in SQL
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
        SELECT 
          t.*,
          (
            WITH RECURSIVE ancestor_path AS (
              -- Start with the current node
              SELECT id, name, parent_id, name AS path_part, 1 AS level
              FROM eidos__tree
              WHERE id = t.id
              
              UNION ALL
              
              -- Recursively get ancestors
              SELECT p.id, p.name, p.parent_id, p.name AS path_part, ap.level + 1
              FROM eidos__tree p
              INNER JOIN ancestor_path ap ON p.id = ap.parent_id
            )
            SELECT '~/.eidos/__NODES__/' || group_concat(path_part, '/')
            FROM (
              SELECT path_part FROM ancestor_path ORDER BY level DESC
            )
          ) AS name_path
        FROM node_tree t
        WHERE t.id != ? -- Exclude the parent node itself, we only want descendants
        ORDER BY 
          CASE WHEN t.is_pinned = 1 THEN 0 ELSE 1 END,
          t.name ASC
      `
      bind = [parentId, parentId]
    } else {
      // Get all nodes (root level and all descendants) with namePath built in SQL
      query = `
        WITH RECURSIVE all_nodes AS (
          -- Base case: root nodes
          SELECT * FROM eidos__tree 
          WHERE parent_id IS NULL AND is_deleted = 0
          
          UNION ALL
          
          -- Recursive case: all descendants
          SELECT t.* FROM eidos__tree t
          INNER JOIN all_nodes an ON t.parent_id = an.id
          WHERE t.is_deleted = 0
        )
        SELECT 
          t.*,
          (
            WITH RECURSIVE ancestor_path AS (
              -- Start with the current node
              SELECT id, name, parent_id, name AS path_part, 1 AS level
              FROM eidos__tree
              WHERE id = t.id
              
              UNION ALL
              
              -- Recursively get ancestors
              SELECT p.id, p.name, p.parent_id, p.name AS path_part, ap.level + 1
              FROM eidos__tree p
              INNER JOIN ancestor_path ap ON p.id = ap.parent_id
            )
            SELECT '~/.eidos/__NODES__/' || group_concat(path_part, '/')
            FROM (
              SELECT path_part FROM ancestor_path ORDER BY level DESC
            )
          ) AS name_path
        FROM all_nodes t
        ORDER BY 
          CASE WHEN t.is_pinned = 1 THEN 0 ELSE 1 END,
          t.name ASC
      `
    }

    const nodes = await this.db.selectObjects(query, bind) as Array<ITreeNode & { name_path: string }>

    // Transform to IDirectoryEntry - namePath is already built in SQL
    return nodes.map((node) => {
      const parentPath = node.parent_id
        ? `~/.eidos/__NODES__/${node.parent_id}`
        : "~/.eidos/__NODES__"

      return {
        name: node.name,
        path: `~/.eidos/__NODES__/${node.id}`,
        parentPath: parentPath,
        kind: node.type === "folder" ? "directory" : "file",
        metadata: {
          nodeType: node.type as any,
          nodeId: node.id,
          isPinned: node.is_pinned || false,
          icon: node.icon,
          namePath: node.name_path,
        },
      }
    })
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
   * namePath is now built in SQL, so we just pass it through
   */
  private nodeToEntry(node: ITreeNode, namePath: string): IDirectoryEntry {
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
        namePath: namePath,
      },
    }
  }

  /**
   * Build name-based path for a single node efficiently
   * Uses a single recursive CTE query for optimal performance
   */
  private async buildNamePath(nodeId: string, parentId: string | undefined, nodeName: string): Promise<string> {
    // Fast path for root nodes
    if (!parentId) {
      return `~/.eidos/__NODES__/${nodeName}`;
    }

    // Build the path using a single recursive CTE query
    // This gets all ancestors in one database operation
    const query = `
      WITH RECURSIVE name_path AS (
        -- Start with the current node
        SELECT id, name, parent_id, name as path_part, 1 as level
        FROM eidos__tree 
        WHERE id = ?
        
        UNION ALL
        
        -- Recursively get ancestors (include root nodes)
        SELECT t.id, t.name, t.parent_id, t.name as path_part, np.level + 1
        FROM eidos__tree t
        INNER JOIN name_path np ON t.id = np.parent_id
      )
      SELECT name FROM name_path ORDER BY level DESC
    `;

    const ancestors = await this.db.selectObjects(query, [nodeId]) as Array<{ name: string }>;

    if (ancestors.length === 0) {
      return `~/.eidos/__NODES__/${nodeName}`;
    }

    // Build the path from root to leaf
    const pathParts = ancestors.map(ancestor => ancestor.name);
    return `~/.eidos/__NODES__/${pathParts.join('/')}`;
  }

  /**
   * Check if an error is a database busy error
   */
  private isDatabaseBusyError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes("database connection is busy") ||
        error.message.includes("database is locked") ||
        error.message.includes("busy executing a query") ||
        error.message.includes("SQLITE_BUSY")
      )
    }
    return false
  }

  /**
   * Retry a database operation with exponential backoff if it encounters a busy error
   */
  private async retryOnBusy<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelay = 50
  ): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (this.isDatabaseBusyError(error) && attempt < maxRetries) {
          // Exponential backoff: 50ms, 100ms, 200ms
          const delay = initialDelay * Math.pow(2, attempt)
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
        throw error
      }
    }
    throw lastError
  }

  /**
   * Build ID-based path for watch events
   * Returns the full path like "id1/id2/id3" based on parent-child relationships
   * Uses retry logic to handle database busy errors (especially on Windows)
   * Handles the case where the node may have been deleted (returns nodeId directly)
   */
  private async buildIdPathForWatch(nodeId: string): Promise<string> {
    if (!nodeId) return ''

    // Use retry logic to handle database busy errors
    // This can happen when watch events fire during a delete transaction
    return this.retryOnBusy(async () => {
      try {
        // Get all ancestors of the node (including the node itself) using recursive CTE
        // This walks up the tree from the node to the root
        // Note: We check is_deleted = 0, but if the node was just deleted, this query will return empty
        const ancestorsQuery = `
          WITH RECURSIVE ancestor_path AS (
            -- Start with the current node
            SELECT id, parent_id, 1 as level
            FROM eidos__tree 
            WHERE id = ? AND is_deleted = 0
            
            UNION ALL
            
            -- Recursively get ancestors (walk up the tree)
            SELECT t.id, t.parent_id, ap.level + 1
            FROM eidos__tree t
            INNER JOIN ancestor_path ap ON t.id = ap.parent_id
            WHERE t.is_deleted = 0
          )
          SELECT id FROM ancestor_path ORDER BY level DESC
        `

        const ancestors = await this.db.selectObjects(ancestorsQuery, [nodeId]) as Array<{ id: string }>

        // If no ancestors found, the node may have been deleted or doesn't exist
        // Return the nodeId directly as a fallback
        if (ancestors.length === 0) {
          return nodeId
        }

        // Build the ID path from root to current node (ancestors are ordered from root to leaf)
        const pathParts = ancestors.map(ancestor => ancestor.id)

        return pathParts.join('/')
      } catch (error) {
        // If query fails (e.g., node was deleted), return nodeId as fallback
        // This prevents watch events from breaking when nodes are deleted
        if (this.isDatabaseBusyError(error)) {
          throw error // Let retry logic handle it
        }
        // For other errors, return nodeId as fallback
        console.warn(`Failed to build path for node ${nodeId}, using nodeId directly:`, error)
        return nodeId
      }
    })
  }

  /**
   * Batch build name paths for multiple nodes efficiently
   * This is much more efficient than building each path individually
   */
  private async batchBuildNamePaths(nodes: ITreeNode[]): Promise<IDirectoryEntry[]> {
    if (nodes.length === 0) return [];

    // Build a cache of all needed paths in parallel
    const namePathCache = new Map<string, string>();
    const parentPathCache = new Map<string, string>();

    // Pre-build all paths in parallel for better performance
    const pathPromises = nodes.map(async (node) => {
      // Build name path for the node itself
      const namePathPromise = this.buildNamePathForBatch(node, namePathCache);

      // Build parent path if needed
      const parentPathPromise = node.parent_id
        ? this.buildNamePathForBatch({ id: node.parent_id, name: '', parent_id: undefined }, namePathCache)
        : Promise.resolve("~/.eidos/__NODES__");

      return {
        node,
        namePath: await namePathPromise,
        parentPath: await parentPathPromise
      };
    });

    const results = await Promise.all(pathPromises);

    // Build final entries
    return results.map(({ node, namePath, parentPath }) => ({
      name: node.name,
      path: `~/.eidos/__NODES__/${node.id}`,
      parentPath: parentPath,
      kind: node.type === "folder" ? "directory" : "file",
      metadata: {
        nodeType: node.type as any,
        nodeId: node.id,
        isPinned: node.is_pinned || false,
        icon: node.icon,
        namePath: namePath,
      },
    }));
  }

  /**
   * Build name path for a single node using cache
   */
  private async buildNamePathForBatch(node: { id: string; name: string; parent_id?: string | null }, cache: Map<string, string>): Promise<string> {
    // Check cache first
    if (cache.has(node.id)) {
      return cache.get(node.id)!;
    }

    // Special case: if name is empty (parent path lookup), just return the ID-based path
    if (!node.name && node.parent_id === undefined) {
      const path = `~/.eidos/__NODES__/${node.id}`;
      cache.set(node.id, path);
      return path;
    }

    // Build path using the same efficient recursive CTE
    const query = `
      WITH RECURSIVE name_path AS (
        SELECT id, name, parent_id, name as path_part, 1 as level
        FROM eidos__tree 
        WHERE id = ?
        
        UNION ALL
        
        SELECT t.id, t.name, t.parent_id, t.name as path_part, np.level + 1
        FROM eidos__tree t
        INNER JOIN name_path np ON t.id = np.parent_id
      )
      SELECT name FROM name_path ORDER BY level DESC
    `;

    const ancestors = await this.db.selectObjects(query, [node.id]) as Array<{ name: string }>;

    let path: string;
    if (ancestors.length === 0) {
      path = `~/.eidos/__NODES__/${node.name}`;
    } else {
      const pathParts = ancestors.map(ancestor => ancestor.name);
      path = `~/.eidos/__NODES__/${pathParts.join('/')}`;
    }

    // Cache the result
    cache.set(node.id, path);
    return path;
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
   * Delete a file
   */
  async unlink(path: string): Promise<void> {
    // Virtual paths don't support unlink
    if (this.isVirtualPath(path)) {
      throw new Error("unlink not supported for virtual paths")
    }
    return this.underlyingFS.unlink(path)
  }

  /**
   * Delete a directory
   */
  async rmdir(path: string): Promise<void> {
    // Virtual paths don't support rmdir
    if (this.isVirtualPath(path)) {
      throw new Error("rmdir not supported for virtual paths")
    }
    return this.underlyingFS.rmdir(path)
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
          // Determine if we're watching nodes or extensions
          const isNodesPath = basePath === "~/.eidos/__NODES__/"

          while (true) {
            // Check if aborted
            if (options?.signal?.aborted) {
              break
            }

            // If we have queued events, yield them
            if (watcher.queue.length > 0) {
              const event = watcher.queue.shift()!
              // Add a delay to ensure the transaction that triggered this event has committed
              // This is especially important on Windows where SQLite is stricter about connection state
              // For delete events (soft delete), the UPDATE transaction needs time to commit
              // before we can safely query the database
              await new Promise(resolve => setTimeout(resolve, 50))
              
              // For nodes, build the full ID path; for extensions, use the ID directly
              // For delete events (rename eventType), the node is already marked as deleted,
              // so buildIdPathForWatch will return nodeId directly (query returns empty)
              const fullIdPath = isNodesPath
                ? await this.buildIdPathForWatch(event.filename)
                : event.filename
              yield {
                ...event,
                filename: fullIdPath || event.filename
              }
              continue
            }

            // Otherwise, wait for next event
            const rawEvent = await new Promise<IWatchEvent>((resolve, reject) => {
              watcher.resolve = resolve
              watcher.reject = reject
            })

            // Check if aborted after waiting
            if (options?.signal?.aborted) {
              break
            }

            // Add a delay to ensure the transaction that triggered this event has committed
            // This is especially important on Windows where SQLite is stricter about connection state
            // For delete events (soft delete), the UPDATE transaction needs time to commit
            // before we can safely query the database
            await new Promise(resolve => setTimeout(resolve, 50))

            // For nodes, build the full ID path; for extensions, use the ID directly
            // For delete events (rename eventType), the node is already marked as deleted,
            // so buildIdPathForWatch will return nodeId directly (query returns empty)
            const fullIdPath = isNodesPath
              ? await this.buildIdPathForWatch(rawEvent.filename)
              : rawEvent.filename
            yield {
              ...rawEvent,
              filename: fullIdPath || rawEvent.filename
            }
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
