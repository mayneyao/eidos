import { ExtensionTableName } from "../sqlite/const";
import { createUpdateTriggerForFields } from "../sqlite/sql-meta-table-trigger";
import type {
  ExtensionStatus,
  IExtension,
  TableViewMeta,
  UDFMeta,
  IBindings,
} from "../types/IExtension";

import type { BaseTable } from "./base";
import { BaseTableImpl } from "./base";

// Re-export types for backward compatibility
export type { ExtensionStatus, IExtension, TableViewMeta };

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
  implements BaseTable<IExtension> {
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

    ${createUpdateTriggerForFields(this.name, [
    'id', 'slug', 'name', 'type', 'code', 'enabled', 'icon', 'meta'
  ])}

`

  JSONFields: string[] = [
    "meta",
    "bindings",
  ]

  static isUDFExtension(extension: IExtension) {
    return extension.type === 'script' && extension.meta?.type === 'udf'
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

  async getTableViewExtensionInfoByExtType(viewType: string): Promise<IExtension<TableViewMeta>[]> {
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
      await this.dataSpace.exec2(`DELETE FROM ${this.name} WHERE id = ?`, [id])
      const chatIds = await this.dataSpace.chat.getChatIdsByProjectId(id)
      await Promise.all(chatIds.map(chatId => this.dataSpace.chat.del(chatId)))
    })
    return true
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
  async getBlockExtensions(status: ExtensionStatus = "enabled"): Promise<IExtension[]> {
    const params: any[] = ['block']
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
  async getExtNodeExtensions(status: ExtensionStatus = "enabled"): Promise<IExtension[]> {
    const params: any[] = ['block', 'extNode']
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
  async getExtNodeExtensionsByHandlerType(type: string, status: ExtensionStatus = "enabled"): Promise<IExtension[]> {
    const params: any[] = ['block', 'extNode', `%"${type}"%`]
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
  async getScriptExtensions(status: ExtensionStatus = "all"): Promise<IExtension[]> {
    const params: any[] = ['script']
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
  async getToolExtensions(status: ExtensionStatus = "enabled"): Promise<IExtension[]> {
    const params: any[] = ['script', 'tool']
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
   * Get TableAction extensions by status
   */
  async getTableActionExtensions(status: ExtensionStatus = "enabled"): Promise<IExtension[]> {
    const params: any[] = ['script', 'tableAction']
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
   * Get UDF (User Defined Function) extensions by status
   */
  async getUDFExtensions(status: ExtensionStatus = "enabled"): Promise<IExtension<UDFMeta>[]> {
    const params: any[] = ['script', 'udf']
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
  async getExtensionsByMarketplaceId(marketplaceId: string): Promise<IExtension[]> {
    const sql = `SELECT * FROM ${this.name} WHERE marketplace_id = ?`
    const res = await this.dataSpace.exec2(sql, [marketplaceId])
    return res.map((item: any) => this.toJson(item))
  }

  /**
   * Get extensions by type and status
   */
  async getExtensionsByType(type: "script" | "block", status: ExtensionStatus = "enabled"): Promise<IExtension[]> {
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
  async searchExtensions(query: string, status: ExtensionStatus = "all"): Promise<IExtension[]> {
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
   * Get extensions with bindings
   */
  async getExtensionsWithBindings(status: ExtensionStatus = "enabled"): Promise<IExtension[]> {
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
  async getExtensionCount(type?: "script" | "block", status: ExtensionStatus = "all"): Promise<number> {
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
  async getExtensionStats(status: ExtensionStatus = "all"): Promise<ExtensionStats> {
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
    const scriptStats = await this.dataSpace.exec2(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'tool' THEN 1 ELSE 0 END) as tool,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'tableAction' THEN 1 ELSE 0 END) as tableAction,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'udf' THEN 1 ELSE 0 END) as udf,
        SUM(CASE WHEN meta IS NULL OR meta = '' OR JSON_VALID(meta) = 0 THEN 1 ELSE 0 END) as others
      FROM ${this.name}
      ${whereClause} AND type = 'script'
    `, params)

    // Get block statistics
    const blockStats = await this.dataSpace.exec2(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'tableView' THEN 1 ELSE 0 END) as tableView,
        SUM(CASE WHEN meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = 'extNode' THEN 1 ELSE 0 END) as extNode,
        SUM(CASE WHEN meta IS NULL OR meta = '' OR JSON_VALID(meta) = 0 THEN 1 ELSE 0 END) as others
      FROM ${this.name}
      ${whereClause} AND type = 'block'
    `, params)

    // Get total count
    const totalStats = await this.dataSpace.exec2(`
      SELECT COUNT(*) as total FROM ${this.name} ${whereClause}
    `, params)

    const scriptRow = scriptStats[0] || { total: 0, tool: 0, tableAction: 0, udf: 0, others: 0 }
    const blockRow = blockStats[0] || { total: 0, tableView: 0, extNode: 0, others: 0 }
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
      sql += " AND meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = ?"
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
      sql += " AND meta IS NOT NULL AND meta != '' AND JSON_VALID(meta) = 1 AND JSON_EXTRACT(meta, '$.type') = ?"
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
  async add(data: Partial<IExtension>, db = this.dataSpace.db): Promise<IExtension> {
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
      const ids = duplicate.ids.split(',')
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
}
