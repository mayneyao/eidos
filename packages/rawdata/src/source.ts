/**
 * Source Data Storage Module
 * Stores original API responses for debugging and custom transformation
 */

import type { IRawDataDatabase } from "./types.js"

export interface RawDataRecord {
  id: string // Composite key: source#entity_id
  source: string // Adapter source (e.g., 'weread.qq.com/shelf')
  entity_type: string // Entity type (e.g., 'book', 'author', 'shelf')
  entity_id: string // Platform-specific ID
  data: string // Original JSON data
  checksum?: string // Data checksum for change detection
  fetched_at: number // Fetch timestamp
  transformed_at?: number // Last transformation timestamp
  transform_version?: number // Transformation schema version
}

export class SourceDataStore {
  constructor(private db: IRawDataDatabase) {}

  /**
   * Store or update raw data
   */
  async upsert(record: Omit<RawDataRecord, "id">): Promise<boolean> {
    const id = `${record.source}#${record.entity_type}#${record.entity_id}`
    const {
      source,
      entity_type,
      entity_id,
      data,
      checksum,
      fetched_at,
      transformed_at,
      transform_version,
    } = record

    const stmt = this.db.prepare(`
      INSERT INTO data 
        (id, source, entity_type, entity_id, data, checksum, fetched_at, transformed_at, transform_version)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        checksum = excluded.checksum,
        fetched_at = excluded.fetched_at,
        transformed_at = NULL,
        transform_version = 0
      WHERE excluded.checksum != data.checksum
    `)

    const result = stmt.run(
      id,
      source,
      entity_type,
      entity_id,
      data,
      checksum ?? null,
      fetched_at ?? Date.now(),
      transformed_at ?? null,
      transform_version ?? 0
    )

    // Return true if data was changed (inserted or updated)
    return result.changes > 0
  }

  /**
   * Batch store raw data
   */
  async upsertMany(records: Omit<RawDataRecord, "id">[]): Promise<number> {
    let changed = 0
    for (const record of records) {
      if (await this.upsert(record)) {
        changed++
      }
    }
    return changed
  }

  /**
   * Get raw data by ID
   */
  get(id: string): RawDataRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM data WHERE id = ?
    `)
    const row = stmt.get(id)
    return row ? this.parseRow(row) : undefined
  }

  /**
   * Get raw data by source and entity
   */
  getByEntity(
    source: string,
    entityType: string,
    entityId: string
  ): RawDataRecord | undefined {
    return this.get(`${source}#${entityType}#${entityId}`)
  }

  /**
   * List raw data by source
   */
  listBySource(
    source: string,
    options?: {
      entityType?: string
      limit?: number
      offset?: number
      untransformed?: boolean
    }
  ): RawDataRecord[] {
    let sql = `SELECT * FROM data WHERE source = ?`
    const params: any[] = [source]

    if (options?.entityType) {
      sql += ` AND entity_type = ?`
      params.push(options.entityType)
    }

    if (options?.untransformed) {
      sql += ` AND transformed_at IS NULL`
    }

    sql += ` ORDER BY fetched_at DESC`

    if (options?.limit) {
      sql += ` LIMIT ?`
      params.push(options.limit)
    }

    if (options?.offset) {
      sql += ` OFFSET ?`
      params.push(options.offset)
    }

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params)
    return rows.map((r) => this.parseRow(r))
  }

  /**
   * Get all sources
   */
  getSources(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT source FROM data ORDER BY source
    `)
    const rows = stmt.all()
    return rows.map((r: any) => r.source)
  }

  /**
   * Get entity types for a source
   */
  getEntityTypes(source: string): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT entity_type FROM data 
      WHERE source = ? ORDER BY entity_type
    `)
    const rows = stmt.all(source)
    return rows.map((r: any) => r.entity_type)
  }

  /**
   * Mark as transformed
   */
  markTransformed(id: string, version: number = 1): void {
    const stmt = this.db.prepare(`
      UPDATE data 
      SET transformed_at = ?, transform_version = ?
      WHERE id = ?
    `)
    stmt.run(Date.now(), version, id)
  }

  /**
   * Get untransformed records
   */
  getUntransformed(source?: string, limit?: number): RawDataRecord[] {
    let sql = `SELECT * FROM data WHERE transformed_at IS NULL`
    const params: any[] = []

    if (source) {
      sql += ` AND source = ?`
      params.push(source)
    }

    sql += ` ORDER BY fetched_at ASC`

    if (limit) {
      sql += ` LIMIT ?`
      params.push(limit)
    }

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params)
    return rows.map((r) => this.parseRow(r))
  }

  /**
   * Delete old raw data
   */
  deleteOlderThan(source: string, beforeTimestamp: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM data 
      WHERE source = ? AND fetched_at < ?
    `)
    const result = stmt.run(source, beforeTimestamp)
    return result.changes
  }

  /**
   * Get statistics
   */
  getStats(source?: string): {
    total: number
    untransformed: number
    byEntityType: Record<string, number>
  } {
    let sql = `SELECT entity_type, COUNT(*) as count, 
      SUM(CASE WHEN transformed_at IS NULL THEN 1 ELSE 0 END) as untransformed
      FROM data`

    if (source) {
      sql += ` WHERE source = ?`
    }

    sql += ` GROUP BY entity_type`

    const stmt = this.db.prepare(sql)
    const rows = source ? stmt.all(source) : stmt.all()

    const byEntityType: Record<string, number> = {}
    let total = 0
    let untransformed = 0

    for (const row of rows) {
      byEntityType[row.entity_type] = row.count
      total += row.count
      untransformed += row.untransformed
    }

    return { total, untransformed, byEntityType }
  }

  private parseRow(row: any): RawDataRecord {
    return {
      id: row.id,
      source: row.source,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      data: row.data,
      checksum: row.checksum,
      fetched_at: row.fetched_at,
      transformed_at: row.transformed_at,
      transform_version: row.transform_version,
    }
  }
}
