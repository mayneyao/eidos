import { uuidv7 } from "uuidv7"
import {
  SqlQueryBuilder,
  type FindManyOptions,
} from "../sqlite/sql-query-builder"
import { workerStore } from "../rpc"

/**
 * Minimal interface for DataSpace dependency
 * This allows TableClient to work with any class in the DataSpace inheritance chain
 */
interface ITableClientDataSpace {
  db: {
    prepare: (sql: string) => { run: (values: any[]) => void }
  }
  exec2: (sql: string, bind?: any[]) => Promise<any[]>
  undoRedoManager: {
    event: () => void
  }
}

/**
 * Prisma-style Table SDK client for CRUD operations
 *
 * This client operates directly on database column names (e.g., `cl_xxx`)
 * rather than UI display field names for simplicity and performance.
 *
 * @example
 * ```typescript
 * const Users = eidos.currentSpace.tableClient("users")
 *
 * // Create
 * await Users.create({ data: { cl_name: "张三", cl_email: "z@example.com" } })
 *
 * // Read
 * const user = await Users.findUnique({ where: { _id: "rec123" } })
 * const users = await Users.findMany({ where: { cl_age: { gte: 18 } }, take: 50 })
 *
 * // Update
 * await Users.update({ where: { _id: "rec123" }, data: { cl_age: 30 } })
 *
 * // Delete
 * await Users.delete({ where: { _id: "rec123" } })
 * ```
 */
export class TableClient<T extends Record<string, any> = Record<string, any>> {
  constructor(
    private rawTableName: string,
    private dataSpace: ITableClientDataSpace
  ) {}

  // ============ CREATE OPERATIONS ============

  /**
   * Create a single record
   * @param args.data Record data to insert
   * @returns Created record with generated _id and timestamps
   */
  async create(args: { data: T }): Promise<T & { _id: string }> {
    const createData = this.getCreateData(args.data)
    const keys = Object.keys(createData)
    const values = Object.values(createData)
    const placeholders = keys.map(() => "?").join(", ")

    const sql = `INSERT INTO ${this.rawTableName} (${keys.join(", ")}) VALUES (${placeholders})`
    await this.dataSpace.exec2(sql, values)
    this.dataSpace.undoRedoManager.event()

    return createData as T & { _id: string }
  }

  /**
   * Create multiple records in a batch
   * @param args.data Array of records to insert
   * @param args.skipDuplicates If true, skip records that would cause unique constraint violations
   * @returns Array of created records
   */
  async createMany(args: {
    data: T[]
    skipDuplicates?: boolean
  }): Promise<{ count: number }> {
    if (args.data.length === 0) {
      return { count: 0 }
    }

    const createDatas = args.data.map((data) => this.getCreateData(data))
    const keys = Object.keys(createDatas[0])
    const placeholders = keys.map(() => "?").join(", ")

    const insertKeyword = args.skipDuplicates ? "INSERT OR IGNORE" : "INSERT"
    const sql = `${insertKeyword} INTO ${this.rawTableName} (${keys.join(", ")}) VALUES (${placeholders})`

    const stmt = this.dataSpace.db.prepare(sql)
    for (const data of createDatas) {
      stmt.run(Object.values(data))
    }

    this.dataSpace.undoRedoManager.event()
    return { count: createDatas.length }
  }

  // ============ READ OPERATIONS ============

  /**
   * Find a unique record by _id
   * @param args.where Where clause with _id
   * @returns Found record or null
   */
  async findUnique(args: { where: { _id: string } }): Promise<T | null> {
    const sql = `SELECT * FROM ${this.rawTableName} WHERE _id = ? LIMIT 1`
    const rows = await this.dataSpace.exec2(sql, [args.where._id])
    return rows.length > 0 ? (rows[0] as T) : null
  }

  /**
   * Find the first record matching the conditions
   * @param args.where Optional where conditions
   * @param args.orderBy Optional ordering
   * @returns First matching record or null
   */
  async findFirst(
    args: {
      where?: FindManyOptions<T>["where"]
      orderBy?: FindManyOptions<T>["orderBy"]
    } = {}
  ): Promise<T | null> {
    const { sql, params } = SqlQueryBuilder.buildFindMany(this.rawTableName, {
      where: args.where,
      orderBy: args.orderBy,
      take: 1,
    })

    const rows = await this.dataSpace.exec2(sql, params)
    return rows.length > 0 ? (rows[0] as T) : null
  }

  /**
   * Find multiple records with advanced query options
   * @param args Query options including where, orderBy, skip, take, select
   * @returns Array of matching records
   */
  async findMany(args: FindManyOptions<T> = {}): Promise<T[]> {
    const { sql, params } = SqlQueryBuilder.buildFindMany(
      this.rawTableName,
      args
    )
    const rows = await this.dataSpace.exec2(sql, params)
    return rows as T[]
  }

