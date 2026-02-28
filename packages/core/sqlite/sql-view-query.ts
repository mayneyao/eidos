import type { LimitStatement, SelectFromStatement } from "pgsql-ast-parser"
import { astMapper, parseFirst, toSql } from "pgsql-ast-parser"
import { getFilterColumns } from "./sql-filter-parser"
import { getSortColumns } from "./sql-sort-parser"

const getQueryFields = (query: string) => {
  const filterColumns = getFilterColumns(query)
  const sortColumns = getSortColumns(query)
  return Array.from(new Set([...filterColumns, ...(sortColumns || [])]))
}

export const isFieldsInQuery = (query: string, fields: string[]) => {
  const queryFields = getQueryFields(query)
  return fields.some((f) => queryFields?.includes(f))
}

export const rewriteQueryWithRowId = (query: string) => {
  const ast = parseFirst(query) as SelectFromStatement

  const mapper = astMapper((map) => ({
    ref: (t) => {
      if (t.name === "*") {
        return {
          ...t,
          name: "rowid",
        }
      }
      return map.super().ref(t)
    },
  }))

  const modified = mapper.statement(ast) as SelectFromStatement
  return toSql.statement(modified)
}

export const rewriteQueryWithOffsetAndLimit = (
  query: string,
  offset?: number,
  limit?: number
) => {
  const ast = parseFirst(query) as SelectFromStatement
  const _limit: LimitStatement = {}
  if (offset != null) {
    _limit.offset = {
      value: offset as number,
      type: "integer",
    }
  }
  if (limit != null) {
    _limit.limit = {
      value: limit as number,
      type: "integer",
    }
  }

  ast.limit = _limit
  let sql = toSql.statement(ast)
  sql = sql.replace(/OFFSET\s*\((\d+)\)/g, "OFFSET $1")
  sql = sql.replace(/LIMIT\s*\((\d+)\)/g, "LIMIT $1")
  sql = sql.replace(
    /(.+?)\s*OFFSET\s*(\d+)\s*LIMIT\s*(\d+)(.*?)$/i,
    "$1 LIMIT $3 OFFSET $2$4"
  )
  return sql
}
