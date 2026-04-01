import type { DataSpace } from "../data-space"
import { rewriteQueryWithRowId } from "../sqlite/sql-view-query"

/**
 * Threshold for automatic FTS rebuild when adding columns.
 * Tables with row count exceeding this will skip auto-rebuild
 * and prompt user to manually rebuild FTS to avoid performance issues.
 */
const AUTO_REBUILD_ROW_THRESHOLD = 10000

export class TableFullTextSearch {
  constructor(
    private dataspace: DataSpace,
    private enableFTS: boolean = false
  ) {}

  async createDynamicFTS(
    tableName: string,
    temporary: boolean = false,
    inTransaction: boolean = false
  ) {
    const tableInfo = await this.dataspace.db.selectObjects(
      `PRAGMA table_info(${tableName})`
    )

    if (!this.enableFTS) {
      throw new Error("Full text search is not supported in web mode")
    }

    const columns = tableInfo
      .map((col: any) => col.name)
      .filter(
        (name: any) =>
          name.toLowerCase() !== "rowid" &&
          !name.endsWith("__vec") &&
          !name.endsWith("__vec_meta")
      )
      .join(", ")

    const ftsTableName = `fts_${tableName}`
    const createFtsSql = `
        CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTableName}
        USING fts5(${columns}, content='${tableName}', content_rowid='rowid', tokenize = 'simple');
        `

    try {
      if (!inTransaction) {
        await this.dataspace.db.exec("BEGIN IMMEDIATE TRANSACTION")
      }

      await this.dataspace.db.exec(createFtsSql)
      await this.dataspace.db.exec(
        `INSERT INTO ${ftsTableName}(${ftsTableName}) VALUES('rebuild');`
      )

      if (!temporary) {
        await this.createTriggers(tableName, columns)
      }

      if (!inTransaction) {
        await this.dataspace.db.exec("COMMIT")
      }
    } catch (error) {
      if (!inTransaction) {
        await this.dataspace.db.exec("ROLLBACK")
      }
      throw error
    }
  }

  private async createTriggers(tableName: string, columns: string) {
    const ftsTableName = `fts_${tableName}`
    const triggerSqls = [
      `CREATE TRIGGER IF NOT EXISTS fts_${tableName}_ai AFTER INSERT ON ${tableName} BEGIN
                INSERT INTO ${ftsTableName}(rowid, ${columns}) 
                VALUES (new.rowid, ${columns
                  .split(",")
                  .map((c) => `new.${c.trim()}`)
                  .join(",")});
            END;`,
      `CREATE TRIGGER IF NOT EXISTS fts_${tableName}_ad AFTER DELETE ON ${tableName} BEGIN
                INSERT INTO ${ftsTableName}(${ftsTableName}, rowid) VALUES('delete', old.rowid);
            END;`,
      `CREATE TRIGGER IF NOT EXISTS fts_${tableName}_au AFTER UPDATE ON ${tableName} BEGIN
                INSERT INTO ${ftsTableName}(${ftsTableName}, rowid) VALUES('delete', old.rowid);
                INSERT INTO ${ftsTableName}(rowid, ${columns})
                VALUES (new.rowid, ${columns
                  .split(",")
                  .map((c) => `new.${c.trim()}`)
                  .join(",")});
            END;`,
    ]

    for (const sql of triggerSqls) {
      await this.dataspace.db.exec(sql)
    }
  }