  /**
   * Count records matching the conditions
   * @param args.where Optional where conditions
   * @returns Count of matching records
   */
  async count(
    args: { where?: FindManyOptions<T>["where"] } = {}
  ): Promise<number> {
    const { countSql, countParams } = SqlQueryBuilder.buildFindMany(
      this.rawTableName,
      {
        where: args.where,
      }
    )
    const result = await this.dataSpace.exec2(countSql, countParams)
    return result[0]?.count || 0
  }

  // ============ UPDATE OPERATIONS ============

  /**
   * Update a single record by _id
   * @param args.where Where clause with _id
   * @param args.data Data to update
   * @returns Updated record
   */
  async update(args: {
    where: { _id: string }
    data: Partial<T>
  }): Promise<T | null> {
    const updateData = this.getUpdateData(args.data)
    const keys = Object.keys(updateData)

    if (keys.length === 0) {
      return await this.findUnique({ where: args.where })
    }

    const setClause = keys.map((key) => `${key} = ?`).join(", ")
    const values = [...Object.values(updateData), args.where._id]

    const sql = `UPDATE ${this.rawTableName} SET ${setClause} WHERE _id = ?`
    await this.dataSpace.exec2(sql, values)
    this.dataSpace.undoRedoManager.event()

    return await this.findUnique({ where: args.where })
  }

  /**
   * Update multiple records matching the conditions
   * @param args.where Where conditions
   * @param args.data Data to update
   * @returns Count of updated records
   */
  async updateMany(args: {
    where: FindManyOptions<T>["where"]
    data: Partial<T>
  }): Promise<{ count: number }> {
    const updateData = this.getUpdateData(args.data)
    const keys = Object.keys(updateData)

    if (keys.length === 0) {
      return { count: 0 }
    }

    const setClause = keys.map((key) => `${key} = ?`).join(", ")
    const { whereClause, params: whereParams } = this.buildWhereFromOptions(
      args.where
    )

    let sql = `UPDATE ${this.rawTableName} SET ${setClause}`
    if (whereClause) {
      sql += ` WHERE ${whereClause}`
    }

    const values = [...Object.values(updateData), ...whereParams]
    await this.dataSpace.exec2(sql, values)
    this.dataSpace.undoRedoManager.event()

    // Get affected count
    const count = await this.count({ where: args.where })
    return { count }
  }

  // ============ DELETE OPERATIONS ============

  /**
   * Delete a single record by _id
   * @param args.where Where clause with _id
   * @returns Deleted record or null if not found
   */
  async delete(args: { where: { _id: string } }): Promise<T | null> {
    const existing = await this.findUnique({ where: args.where })
    if (!existing) {
      return null
    }

    const sql = `DELETE FROM ${this.rawTableName} WHERE _id = ?`
    await this.dataSpace.exec2(sql, [args.where._id])
    this.dataSpace.undoRedoManager.event()

    return existing
  }

  /**
   * Delete multiple records matching the conditions
   * @param args.where Where conditions
   * @returns Count of deleted records
   */
  async deleteMany(args: {
    where: FindManyOptions<T>["where"]
  }): Promise<{ count: number }> {
    // Get count before deletion
    const count = await this.count({ where: args.where })

    if (count === 0) {
      return { count: 0 }
    }

    const { whereClause, params } = this.buildWhereFromOptions(args.where)

    let sql = `DELETE FROM ${this.rawTableName}`
    if (whereClause) {
      sql += ` WHERE ${whereClause}`
    }

    await this.dataSpace.exec2(sql, params)
    this.dataSpace.undoRedoManager.event()

    return { count }
  }

  // ============ PRIVATE HELPERS ============

  private getCreateData(
    data: T
  ): T & { _id: string; _created_by?: string; _last_edited_by?: string } {
    return {
      _id: uuidv7(),
      _created_by: workerStore.currentCallUserId,
      _last_edited_by: workerStore.currentCallUserId,
      ...data,
    } as T & { _id: string; _created_by?: string; _last_edited_by?: string }
  }

  private getUpdateData(
    data: Partial<T>
  ): Partial<T> & { _last_edited_time: string; _last_edited_by?: string } {
    const { _id, _created_by, _created_time, ...restData } = data as any
    return {
      ...restData,
      _last_edited_time: new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
      _last_edited_by: workerStore.currentCallUserId,
    }
  }

  private buildWhereFromOptions(where: FindManyOptions<T>["where"]): {
    whereClause: string
    params: any[]
  } {
    if (!where || Object.keys(where).length === 0) {
      return { whereClause: "", params: [] }
    }

    // Use SqlQueryBuilder's where clause building
    const { sql, params } = SqlQueryBuilder.buildFindMany(this.rawTableName, {
      where,
    })

    // Extract WHERE clause from the full SQL
    const whereMatch = sql.match(/WHERE (.+?)(ORDER BY|LIMIT|OFFSET|;|$)/i)
    const whereClause = whereMatch ? whereMatch[1].trim() : ""

    return { whereClause, params }
  }
}
