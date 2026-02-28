export interface FindManyOptions<T = any> {
  where?: Partial<T> | WhereCondition<T>
  orderBy?: OrderByOption<T> | OrderByOption<T>[]
  skip?: number
  take?: number
  select?: Partial<Record<keyof T, boolean>>
  include?: Partial<Record<keyof T, boolean>>
}

export interface WhereCondition<T = any> {
  AND?: (WhereCondition<T> | Partial<T>)[]
  OR?: (WhereCondition<T> | Partial<T>)[]
  NOT?: WhereCondition<T> | Partial<T>
  [key: string]: any
}

export interface OrderByOption<T = any> {
  [key: string]: "asc" | "desc" | undefined
}

export interface BuiltQuery {
  sql: string
  params: any[]
  countSql: string
  countParams: any[]
}

export class SqlQueryBuilder {
  static buildFindMany<T = any>(
    tableName: string,
    options: FindManyOptions<T> = {}
  ): BuiltQuery {
    const { where = {}, orderBy, skip = 0, take, select } = options

    // Build SELECT clause
    const selectClause = this.buildSelectClause(select)

    // Build WHERE clause
    const whereResult = this.buildWhereClause(where)

    // Build ORDER BY clause
    const orderByClause = this.buildOrderByClause(orderBy)

    // Build LIMIT and OFFSET
    const limitOffsetClause = this.buildLimitOffsetClause(skip, take)

    // Build main query
    let sql = `SELECT ${selectClause} FROM ${tableName}`
    if (whereResult.whereClause) {
      sql += ` WHERE ${whereResult.whereClause}`
    }
    if (orderByClause) {
      sql += ` ORDER BY ${orderByClause}`
    }
    if (limitOffsetClause) {
      sql += ` ${limitOffsetClause}`
    }
    sql += ";"

    // Build count query
    let countSql = `SELECT COUNT(*) as count FROM ${tableName}`
    if (whereResult.whereClause) {
      countSql += ` WHERE ${whereResult.whereClause}`
    }
    countSql += ";"

    return {
      sql,
      params: whereResult.params,
      countSql,
      countParams: whereResult.params,
    }
  }

  private static buildSelectClause<T>(
    select?: Partial<Record<keyof T, boolean>>
  ): string {
    if (!select) {
      return "*"
    }

    const selectedFields = Object.entries(select)
      .filter(([, include]) => include)
      .map(([field]) => field)

    return selectedFields.length > 0 ? selectedFields.join(", ") : "*"
  }

  private static buildWhereClause(where: any): {
    whereClause: string
    params: any[]
  } {
    if (!where || Object.keys(where).length === 0) {
      return { whereClause: "", params: [] }
    }

    const conditions: string[] = []
    const params: any[] = []

    for (const [key, value] of Object.entries(where)) {
      if (key === "AND" || key === "OR" || key === "NOT") {
        continue
      }

      if (value === null) {
        conditions.push(`${key} IS NULL`)
      } else if (value === undefined) {
        conditions.push(`${key} IS NULL`)
      } else if (typeof value === "object" && !Array.isArray(value)) {
        // Handle object conditions like { gt: 10, lt: 20 }
        const objectConditions = this.buildObjectConditions(
          key,
          value as Record<string, any>
        )
        conditions.push(...objectConditions.conditions)
        params.push(...objectConditions.params)
      } else {
        conditions.push(`${key} = ?`)
        params.push(value)
      }
    }

    // Handle logical operators
    if (where.AND && Array.isArray(where.AND)) {
      const andConditions = where.AND.map((condition: any) => {
        if (typeof condition === "object" && !Array.isArray(condition)) {
          const result = this.buildWhereClause(condition)
          params.push(...result.params)
          return result.whereClause
        }
        return condition
      }).filter(Boolean)

      if (andConditions.length > 0) {
        conditions.push(`(${andConditions.join(") AND (")})`)
      }
    }

    if (where.OR && Array.isArray(where.OR)) {
      const orConditions = where.OR.map((condition: any) => {
        if (typeof condition === "object" && !Array.isArray(condition)) {
          const result = this.buildWhereClause(condition)
          params.push(...result.params)
          return result.whereClause
        }
        return condition
      }).filter(Boolean)

      if (orConditions.length > 0) {
        conditions.push(`(${orConditions.join(") OR (")})`)
      }
    }

    if (where.NOT) {
      const notCondition = this.buildWhereClause(where.NOT)
      if (notCondition.whereClause) {
        conditions.push(`NOT (${notCondition.whereClause})`)
        params.push(...notCondition.params)
      }
    }

    return {
      whereClause: conditions.join(" AND "),
      params,
    }
  }

  private static buildObjectConditions(
    field: string,
    conditions: Record<string, any>
  ): { conditions: string[]; params: any[] } {
    const result: string[] = []
    const params: any[] = []

    for (const [operator, value] of Object.entries(conditions)) {
      switch (operator) {
        case "equals":
          result.push(`${field} = ?`)
          params.push(value)
          break
        case "not":
          result.push(`${field} != ?`)
          params.push(value)
          break
        case "in":
          if (Array.isArray(value) && value.length > 0) {
            const placeholders = value.map(() => "?").join(", ")
            result.push(`${field} IN (${placeholders})`)
            params.push(...value)
          }
          break
        case "notIn":
          if (Array.isArray(value) && value.length > 0) {
            const placeholders = value.map(() => "?").join(", ")
            result.push(`${field} NOT IN (${placeholders})`)
            params.push(...value)
          }
          break
        case "lt":
          result.push(`${field} < ?`)
          params.push(value)
          break
        case "lte":
          result.push(`${field} <= ?`)
          params.push(value)
          break
        case "gt":
          result.push(`${field} > ?`)
          params.push(value)
          break
        case "gte":
          result.push(`${field} >= ?`)
          params.push(value)
          break
        case "contains":
          result.push(`${field} LIKE ?`)
          params.push(`%${value}%`)
          break
        case "startsWith":
          result.push(`${field} LIKE ?`)
          params.push(`${value}%`)
          break
        case "endsWith":
          result.push(`${field} LIKE ?`)
          params.push(`%${value}`)
          break
        case "mode":
          // Handle case sensitivity mode
          break
      }
    }

    return { conditions: result, params }
  }

  private static buildOrderByClause<T>(
    orderBy?: OrderByOption<T> | OrderByOption<T>[]
  ): string {
    if (!orderBy) {
      return ""
    }

    if (Array.isArray(orderBy)) {
      return orderBy
        .map((item) => this.buildOrderByItem(item))
        .filter(Boolean)
        .join(", ")
    }

    return this.buildOrderByItem(orderBy)
  }

  private static buildOrderByItem<T>(orderBy: OrderByOption<T>): string {
    const clauses: string[] = []

    for (const [field, direction] of Object.entries(orderBy)) {
      if (direction === "asc" || direction === "desc") {
        clauses.push(`${field} ${direction.toUpperCase()}`)
      }
    }

    return clauses.join(", ")
  }

  private static buildLimitOffsetClause(skip: number, take?: number): string {
    const clauses: string[] = []

    if (take !== undefined) {
      clauses.push(`LIMIT ${take}`)
    }

    if (skip > 0) {
      clauses.push(`OFFSET ${skip}`)
    }

    return clauses.join(" ")
  }
}
