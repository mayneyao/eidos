import type {
  ColumnStatConfig,
  ColumnStatResult,
  ColumnStatType,
} from "../types/IColumnStats"
import { formatStatValue, isMultiValueField } from "./helpers"

/**
 * Stat calculation context
 */
export interface StatCalcContext {
  tableName: string
  columnName: string
  fieldType?: string
  viewQuery?: string
}

/**
 * Extract WHERE condition from view query
 */
function extractWhereCondition(viewQuery?: string): string | null {
  if (!viewQuery) return null
  const whereMatch = viewQuery.match(/WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|$)/i)
  return whereMatch ? whereMatch[1].trim() : null
}

/**
 * Add WHERE condition to SQL
 */
function addWhereClause(
  sql: string,
  whereCondition: string | null,
  tableName: string
): string {
  if (!whereCondition) return sql

  const quotedTable = `"${tableName}"`

  if (sql.includes("WHERE")) {
    return sql.replace("WHERE", `WHERE (${whereCondition}) AND`)
  }
  return sql.replace(
    `FROM ${quotedTable}`,
    `FROM ${quotedTable} WHERE ${whereCondition}`
  )
}

/**
 * Generate count values SQL expression for multi-value fields
 * Compatible with both JSON array and comma-separated formats
 */
function generateCountValuesExpression(quotedCol: string): string {
  return `COALESCE(SUM(CASE 
    WHEN ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 0
    WHEN json_valid(${quotedCol}) AND json_type(${quotedCol}) = 'array' THEN json_array_length(${quotedCol})
    ELSE (LENGTH(${quotedCol}) - LENGTH(REPLACE(${quotedCol}, ',', ''))) + 1
  END), 0)`
}

/**
 * Generate single stat type's SQL expression (for combined queries)
 */
