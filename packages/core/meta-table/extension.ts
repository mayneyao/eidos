import { ExtensionTableName } from "../sqlite/const"
import { createAllTriggersForFields } from "../sqlite/sql-meta-table-trigger"
import type {
  DocActionMeta,
  ExtensionStatus,
  IBindings,
  IExtension,
  TableActionMeta,
  TableViewMeta,
  UDFMeta,
  FileHandlerMeta,
} from "../types/IExtension"
import { BlockExtensionType } from "../types/IExtension"

import type { BaseTable } from "./base"
import { BaseTableImpl } from "./base"
import { performTrigramSearch } from "./doc/search"

// Re-export types for backward compatibility
export type { ExtensionStatus, IExtension, TableViewMeta }

/**
 * Extension statistics interface
 */
export interface ExtensionStats {
  scripts: {
    total: number
    tool: number
    tableAction: number
    udf: number
    others: number // Empty scripts (no meta)
  }
  blocks: {
    total: number
    tableView: number
    extNode: number
    others: number // Empty blocks (no meta)
  }
  total: number
}

export class ExtensionTable
  extends BaseTableImpl<IExtension>
  implements BaseTable<IExtension>
{
  name = ExtensionTableName

  createTableSql = `
    CREATE TABLE IF NOT EXISTS ${this.name} (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE,
        name TEXT,
        description TEXT,
        type TEXT DEFAULT 'script',
        version TEXT,
        code TEXT,
        ts_code TEXT,
        meta TEXT,
        icon TEXT,
        marketplace_id TEXT,
        enabled BOOLEAN DEFAULT 0,
        bindings TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER IF NOT EXISTS update_time_trigger__${this.name}
    AFTER UPDATE ON ${this.name}
    FOR EACH ROW
    BEGIN
      UPDATE ${this.name} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;


    ${createAllTriggersForFields(this.name, [
      "id",
      "slug",
      "name",
      "type",
      "code",
      "ts_code",
      "enabled",
      "icon",
      "meta",
    ])}

    CREATE INDEX IF NOT EXISTS idx_${this.name}_ts_code_trigram ON ${this.name}(ts_code) WHERE ts_code IS NOT NULL;
`

  JSONFields: string[] = ["meta", "bindings"]

  static isUDFExtension(extension: IExtension) {
    return extension.type === "script" && extension.meta?.type === "udf"
  }

  async getTableViews(): Promise<IExtension<TableViewMeta>[]> {
    const sql = `
      SELECT id, slug, name, description, type, version, meta, icon, marketplace_id, enabled, bindings, created_at, updated_at FROM ${this.name}
      WHERE enabled = 1
      AND meta IS NOT NULL
      AND meta != ''
      AND JSON_VALID(meta) = 1
      AND JSON_EXTRACT(meta, '$.type') = 'tableView'
    `
    const res = await this.dataSpace.exec2(sql)
    return res.map((item: any) => this.toJson(item))
  }

  async getTableViewExtensionInfoByExtType(
    viewType: string
  ): Promise<IExtension<TableViewMeta>[]> {
    const sql = `
      SELECT id, slug, name, description, type, version, meta, icon, marketplace_id, enabled, bindings, created_at, updated_at FROM ${this.name}
      WHERE enabled = 1
      AND meta IS NOT NULL
      AND meta != ''
      AND JSON_VALID(meta) = 1
      AND JSON_EXTRACT(meta, '$.tableView.type') = ?
    `
    const res = await this.dataSpace.exec2(sql, [viewType])
    return res.map((item: any) => this.toJson(item))
  }

  async getTableViewsInfo(): Promise<IExtension<TableViewMeta>[]> {
    const sql = `
      SELECT id, slug, name, description, type, version, meta, icon, marketplace_id, enabled, bindings, created_at, updated_at FROM ${this.name}
      WHERE enabled = 1
      AND meta IS NOT NULL
      AND meta != ''
      AND JSON_VALID(meta) = 1
      AND JSON_EXTRACT(meta, '$.type') = 'tableView'
    `
    const res = await this.dataSpace.exec2(sql)
    return res.map((item: any) => this.toJson(item))
  }

  async del(id: string): Promise<boolean> {
    await this.dataSpace.db.transaction(async () => {
      // Get extension info before deletion to check if it's a file handler
      const extension = await this.get(id)

      // If it's a file handler, clean up default handler KV entries
      if (
        extension &&
        extension.meta?.type === BlockExtensionType.FileHandler
      ) {
        const meta = extension.meta as FileHandlerMeta
        const fileExtensions = meta.fileHandler?.extensions || []

        // For each file extension this handler supports, check if it's the default handler
        for (const fileExtension of fileExtensions) {
          const key = `eidos:space:file:handler:default:${fileExtension}`
          const defaultHandlerId = await this.dataSpace.kv.get(key, "text")

          // If this extension is the default handler for this file extension, remove it
          if (defaultHandlerId === id) {
            await this.dataSpace.kv.delete(key)
          }
        }
      }

      await this.dataSpace.exec2(`DELETE FROM ${this.name} WHERE id = ?`, [id])
      const chatIds = await this.dataSpace.chat.getChatIdsByProjectId(id)
      await Promise.all(
        chatIds.map((chatId) => this.dataSpace.chat.del(chatId))
      )
    })
    return true
  }

  /**
   * Batch get extensions by IDs
   * @param ids Array of extension IDs
   * @returns Record mapping ID to extension data (or null if not found)
   */
  async getBatch(ids: string[]): Promise<Record<string, IExtension | null>> {
    if (ids.length === 0) {
      return {}
    }

    // Create placeholders for the IN clause
    const placeholders = ids.map(() => "?").join(",")
    const sql = `SELECT * FROM ${this.name} WHERE id IN (${placeholders})`

    const res = await this.dataSpace.exec2(sql, ids)

    // Create a map of results
    const result: Record<string, IExtension | null> = {}

    // Initialize all requested IDs as null
    ids.forEach((id) => {
      result[id] = null
    })

    // Fill in the found extensions
    res.forEach((item: any) => {
      const extension = this.toJson(item)
      result[extension.id] = extension
    })

    return result
  }

  async enable(id: string): Promise<boolean> {
    this.dataSpace.exec2(`UPDATE ${this.name} SET enabled = 1 WHERE id = ?`, [
      id,
    ])
    return Promise.resolve(true)
  }

  async disable(id: string): Promise<boolean> {
    this.dataSpace.exec2(`UPDATE ${this.name} SET enabled = 0 WHERE id = ?`, [
      id,
    ])
    return Promise.resolve(true)
  }

  /**
   * Build the virtual path for an extension (~/ .eidos/__EXTENSIONS__/slug.ts)
   * Returns null if the extension does not exist.
   * For hierarchical slugs like "ejected/journals/index", returns "~/.eidos/__EXTENSIONS__/ejected/journals/index.ts"
   */
  async getIdPath(extensionId: string): Promise<string | null> {
    const rows = await this.dataSpace.exec2(
      `SELECT id, slug, type FROM ${this.name} WHERE id = ?`,
      [extensionId]
    )
    if (rows.length === 0) return null

    const row = rows[0] as { id: string; slug: string; type: string }
    // Use slug as the filename with extension
    const slug = row.slug || row.id
    const ext = row.type === "script" ? "ts" : "tsx"
    return `~/.eidos/__EXTENSIONS__/${slug}.${ext}`
  }

  async updateBindings(id: string, bindings: IBindings) {
    this.dataSpace.exec2(`UPDATE ${this.name} SET bindings = ? WHERE id = ?`, [
      JSON.stringify(bindings),
      id,
    ])
    return Promise.resolve(true)
  }

  // ========== Block Extension Query Methods ==========

  /**
   * Get all block extensions by status
   */
  async getBlockExtensions(
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension[]> {
    const params: any[] = ["block"]
    let sql = `SELECT * FROM ${this.name} WHERE type = ?`

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }
    // status === "all" - no additional filter needed

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Get ExtNode extensions by status
   */
  async getExtNodeExtensions(
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension[]> {
    const params: any[] = ["block", "extNode"]
    let sql = `
      SELECT * FROM ${this.name}
      WHERE type = ?
      AND meta IS NOT NULL
      AND meta != ''
      AND JSON_VALID(meta) = 1
      AND JSON_EXTRACT(meta, '$.type') = ?
    `

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Get ExtNode extensions by handler type
   */
  async getExtNodeExtensionsByHandlerType(
    type: string,
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension[]> {
    const params: any[] = ["block", "extNode", `%"${type}"%`]
    let sql = `
      SELECT * FROM ${this.name}
      WHERE type = ?
      AND meta IS NOT NULL
      AND meta != ''
      AND JSON_VALID(meta) = 1
      AND JSON_EXTRACT(meta, '$.type') = ?
      AND JSON_EXTRACT(meta, '$.extNode.type') LIKE ?
    `

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  // ========== Script Extension Query Methods ==========

  /**
   * Get all script extensions by status
   */
  async getScriptExtensions(
    status: ExtensionStatus = "all"
  ): Promise<IExtension[]> {
    const params: any[] = ["script"]
    let sql = `SELECT * FROM ${this.name} WHERE type = ?`

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Get Tool extensions by status
   */
  async getToolExtensions(
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension[]> {
    return this.getScriptExtensionsByType("tool", status)
  }

  /**
   * Get TableAction extensions by status
   */
  async getTableActionExtensions(
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension<TableActionMeta>[]> {
    return this.getScriptExtensionsByType("tableAction", status) as Promise<
      IExtension<TableActionMeta>[]
    >
  }

  /**
   * Get DocAction extensions by status
   */
  async getDocActionExtensions(
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension<DocActionMeta>[]> {
    return this.getScriptExtensionsByType("docAction", status) as Promise<
      IExtension<DocActionMeta>[]
    >
  }

  /**
   * Get UDF (User Defined Function) extensions by status
   */
  async getUDFExtensions(
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension<UDFMeta>[]> {
    return this.getScriptExtensionsByType("udf", status) as Promise<
      IExtension<UDFMeta>[]
    >
  }

  // ========== Private Helper Methods ==========

  /**
   * Generic method to get script extensions by type and status
   */
  private async getScriptExtensionsByType(
    scriptType: string,
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension[]> {
    const params: any[] = ["script", scriptType]
    let sql = `
      SELECT * FROM ${this.name}
      WHERE type = ?
      AND meta IS NOT NULL
      AND meta != ''
      AND JSON_VALID(meta) = 1
      AND JSON_EXTRACT(meta, '$.type') = ?
    `

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  // ========== General Query Methods ==========

  /**
   * Get extension by slug
   */
  async getExtensionBySlug(slug: string): Promise<IExtension | null> {
    const sql = `SELECT * FROM ${this.name} WHERE slug = ?`
    const res = await this.dataSpace.exec2(sql, [slug])
    return res.length > 0 ? this.toJson(res[0]) : null
  }

  async getExtensionBySlugOrId(idOrSlug: string): Promise<IExtension | null> {
    const byId = await this.get(idOrSlug)
    if (byId) {
      return byId
    }
    return this.getExtensionBySlug(idOrSlug)
  }

  /**
   * Check if a slug already exists
   */
  async slugExists(slug: string): Promise<boolean> {
    const sql = `SELECT COUNT(*) as count FROM ${this.name} WHERE slug = ?`
    const res = await this.dataSpace.exec2(sql, [slug])
    return res[0]?.count > 0
  }

  /**
   * Generate a unique slug based on a base slug
   * If the base slug already exists, it will append a number to make it unique
   */
  async generateUniqueSlug(baseSlug: string): Promise<string> {
    // Check if the base slug is already unique
    const exists = await this.slugExists(baseSlug)
    if (!exists) {
      return baseSlug
    }

    // If not unique, try with incrementing numbers
    let counter = 1
    let newSlug = `${baseSlug}-${counter}`

    while (await this.slugExists(newSlug)) {
      counter++
      newSlug = `${baseSlug}-${counter}`
    }

    return newSlug
  }

  /**
   * Get extensions by marketplace ID
   */
  async getExtensionsByMarketplaceId(
    marketplaceId: string
  ): Promise<IExtension[]> {
    const sql = `SELECT * FROM ${this.name} WHERE marketplace_id = ?`
    const res = await this.dataSpace.exec2(sql, [marketplaceId])
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Get extensions by type and status
   */
  async getExtensionsByType(
    type: "script" | "block",
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension[]> {
    const params: any[] = [type]
    let sql = `SELECT * FROM ${this.name} WHERE type = ?`

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Search extensions by name or description
   */
  async searchExtensions(
    query: string,
    status: ExtensionStatus = "all"
  ): Promise<IExtension[]> {
    const searchPattern = `%${query}%`
    const params: any[] = [searchPattern, searchPattern]
    let sql = `SELECT * FROM ${this.name} WHERE (name LIKE ? OR description LIKE ?)`

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Full-text search extensions by code using trigram + LIKE
   */
  async fullTextSearchExtensions(
    query: string
  ): Promise<Array<IExtension & { result?: string }>> {
    if (!query || typeof query !== "string") {
      return []
    }

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return []
    }

    // Split query into keywords by spaces, filter out empty strings
    const keywords = trimmedQuery.split(/\s+/).filter((k) => k.length > 0)
    if (keywords.length === 0) {
      return []
    }

    return performTrigramSearch(keywords, {
      tableName: this.name,
      fieldName: "ts_code",
      highlightTag: "b",
      contextLength: 64,
      dataSpace: this.dataSpace,
      transformResult: (row: any) => this.toJson(row),
    })
  }

  /**
   * Get extensions with bindings
   */
  async getExtensionsWithBindings(
    status: ExtensionStatus = "enabled"
  ): Promise<IExtension[]> {
    const params: any[] = []
    let sql = `SELECT * FROM ${this.name} WHERE bindings IS NOT NULL AND bindings != '' AND bindings != '{}'`

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Get extension count by type and status
   */
  async getExtensionCount(
    type?: "script" | "block",
    status: ExtensionStatus = "all"
  ): Promise<number> {
    const params: any[] = []
    let sql = `SELECT COUNT(*) as count FROM ${this.name} WHERE 1=1`

    if (type) {
      sql += " AND type = ?"
      params.push(type)
    }

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res[0]?.count || 0
  }

  /**
   * Get comprehensive extension statistics
   */
  async getExtensionStats(
    status: ExtensionStatus = "all"
  ): Promise<ExtensionStats> {
    const params: any[] = []
    let whereClause = "WHERE 1=1"

    if (status === "enabled") {
      whereClause += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      whereClause += " AND enabled = ?"
      params.push(0)
    }

    // Get script statistics
    const scriptStats = await this.dataSpace.exec2(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'tool' THEN 1 ELSE 0 END) as tool,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'tableAction' THEN 1 ELSE 0 END) as tableAction,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'udf' THEN 1 ELSE 0 END) as udf,
        SUM(CASE WHEN meta IS NULL OR meta = '' OR JSON_VALID(meta) = 0 THEN 1 ELSE 0 END) as others
      FROM ${this.name}
      ${whereClause} AND type = 'script'
    `,
      params
    )

    // Get block statistics
    const blockStats = await this.dataSpace.exec2(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'tableView' THEN 1 ELSE 0 END) as tableView,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'extNode' THEN 1 ELSE 0 END) as extNode,
        SUM(CASE WHEN meta IS NULL OR meta = '' OR JSON_VALID(meta) = 0 THEN 1 ELSE 0 END) as others
      FROM ${this.name}
      ${whereClause} AND type = 'block'
    `,
      params
    )

    // Get total count
    const totalStats = await this.dataSpace.exec2(
      `
      SELECT COUNT(*) as total FROM ${this.name} ${whereClause}
    `,
      params
    )

    const scriptRow = scriptStats[0] || {
      total: 0,
      tool: 0,
      tableAction: 0,
      udf: 0,
      others: 0,
    }
    const blockRow = blockStats[0] || {
      total: 0,
      tableView: 0,
      extNode: 0,
      others: 0,
    }
    const totalRow = totalStats[0] || { total: 0 }

    return {
      scripts: {
        total: scriptRow.total || 0,
        tool: scriptRow.tool || 0,
        tableAction: scriptRow.tableAction || 0,
        udf: scriptRow.udf || 0,
        others: scriptRow.others || 0,
      },
      blocks: {
        total: blockRow.total || 0,
        tableView: blockRow.tableView || 0,
        extNode: blockRow.extNode || 0,
        others: blockRow.others || 0,
      },
      total: totalRow.total || 0,
    }
  }

  /**
   * Get count for a specific extension meta type
   */
  async getExtensionCountByMetaType(
    extensionType: "script" | "block",
    metaType: string,
    status: ExtensionStatus = "all"
  ): Promise<number> {
    const params: any[] = [extensionType]
    let sql = `SELECT COUNT(*) as count FROM ${this.name} WHERE type = ?`

    if (metaType === "others") {
      // Count extensions with no meta or invalid meta
      sql += " AND (meta IS NULL OR meta = '' OR JSON_VALID(meta) = 0)"
    } else {
      // Count extensions with specific meta type
      sql +=
        " AND meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = ?"
      params.push(metaType)
    }

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res[0]?.count || 0
  }

  /**
   * Get extensions by meta type (including "others" for empty extensions)
   */
  async getExtensionsByMetaType(
    extensionType: "script" | "block",
    metaType: string,
    status: ExtensionStatus = "all"
  ): Promise<IExtension[]> {
    const params: any[] = [extensionType]
    let sql = `SELECT * FROM ${this.name} WHERE type = ?`

    if (metaType === "others") {
      // Get extensions with no meta or invalid meta
      sql += " AND (meta IS NULL OR meta = '' OR JSON_VALID(meta) = 0)"
    } else {
      // Get extensions with specific meta type
      sql +=
        " AND meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = ?"
      params.push(metaType)
    }

    if (status === "enabled") {
      sql += " AND enabled = ?"
      params.push(1)
    } else if (status === "disabled") {
      sql += " AND enabled = ?"
      params.push(0)
    }

    const res = await this.dataSpace.exec2(sql, params)
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Override add method to ensure slug uniqueness
   */
  async add(
    data: Partial<IExtension>,
    db = this.dataSpace.db
  ): Promise<IExtension> {
    // If slug is provided, ensure it's unique
    if (data.slug) {
      data.slug = await this.generateUniqueSlug(data.slug)
    }

    return super.add(data, db)
  }

  /**
   * Fix duplicate slugs in existing extensions
   * This method should be called during migration to ensure all existing extensions have unique slugs
   */
  async fixDuplicateSlugs(): Promise<void> {
    // Get all extensions grouped by slug to find duplicates
    const sql = `
      SELECT slug, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM ${this.name}
      WHERE slug IS NOT NULL AND slug != ''
      GROUP BY slug
      HAVING count > 1
    `
    const duplicates = await this.dataSpace.exec2(sql)

    for (const duplicate of duplicates) {
      const ids = duplicate.ids.split(",")
      const baseSlug = duplicate.slug

      // Keep the first extension with the original slug, update the rest
      for (let i = 1; i < ids.length; i++) {
        const newSlug = await this.generateUniqueSlug(baseSlug)
        await this.dataSpace.exec2(
          `UPDATE ${this.name} SET slug = ? WHERE id = ?`,
          [newSlug, ids[i]]
        )
      }
    }
  }

  /**
   * Install extension from raw TypeScript/TSX code.
   * Requires compileExtension to be injected via context.
   *
   * For tableView extensions with a bound tableId, this method also creates
   * a view instance in the eidos__view table so the view appears in the table.
   *
   * @param code - Raw TypeScript/TSX code
   * @param id - Optional extension ID
   * @param enabled - Whether to enable immediately
   * @returns The installed extension
   */
  async installFromCode(
    code: string,
    id?: string,
    enabled: boolean = true
  ): Promise<IExtension> {
    const compileExtension = this.dataSpace.context.compileExtension
    if (!compileExtension) {
      throw new Error(
        "compileExtension not available. Ensure context.compileExtension is injected."
      )
    }

    // Use injected compiler
    const { compiledCode, meta, type, name, description, slugPrefix } =
      await compileExtension(code)

    // Generate ID and slug
    const { getUuid } = await import("@/lib/utils")
    const extensionId = id || getUuid()
    const shortId = extensionId.slice(-8)
    const slug = await this.generateUniqueSlug(`${slugPrefix}-${shortId}`)

    // Construct extension object
    const extension: IExtension = {
      id: extensionId,
      slug,
      name,
      description,
      type,
      version: "0.0.1",
      code: compiledCode,
      ts_code: code,
      meta,
      enabled,
    }

    // Save extension to database
    const savedExtension = await this.add(extension)

    // For tableView extensions with tableId binding, create a view instance
    if (meta?.type === "tableView" && meta.tableView?.tableId) {
      const tableId = meta.tableView.tableId
      const viewType = meta.tableView.type || "custom"
      const viewName = meta.tableView.title || name

      // Check if a view for this extension already exists
      const existingViews = await this.dataSpace.view.list({
        table_id: tableId,
      })
      const existingView = existingViews.find(
        (v) =>
          v.type === `ext__${viewType}` &&
          v.properties?.extensionId === extensionId
      )

      if (!existingView) {
        // Create a new view instance for this table
        const { getRawTableNameById } = await import("@/lib/utils")
        const tableName = getRawTableNameById(tableId)

        await this.dataSpace.view.add({
          id: getUuid(),
          name: viewName,
          type: `ext__${viewType}`,
          table_id: tableId,
          query: `SELECT * FROM ${tableName}`,
          properties: {
            extensionId: extensionId,
          },
        })
      }
    }

    return savedExtension
  }
}