  async search(
    tableName: string,
    query: string,
    viewId: string,
    page: number = 1,
    pageSize: number = 20
  ) {
    if (!this.enableFTS) {
      throw new Error("Full text search is not supported in web mode")
    }

    const startTime = performance.now()
    const ftsTableName = `fts_${tableName}`
    const offset = (page - 1) * pageSize

    try {
      const hasFTS = await this.hasFTS(tableName)
      if (!hasFTS) {
        throw new Error(`FTS table ${ftsTableName} does not exist.`)
      }

      const view = await this.dataspace.view.get(viewId)
      if (!view?.query) {
        throw new Error(`View ${viewId} not found or has no query`)
      }

      const viewQuery = rewriteQueryWithRowId(view.query)
      const countSql = `
                SELECT COUNT(*) AS total
                FROM (${viewQuery}) ov
                JOIN ${ftsTableName} fts ON ov.rowid = fts.rowid
                WHERE ${ftsTableName} MATCH ?
            `
      const [{ total }] = await this.dataspace.db.selectObjects(countSql, [
        query,
      ])

      if (total === 0) {
        return {
          results: [],
          searchTime: -1,
          totalMatches: 0,
          currentPage: page,
          totalPages: 0,
        }
      }

      const tableInfo = await this.dataspace.db.selectObjects(
        `PRAGMA table_info(${tableName})`
      )
      const columns = tableInfo
        .map((col: any) => col.name)
        .filter((name: any) => name.toLowerCase() !== "rowid")

      const highlightSelects = columns
        .map(
          (col) =>
            `highlight(${ftsTableName}, ${columns.indexOf(col)}, '<mark>', '</mark>') as highlight_${col}`
        )
        .join(", ")

      const matchSql = `
                WITH original_view AS (
                    SELECT 
                        ${tableName}.rowid,
                        v.*,
                        ROW_NUMBER() OVER () as original_order,
                        ROW_NUMBER() OVER () - 1 as row_index
                    FROM (${view.query}) v
                    JOIN ${tableName} ON ${tableName}._id = v._id
                ),
                matched_rows AS (
                    SELECT 
                        fts.rowid,
                        ${highlightSelects}
                    FROM ${ftsTableName} fts
                    WHERE ${ftsTableName} MATCH ?
                )
                SELECT v.*, m.*
                FROM original_view v
                JOIN matched_rows m ON m.rowid = v.rowid
                ORDER BY v.original_order
                LIMIT ? OFFSET ?
            `

      const results = await this.dataspace.db.selectObjects(matchSql, [
        query,
        pageSize,
        offset,
      ])

      const processedResults = results.map((row: any) => {
        const matches = []
        for (const col of columns) {
          const highlightKey = `highlight_${col}`
          const highlight = row[highlightKey]

          if (highlight && highlight.includes("<mark>")) {
            matches.push({
              column: col,
              snippet: highlight,
            })
          }
          delete row[highlightKey]
        }

        const rowIndex = row.row_index
        delete row.row_index
        delete row.original_order

        return {
          row,
          matches,
          rowIndex,
        }
      })

      const endTime = performance.now()
      const searchTime = Math.round(endTime - startTime)

      return {
        results: processedResults,
        searchTime,
        totalMatches: total,
        currentPage: page,
        totalPages: Math.ceil(total / pageSize),
      }
    } catch (error) {
      throw error
    }
  }

