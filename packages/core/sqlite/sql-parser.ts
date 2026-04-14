import type { SelectFromStatement, Statement } from "pgsql-ast-parser"
import { astMapper, parse, parseFirst, toSql } from "pgsql-ast-parser"

const ATTACHED_DB_SCHEMAS = new Set(["raw", "inbox"])

export const getAttachedDatabaseReferences = (sql?: string): string[] => {
  if (!sql?.trim()) return []
  try {
    const ast: Statement = parseFirst(sql)
    const refs: string[] = []
    const visit = (node: any) => {
      if (!node || typeof node !== "object") return
      if (
        node.type === "table" &&
        node.name?.schema &&
        ATTACHED_DB_SCHEMAS.has(node.name.schema)
      ) {
        refs.push(`${node.name.schema}.${node.name.name}`)
      }
      for (const key of Object.keys(node)) {
        const val = node[key]
        if (Array.isArray(val)) {
          val.forEach(visit)
        } else if (val && typeof val === "object") {
          visit(val)
        }
      }
    }
    visit(ast)
    return [...new Set(refs)]
  } catch {
    return []
  }
}

export const getRawTableNameFromQuery = (sql?: string) => {
  if (!sql) return ""
  const ast: Statement[] = parse(sql)
  if (ast?.[0]?.type === "select") {
    const from = (ast?.[0] as SelectFromStatement).from
    if (from?.[0]?.type === "table") {
      return from?.[0]?.name.name
    }
  }
  return ""
}

export const getColumnsFromQuery = (sql?: string) => {
  if (!sql) return []
  // parse multiple statements
  const ast: Statement[] = parse(sql)
  return (ast?.[0] as SelectFromStatement).columns
}

export const replaceQueryTableName = (
  query: string,
  tableNameMap: Record<string, string>
) => {
  const ast: Statement = parseFirst(query)
  const selectStatement = ast as SelectFromStatement
  selectStatement.from?.forEach((from) => {
    if (from.type === "table") {
      const tableName = from.name.name
      from.name.name = tableNameMap[tableName] ?? tableName
    }
  })
  return toSql.statement(selectStatement)
}

export const replaceWithFindIndexQuery = (
  query: string,
  rowId: string
): string => {
  const ast: Statement = parseFirst(query)
  const selectStatement = ast as SelectFromStatement
  // add a index column
  selectStatement.columns?.length &&
    selectStatement.columns.push({
      expr: {
        type: "call",
        function: {
          name: "row_number",
        },
        args: [],
        over: {
          orderBy: selectStatement.orderBy,
        },
      },
      alias: {
        name: "_index_in_view",
      },
    })
  let querySql = toSql.statement(selectStatement)
  querySql = `WITH RankedResults AS (
${querySql}
)
SELECT
  _index_in_view
FROM
  RankedResults
WHERE
  _id = '${rowId}';`
  return querySql
}

/**
 * transform sql query replace column name with columnNameMap
 * @param sql
 * @param columnNameMap
 * @returns transformed sql
 */

export const transformSql = (
  sql: string,
  rawTableName: string,
  columnNameMap: Map<string, string>
): string => {
  const lowerCaseColumnNameMap = new Map<string, string>()
  columnNameMap.forEach((v, k) => {
    lowerCaseColumnNameMap.set(k.toLowerCase(), v)
  })
  // create a mapper
  const mapper = astMapper((map) => ({
    ref: (t) => {
      const rawName = lowerCaseColumnNameMap.get(t.name)
      if (rawName) {
        return {
          ...t,
          name: rawName,
        }
      }
      return map.super().ref(t)
    },
    tableRef: (t) => {
      return {
        ...t,
        name: rawTableName,
      }
    },
  }))

  // parse + map + reconvert to sql
  const modified = mapper.statement(parseFirst(sql))
  return toSql.statement(modified!)
}
