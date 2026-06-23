import { TreeTableName } from "../../sqlite/const"
import type { ITreeNode } from "../../types/ITreeNode"
import { createTriggersForFields } from "../../sqlite/sql-meta-table-trigger"

import { extractIdFromShortId, getRawTableNameById, uuidv7 } from "@/lib/utils"

import type { BaseTable } from "../base"
import { BaseTableImpl } from "../base"

export class BaseTreeTable
  extends BaseTableImpl
  implements BaseTable<ITreeNode>
{
  name = TreeTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${TreeTableName} (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    parent_id TEXT NULL,
    is_pinned BOOLEAN DEFAULT 0,
    is_full_width BOOLEAN DEFAULT 0,
    is_locked BOOLEAN DEFAULT 0,
    icon TEXT NULL,
    cover TEXT NULL,
    is_deleted BOOLEAN DEFAULT 0,
    hide_properties BOOLEAN DEFAULT 0,
    ref TEXT NULL,
    position REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- Note: Unique index is NOT created automatically here.
  -- It's created when user explicitly enables node name uniqueness
  -- via enableNameUniqueness() which handles duplicate migration first.

  ${createTriggersForFields(
    TreeTableName,
    [
      "id",
      "name",
      "type",
      "parent_id",
      "is_pinned",
      "is_full_width",
      "is_locked",
      "icon",
      "cover",
      "is_deleted",
      "hide_properties",
      "ref",
      "position",
      "created_at",
      "updated_at",
    ],
    "all"
  )}
  `

  getNextRowId = async () => {
    const res = await this.dataSpace.exec2(
      `SELECT max(rowid) as maxId from ${TreeTableName};`
    )
    return res[0].maxId + 1
  }

  async add(
    data: ITreeNode & { _skipAutoRename?: boolean },
    db = this.dataSpace.db
  ): Promise<ITreeNode> {
    // Generate ID if not provided
    if (!data.id) {
      data.id = uuidv7().split("-").join("")
    }

    // Ensure name is unique by auto-appending suffix if needed if uniqueness is enabled
    // _skipAutoRename is used by Node API when it has already checked for existence
    if (!data._skipAutoRename && data.name && data.name.trim() !== "") {
      const isEnabled = await this.isNameUniquenessEnabled()
      if (isEnabled) {
        data.name = await this.ensureUniqueName(data.name, data.parent_id)
      }
    }

    const nextPosition = await this.getNextRowId()
    try {
      await this.dataSpace.syncExec2(
        `INSERT INTO ${TreeTableName} (id,name,type,parent_id,position,hide_properties,ref,icon) VALUES (? , ? , ? , ?,?,?,?,?);`,
        [
          data.id,
          data.name,
          data.type,
          data.parent_id,
          nextPosition,
          data.hide_properties ?? 0,
          data.ref ?? null,
          data.icon ?? null,
        ],
        db as any
      )
    } catch (error: any) {
      console.error("[TreeTable] Error adding node:", error)
      // If unique constraint violation, provide a more helpful error
      if (error.message?.includes("UNIQUE constraint failed")) {
        throw new Error(
          `A node named "${data.name}" already exists in this location. ` +
            `Please enable "Node Name Uniqueness" in settings to auto-rename duplicates.`
        )
      }
      throw error
    }
    return Promise.resolve({
      ...data,
      position: nextPosition,
    })
  }

  async get(id: string): Promise<ITreeNode | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${TreeTableName} where id = ?;`,
      [id]
    )
    if (res.length === 0) {
      return null
    }
    return res[0] as ITreeNode
  }

  async updateName(id: string, name: string): Promise<boolean> {
    try {
      // Check name uniqueness if name is not empty and uniqueness is enabled
      if (name && name.trim() !== "") {
        const isEnabled = await this.isNameUniquenessEnabled()
        if (isEnabled) {
          const node = await this.get(id)
          if (node) {
            const isUnique = await this.isNameUnique(name, node.parent_id, id)
            if (!isUnique) {
              throw new Error(
                `A node named "${name}" already exists in this location`
              )
            }
          }
        }
      }

      const old = await this.get(id)
      try {
        await this.dataSpace.db.setMessage(
          `rename: "${old?.name ?? id}" -> "${name}"`
        )
      } catch {}
      await this.dataSpace.exec2(
        `UPDATE ${TreeTableName} SET name = ? WHERE id = ?;`,
        [name, id]
      )
      return Promise.resolve(true)
    } catch (error) {
      throw error
    }
  }

  async pin(id: string, is_pinned: boolean): Promise<boolean> {
    await this.dataSpace.exec2(
      `UPDATE ${TreeTableName} SET is_pinned = ? WHERE id = ?;`,
      [is_pinned, id]
    )
    return Promise.resolve(true)
  }

  async del(id: string, db = this.dataSpace.db): Promise<boolean> {
    await this.dataSpace.syncExec2(
      `DELETE FROM ${TreeTableName} WHERE id = ?`,
      [id],
      db
    )
    return true
  }

  // @deprecated Proxy can't pass to main thread
  makeProxyRow(row: any): ITreeNode {
    const dataSpace = this.dataSpace
    return new Proxy(row, {
      get(target, p, receiver) {
        if (p === "children") {
          return []
        }
        return Reflect.get(target, p, receiver)
      },
      set(target, p: string, value, receiver) {
        dataSpace.exec(`UPDATE ${TreeTableName} SET ${p} = ? WHERE id = ?;`, [
          value,
          target.id,
        ])
        return Reflect.set(target, p, value, receiver)
      },
    })
  }

  async query(qs: {
    query?: string
    withSubNode?: boolean
  }): Promise<ITreeNode[]> {
    const { query, withSubNode } = qs
    let sql = `SELECT * FROM ${TreeTableName} `
    if (query) {
      sql += ` WHERE name like ?`
    }
    if (query && !withSubNode) {
      sql += ` AND parent_id is null`
    }

    sql += ` ORDER BY position DESC;`
    const bind = query ? [`%${query}%`] : undefined
    const res = await this.dataSpace.exec2(sql, bind)
    return res.map((row: any) => row)
  }

  async moveIntoTable(
    id: string,
    tableId: string,
    parentId?: string
  ): Promise<boolean> {
    try {
      await this.dataSpace.db.transaction(async (db) => {
        // update parent_id
        await this.dataSpace.syncExec2(
          `UPDATE ${TreeTableName} SET parent_id = ? WHERE id = ?;`,
          [tableId, id],
          db
        )
        const tableName = getRawTableNameById(tableId)
        const title = (await this.get(id))?.name
        if (parentId) {
          const parentTableName = getRawTableNameById(parentId)
          await this.dataSpace.syncExec2(
            `DELETE FROM ${parentTableName} WHERE _id = ?;`,
            [extractIdFromShortId(id)],
            db
          )
        }
        await this.dataSpace.syncExec2(
          `INSERT INTO ${tableName} (_id,title) VALUES (?,?);`,
          [extractIdFromShortId(id), title],
          db
        )
      })
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
  }

  async duplicateNode(id: string): Promise<ITreeNode | null> {
    const node = await this.get(id)
    if (!node) return null
    const newId = uuidv7().split("-").join("")

    // Generate a unique name for the duplicate
    let newName = node.name + " Copy"
    let suffix = 1
    while (!(await this.isNameUnique(newName, node.parent_id))) {
      newName = `${node.name} Copy (${suffix})`
      suffix++
      // Prevent infinite loop
      if (suffix > 1000) {
        newName = `${node.name} Copy ${uuidv7().slice(0, 8)}`
        break
      }
    }

    await this.add({
      ...node,
      id: newId,
      name: newName,
    })
    return this.getNode(newId)
  }

  /**
   * id: uuid without '-'
   * miniId: last 8 char of id. most of time, it's enough to identify a node
   * @param idOrMiniId
   */
  async getNode(idOrMiniId: string): Promise<ITreeNode | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${TreeTableName} WHERE id = ? OR substr(id, -8) = ?;`,
      [idOrMiniId, idOrMiniId]
    )
    return res.length > 0 ? res[0] : null
  }

  /**
   * Check if the unique index exists
   * This is the source of truth for whether node name uniqueness is enabled
   */
  async hasUniqueIndex(): Promise<boolean> {
    const res = await this.dataSpace.exec2(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tree_name_unique'`
    )
    return res.length > 0
  }

  /**
   * Check if node name uniqueness is enabled for this space
   * Alias for hasUniqueIndex() for semantic clarity
   */
  async isNameUniquenessEnabled(): Promise<boolean> {
    return this.hasUniqueIndex()
  }

  /**
   * Find duplicate node names in the tree
   * Returns groups of nodes with the same name under the same parent
   */
  async findDuplicateNames(): Promise<
    Array<{
      parent_id: string | null
      name: string
      count: number
      ids: string[]
    }>
  > {
    const sql = `
      SELECT 
        COALESCE(parent_id, '') as parent_key,
        parent_id,
        name,
        COUNT(*) as count,
        GROUP_CONCAT(id) as ids
      FROM ${TreeTableName}
      WHERE is_deleted = 0
      GROUP BY COALESCE(parent_id, ''), name
      HAVING COUNT(*) > 1
    `
    const res = await this.dataSpace.exec2(sql)
    return res.map((row: any) => ({
      parent_id: row.parent_id || null,
      name: row.name,
      count: row.count,
      ids: row.ids.split(","),
    }))
  }

  /**
   * Auto-rename duplicate nodes by adding (1), (2), etc.
   * Returns the list of renamed nodes
   */
  async migrateDuplicateNames(): Promise<
    Array<{ id: string; oldName: string; newName: string }>
  > {
    const duplicates = await this.findDuplicateNames()
    const renamed: Array<{ id: string; oldName: string; newName: string }> = []

    for (const group of duplicates) {
      // Sort by id to ensure consistent ordering
      const sortedIds = group.ids.sort()
      // Skip the first one, rename the rest
      for (let i = 1; i < sortedIds.length; i++) {
        const id = sortedIds[i]
        const newName = `${group.name} (${i})`
        await this.updateName(id, newName)
        renamed.push({ id, oldName: group.name, newName })
      }
    }

    return renamed
  }

  /**
   * Enable node name uniqueness for this space
   * 1. Migrate duplicate names
   * 2. Create unique index
   */
  async enableNameUniqueness(): Promise<{
    success: boolean
    renamed?: Array<{ id: string; oldName: string; newName: string }>
    error?: string
  }> {
    try {
      // Check if index already exists
      const hasIndex = await this.hasUniqueIndex()
      if (hasIndex) {
        return { success: true, renamed: [] }
      }

      // First, migrate duplicate names
      const renamed = await this.migrateDuplicateNames()

      // Create the unique index
      await this.dataSpace.exec2(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_name_unique ON ${TreeTableName}(
          COALESCE(parent_id, ''), 
          name
        ) WHERE is_deleted = 0
      `)

      return { success: true, renamed }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Disable node name uniqueness for this space
   * This drops the unique index
   */
  async disableNameUniqueness(): Promise<void> {
    try {
      await this.dataSpace.exec2(`DROP INDEX IF EXISTS idx_tree_name_unique`)
    } catch (error) {
      console.error("Error dropping unique index:", error)
    }
  }

  /**
   * Try to create unique index if no duplicates exist
   * This is safe to call on space initialization - it will only create
   * the index if there are no conflicting records.
   * Returns true if index was created or already exists
   */
  async tryCreateUniqueIndex(): Promise<boolean> {
    // Check if index already exists
    const hasIndex = await this.hasUniqueIndex()
    if (hasIndex) return true

    // Check for duplicates before attempting to create index
    const duplicates = await this.findDuplicateNames()
    if (duplicates.length > 0) {
      // Cannot create index - duplicates exist
      return false
    }

    // Safe to create index
    try {
      await this.dataSpace.exec2(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_name_unique ON ${TreeTableName}(
          COALESCE(parent_id, ''), 
          name
        ) WHERE is_deleted = 0
      `)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if a node name is unique under the given parent
   */
  async isNameUnique(
    name: string,
    parentId: string | null | undefined,
    excludeId?: string
  ): Promise<boolean> {
    // Empty names are always considered unique (no constraint)
    if (!name || name.trim() === "") return true

    try {
      let sql = `
        SELECT COUNT(*) as count FROM ${TreeTableName}
        WHERE name = ? AND is_deleted = 0
      `
      const bind: any[] = [name]

      if (parentId) {
        sql += ` AND parent_id = ?`
        bind.push(parentId)
      } else {
        sql += ` AND parent_id IS NULL`
      }

      if (excludeId) {
        sql += ` AND id != ?`
        bind.push(excludeId)
      }

      const res = await this.dataSpace.exec2(sql, bind)
      return res[0].count === 0
    } catch (error) {
      console.error("Error checking name uniqueness:", error)
      // If we can't check uniqueness, assume it's not unique to be safe
      // This will trigger the duplicate name handling logic
      return false
    }
  }

  /**
   * Ensure a node name is unique by appending (1), (2), etc. if needed
   * This is used when creating new nodes to avoid name conflicts
   */
  async ensureUniqueName(
    name: string,
    parentId: string | null | undefined
  ): Promise<string> {
    // Empty names are returned as-is
    if (!name || name.trim() === "") return name

    // Check if name is already unique
    if (await this.isNameUnique(name, parentId)) {
      return name
    }

    // Try to extract any existing suffix like (1), (2)
    const baseNameMatch = name.match(/^(.*)\s*\((\d+)\)$/)
    const baseName = baseNameMatch ? baseNameMatch[1].trim() : name
    let suffix = 1

    // Find a unique name by incrementing suffix
    let newName = `${baseName} (${suffix})`
    while (!(await this.isNameUnique(newName, parentId))) {
      suffix++
      newName = `${baseName} (${suffix})`
      // Safety limit to prevent infinite loop
      if (suffix > 1000) {
        newName = `${baseName} ${uuidv7().slice(0, 8)}`
        break
      }
    }

    return newName
  }
}