  async updateTrigger(tableName: string, toDeleteColumns: string[]) {
    try {
      const hasFTS = await this.hasFTS(tableName)
      if (!hasFTS) {
        return
      }
    } catch (error) {
      console.warn(`Skip error updating trigger for table ${tableName}:`, error)
      return
    }

    // Check if FTS schema needs rebuild (e.g., columns mismatch)
    const needsRebuild = await this.needsRebuild(tableName)
    if (needsRebuild) {
      await this.rebuildFTS(tableName)
      return
    }

    const triggerNames = [
      `fts_${tableName}_ai`,
      `fts_${tableName}_ad`,
      `fts_${tableName}_au`,
    ]
    for (const triggerName of triggerNames) {
      await this.dataspace.db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`)
    }
    const tableInfo = await this.dataspace.db.selectObjects(
      `PRAGMA table_info(${tableName})`
    )
    const columns = tableInfo
      .map((col: any) => col.name)
      .filter(
        (name: any) =>
          name.toLowerCase() !== "rowid" && !toDeleteColumns.includes(name)
      )
      .join(", ")

    await this.createTriggers(tableName, columns)
  }

  async clearFTS(tableName: string) {
    if (!this.enableFTS) {
      throw new Error("Full text search is not supported in web mode")
    }

    const ftsTableName = `fts_${tableName}`

    const tableExists = await this.dataspace.db.selectObjects(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [ftsTableName]
    )

    if (tableExists.length === 0) {
      console.warn(`FTS table ${ftsTableName} does not exist. no need to clear`)
      return
    }

    await this.dataspace.db.exec(
      `INSERT INTO ${ftsTableName}(${ftsTableName}) VALUES('delete-all')`
    )
    console.log(`FTS table ${ftsTableName} has been cleared`)
  }

  /**
   * Drop only FTS triggers without dropping the FTS table.
   * Useful when modifying table schema (e.g., dropping columns).
   */
  async dropFTSTriggers(tableName: string) {
    if (!this.enableFTS) {
      return
    }

    try {
      const hasFTS = await this.hasFTS(tableName)
      if (!hasFTS) {
        return
      }
    } catch (error) {
      return
    }

    const triggerNames = [
      `fts_${tableName}_ai`,
      `fts_${tableName}_ad`,
      `fts_${tableName}_au`,
    ]

    for (const triggerName of triggerNames) {
      await this.dataspace.db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`)
    }
  }

  async dropFTS(tableName: string) {
    if (!this.enableFTS) {
      throw new Error("Full text search is not supported in web mode")
    }

    const ftsTableName = `fts_${tableName}`

    const tableExists = await this.dataspace.db.selectObjects(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [ftsTableName]
    )

    if (tableExists.length === 0) {
      console.warn(`FTS table ${ftsTableName} does not exist. no need to drop`)
      return
    }

    const triggerNames = [
      `fts_${tableName}_ai`,
      `fts_${tableName}_ad`,
      `fts_${tableName}_au`,
    ]

    for (const triggerName of triggerNames) {
      await this.dataspace.db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`)
    }

    await this.dataspace.db.exec(`DROP TABLE IF EXISTS ${ftsTableName}`)
    console.log(
      `FTS table ${ftsTableName} and related triggers have been dropped`
    )
  }

  async hasFTS(tableName: string): Promise<boolean> {
    if (!this.enableFTS) {
      throw new Error("Full text search is not supported in web mode")
    }

    const ftsTableName = `fts_${tableName}`

    try {
      const tableExists = await this.dataspace.db.selectObjects(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [ftsTableName]
      )

      return tableExists.length > 0
    } catch (error) {
      console.error(`Error checking FTS table ${ftsTableName}:`, error)
      throw error
    }
  }

  /**
   * Check if FTS table needs rebuild (e.g., when new columns are added)
   * Compares the columns in the original table with the FTS table
   */
  async needsRebuild(tableName: string): Promise<boolean> {
    if (!this.enableFTS) {
      return false
    }

    try {
      const hasFTS = await this.hasFTS(tableName)
      if (!hasFTS) {
        return false
      }
    } catch (error) {
      return false
    }

    const ftsTableName = `fts_${tableName}`

    // Get columns from original table
    const tableInfo = await this.dataspace.db.selectObjects(
      `PRAGMA table_info(${tableName})`
    )
    const tableColumns = tableInfo
      .map((col: any) => col.name)
      .filter(
        (name: string) =>
          name.toLowerCase() !== "rowid" &&
          !name.endsWith("__vec") &&
          !name.endsWith("__vec_meta")
      )
      .sort()

    // Get columns from FTS table (FTS5 stores column info in sqlite_master)
    const ftsInfo = await this.dataspace.db.selectObjects(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
      [ftsTableName]
    )

    if (ftsInfo.length === 0) {
      return true
    }

    // Parse columns from CREATE VIRTUAL TABLE statement
    const ftsSql = ftsInfo[0].sql as string
    const match = ftsSql.match(/USING fts5\((.+?), content='/)
    if (!match) {
      return true
    }

    const ftsColumns = match[1]
      .split(",")
      .map((c) => c.trim())
      .sort()

    // Compare columns
    if (tableColumns.length !== ftsColumns.length) {
      return true
    }

    for (let i = 0; i < tableColumns.length; i++) {
      if (tableColumns[i] !== ftsColumns[i]) {
        return true
      }
    }

    return false
  }

  /**
   * Get row count of a table (approximate, uses sqlite table stats if available)
   */
  private async getTableRowCount(tableName: string): Promise<number> {
    try {
      const result = await this.dataspace.db.selectObjects(
        `SELECT COUNT(*) as count FROM ${tableName}`
      )
      return result[0]?.count as number
    } catch (error) {
      console.warn(`Failed to get row count for ${tableName}:`, error)
      return 0
    }
  }

  /**
   * Check if auto-rebuild should be skipped for large tables.
   * Returns true if table is small enough for auto-rebuild.
   */
  async shouldAutoRebuild(tableName: string): Promise<boolean> {
    const rowCount = await this.getTableRowCount(tableName)
    return rowCount <= AUTO_REBUILD_ROW_THRESHOLD
  }

  /**
   * Smart FTS schema sync with threshold-based decision.
   * - Small tables (< threshold): auto rebuild
   * - Large tables (>= threshold): notify user to manually rebuild
   * Returns object with rebuild status and message.
   */
  async smartEnsureFTSSchema(tableName: string): Promise<{
    rebuilt: boolean
    skipped: boolean
    message?: string
    rowCount?: number
  }> {
    const needsRebuild = await this.needsRebuild(tableName)
    if (!needsRebuild) {
      return { rebuilt: false, skipped: false }
    }

    const rowCount = await this.getTableRowCount(tableName)
    const canAutoRebuild = rowCount <= AUTO_REBUILD_ROW_THRESHOLD

    if (canAutoRebuild) {
      await this.rebuildFTS(tableName)
      return { rebuilt: true, skipped: false, rowCount }
    } else {
      // Large table: skip auto-rebuild, notify user
      const message = `Table has ${rowCount.toLocaleString()} rows. FTS rebuild skipped to avoid performance impact. Please manually rebuild FTS when convenient.`
      this.dataspace.notify({
        title: "FTS Sync Deferred",
        description: message,
      })
      return { rebuilt: false, skipped: true, message, rowCount }
    }
  }

  /**
   * Ensure FTS table schema is in sync with the original table.
   * Only rebuilds if necessary (when columns have changed).
   * Returns true if rebuild was performed.
   * @deprecated Use smartEnsureFTSSchema for better UX with large tables
   */
  async ensureFTSSchema(tableName: string): Promise<boolean> {
    const needsRebuild = await this.needsRebuild(tableName)
    if (needsRebuild) {
      await this.rebuildFTS(tableName)
      return true
    }
    return false
  }

  async rebuildFTS(tableName: string) {
    if (!this.enableFTS) {
      throw new Error("Full text search is not supported in web mode")
    }

    // Auto-detect if we're already in a transaction
    const alreadyInTransaction = this.dataspace.db.inTransaction

    try {
      if (!alreadyInTransaction) {
        await this.dataspace.db.exec("BEGIN IMMEDIATE TRANSACTION")
      }

      const ftsTableName = `fts_${tableName}`
      const tableExists = await this.dataspace.db.selectObjects(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [ftsTableName]
      )

      if (tableExists.length > 0) {
        await this.dataspace.db.exec(
          `INSERT INTO ${ftsTableName}(${ftsTableName}) VALUES('delete-all')`
        )

        const triggerNames = [
          `fts_${tableName}_ai`,
          `fts_${tableName}_ad`,
          `fts_${tableName}_au`,
        ]

        for (const triggerName of triggerNames) {
          await this.dataspace.db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`)
        }

        await this.dataspace.db.exec(`DROP TABLE IF EXISTS ${ftsTableName}`)
      }

      await this.createDynamicFTS(tableName, false, true)

      if (!alreadyInTransaction) {
        await this.dataspace.db.exec("COMMIT")
      }
    } catch (error) {
      if (!alreadyInTransaction) {
        await this.dataspace.db.exec("ROLLBACK")
      }
      this.dataspace.notify({
        title: "Error",
        description: "Failed to rebuild FTS table",
      })
      throw error
    }
  }
}