export function generateStatExpression(
  type: ColumnStatType,
  columnName: string,
  fieldType?: string
): string {
  const quotedCol = `"${columnName}"`
  const isMultiValue = fieldType ? isMultiValueField(fieldType) : false

  switch (type) {
    // Basic count types
    case "countAll":
      return `COUNT(*)`

    case "countValues":
      if (isMultiValue) {
        return generateCountValuesExpression(quotedCol)
      }
      return `COUNT(CASE WHEN ${quotedCol} IS NOT NULL AND ${quotedCol} != '' THEN 1 END)`

    case "countUnique":
      return `COUNT(DISTINCT ${quotedCol}) FILTER (WHERE ${quotedCol} IS NOT NULL AND ${quotedCol} != '')`

    case "countEmpty":
      return `COUNT(CASE WHEN ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 1 END)`

    case "countNotEmpty":
      return `COUNT(CASE WHEN ${quotedCol} IS NOT NULL AND ${quotedCol} != '' THEN 1 END)`

    // Checkbox-specific
    case "checked":
      return `COUNT(CASE WHEN ${quotedCol} = 1 OR ${quotedCol} = 'true' OR ${quotedCol} = 'TRUE' THEN 1 END)`

    case "unchecked":
      return `COUNT(CASE WHEN ${quotedCol} = 0 OR ${quotedCol} = 'false' OR ${quotedCol} = 'FALSE' OR ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 1 END)`

    // Percentage types
    case "percentEmpty":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 1 END) / COUNT(*), 2) END`

    case "percentNotEmpty":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${quotedCol} IS NOT NULL AND ${quotedCol} != '' THEN 1 END) / COUNT(*), 2) END`

    case "percentChecked":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${quotedCol} = 1 OR ${quotedCol} = 'true' OR ${quotedCol} = 'TRUE' THEN 1 END) / COUNT(*), 2) END`

    case "percentUnchecked":
      return `CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${quotedCol} = 0 OR ${quotedCol} = 'false' OR ${quotedCol} = 'FALSE' OR ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 1 END) / COUNT(*), 2) END`

    // Number types
    case "sum":
      return `COALESCE(SUM(CAST(${quotedCol} AS NUMERIC)), 0)`

    case "avg":
      return `AVG(CAST(${quotedCol} AS NUMERIC)) FILTER (WHERE ${quotedCol} IS NOT NULL)`

    case "min":
      return `MIN(${quotedCol}) FILTER (WHERE ${quotedCol} IS NOT NULL AND ${quotedCol} != '')`

    case "max":
      return `MAX(${quotedCol}) FILTER (WHERE ${quotedCol} IS NOT NULL AND ${quotedCol} != '')`

    case "median":
      // Median: use AVG as approximation (SQLite has no built-in median)
      return `AVG(CAST(${quotedCol} AS NUMERIC)) FILTER (WHERE ${quotedCol} IS NOT NULL)`

    case "stdDev":
      // StdDev: use simple estimate (max-min)/4 as approximation
      return `(MAX(CAST(${quotedCol} AS NUMERIC)) - MIN(CAST(${quotedCol} AS NUMERIC))) / 4.0`

    // Date types
    case "range":
      return `CASE 
        WHEN MIN(${quotedCol}) IS NULL OR MAX(${quotedCol}) IS NULL THEN NULL 
        ELSE JULIANDAY(MAX(${quotedCol})) - JULIANDAY(MIN(${quotedCol})) 
      END`

    default:
      return `COUNT(*)`
  }
}

/**
 * Generate single stat's SQL (for single column refresh)
 */
export function generateStatSQL(
  type: ColumnStatType,
  context: StatCalcContext
): string {
  const { tableName, columnName, fieldType } = context
  const quotedCol = `"${columnName}"`
  const quotedTable = `"${tableName}"`
  const whereCondition = extractWhereCondition(context.viewQuery)
  const isMultiValue = fieldType ? isMultiValueField(fieldType) : false

  const addWhere = (sql: string) =>
    addWhereClause(sql, whereCondition, tableName)

  switch (type) {
    // Basic count types
    case "countAll":
      return addWhere(`SELECT COUNT(*) as value FROM ${quotedTable}`)

    case "countValues":
      if (isMultiValue) {
        return addWhere(
          `SELECT ${generateCountValuesExpression(quotedCol)} as value FROM ${quotedTable}`
        )
      }
      return addWhere(
        `SELECT COUNT(CASE WHEN ${quotedCol} IS NOT NULL AND ${quotedCol} != '' THEN 1 END) as value FROM ${quotedTable}`
      )

    case "countUnique":
      return addWhere(
        `SELECT COUNT(DISTINCT ${quotedCol}) as value FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL AND ${quotedCol} != ''`
      )

    case "countEmpty":
      return addWhere(
        `SELECT COUNT(CASE WHEN ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 1 END) as value FROM ${quotedTable}`
      )

    case "countNotEmpty":
      return addWhere(
        `SELECT COUNT(CASE WHEN ${quotedCol} IS NOT NULL AND ${quotedCol} != '' THEN 1 END) as value FROM ${quotedTable}`
      )

    // Checkbox-specific
    case "checked":
      return addWhere(
        `SELECT COUNT(CASE WHEN ${quotedCol} = 1 OR ${quotedCol} = 'true' OR ${quotedCol} = 'TRUE' THEN 1 END) as value FROM ${quotedTable}`
      )

    case "unchecked":
      return addWhere(
        `SELECT COUNT(CASE WHEN ${quotedCol} = 0 OR ${quotedCol} = 'false' OR ${quotedCol} = 'FALSE' OR ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 1 END) as value FROM ${quotedTable}`
      )

    // Percentage types
    case "percentEmpty":
      return addWhere(
        `SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 1 END) / COUNT(*), 2) END as value FROM ${quotedTable}`
      )

    case "percentNotEmpty":
      return addWhere(
        `SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${quotedCol} IS NOT NULL AND ${quotedCol} != '' THEN 1 END) / COUNT(*), 2) END as value FROM ${quotedTable}`
      )

    case "percentChecked":
      return addWhere(
        `SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${quotedCol} = 1 OR ${quotedCol} = 'true' OR ${quotedCol} = 'TRUE' THEN 1 END) / COUNT(*), 2) END as value FROM ${quotedTable}`
      )

    case "percentUnchecked":
      return addWhere(
        `SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(CASE WHEN ${quotedCol} = 0 OR ${quotedCol} = 'false' OR ${quotedCol} = 'FALSE' OR ${quotedCol} IS NULL OR ${quotedCol} = '' THEN 1 END) / COUNT(*), 2) END as value FROM ${quotedTable}`
      )

    // Number types
    case "sum":
      return addWhere(
        `SELECT COALESCE(SUM(CAST(${quotedCol} AS NUMERIC)), 0) as value FROM ${quotedTable}`
      )

    case "avg": {
      const base = `SELECT AVG(CAST(${quotedCol} AS NUMERIC)) as value FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL`
      if (!whereCondition) return base
      return base.replace("WHERE", `WHERE (${whereCondition}) AND`)
    }

    case "min":
      return addWhere(
        `SELECT MIN(${quotedCol}) as value FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL`
      )

    case "max":
      return addWhere(
        `SELECT MAX(${quotedCol}) as value FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL`
      )

    // Date types
    case "range":
      return addWhere(
        `SELECT CASE WHEN MIN(${quotedCol}) IS NULL OR MAX(${quotedCol}) IS NULL THEN NULL ELSE JULIANDAY(MAX(${quotedCol})) - JULIANDAY(MIN(${quotedCol})) END as value FROM ${quotedTable}`
      )

    default:
      return addWhere(`SELECT COUNT(*) as value FROM ${quotedTable}`)
  }
}

/**
 * Generate combined stats SQL (single query returns all stats)
 */
export function generateCombinedStatsSQL(
  configs: Record<string, ColumnStatConfig>,
  tableName: string,
  columnTypes: Record<string, string>,
  viewQuery?: string
): string {
  const whereCondition = extractWhereCondition(viewQuery)

  const selectClauses = Object.entries(configs).map(([colName, config]) => {
    const fieldType = columnTypes[colName]
    const expr = generateStatExpression(config.type, colName, fieldType)
    const alias = `"${colName}:${config.type}"`
    return `${expr} as ${alias}`
  })

  if (selectClauses.length === 0) {
    return `SELECT 1 as "_empty" FROM "${tableName}" LIMIT 0`
  }

  const whereClause = whereCondition ? `WHERE ${whereCondition}` : ""
  return `SELECT ${selectClauses.join(", ")} FROM "${tableName}" ${whereClause}`.trim()
}

/**
 * Execute stat calculation
 */
export async function calculateStat(
  config: ColumnStatConfig,
  context: StatCalcContext,
  sqlExecutor: (sql: string) => Promise<any[]>
): Promise<ColumnStatResult> {
  const sql = generateStatSQL(config.type, context)
  const results = await sqlExecutor(sql)
  const value = results[0]?.value ?? null

  return {
    type: config.type,
    value,
    rawValue: value ?? undefined,
    displayText: formatStatValue(value, config),
  }
}

/**
 * Batch calculate multiple columns' stats (using single query)
 */
export async function calculateColumnStats(
  configs: Record<string, ColumnStatConfig>,
  tableName: string,
  columnTypes: Record<string, string>,
  viewQuery: string | undefined,
  sqlExecutor: (sql: string) => Promise<any[]>
): Promise<Record<string, ColumnStatResult>> {
  const results: Record<string, ColumnStatResult> = {}

  if (Object.keys(configs).length === 0) {
    return results
  }

  try {
    const sql = generateCombinedStatsSQL(
      configs,
      tableName,
      columnTypes,
      viewQuery
    )
    const rows = await sqlExecutor(sql)
    const row = rows[0] || {}

    Object.entries(configs).forEach(([colName, config]) => {
      const key = `${colName}:${config.type}`
      const value = row[key] ?? null

      results[colName] = {
        type: config.type,
        value,
        rawValue: value ?? undefined,
        displayText: formatStatValue(value, config),
      }
    })
  } catch (error) {
    console.error("[Stats] Failed to calculate stats:", error)
    // Set all stats to empty on error
    Object.entries(configs).forEach(([colName, config]) => {
      results[colName] = {
        type: config.type,
        value: null,
        displayText: "",
      }
    })
  }

  return results
}
