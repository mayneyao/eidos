import {
  SelectFromStatement,
  astMapper,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

/**
 * before call this function, the query sql must be transformed by transformQueryWithFormulaFields2Sql.
 * because orderBy may be included formula fields
 * @param query
 * @returns
 */
export const rewriteQuery2getSortedRowIds = (query: string) => {
  const ast = parseFirst(query) as SelectFromStatement
  const mapper = astMapper((map) => ({
    ref: (t) => {
      // we need to rewrite the query to get sorted row IDs, replacing * with _id to reduce the data size
      if (t.name === "*") {
        return {
          ...t,
          name: "_id",
        }
      }
      return map.super().ref(t)
    },
  }))
  if (!ast.orderBy) {
    ast.orderBy = [
      {
        by: {
          type: "ref",
          name: "rowid",
        },
        order: "ASC",
      },
    ]
  }
  const modified = mapper.statement(ast) as SelectFromStatement

  return toSql.statement(modified)
}

export const hasOrderBy = (query?: string) => {
  if (!query) return false
  const ast = parseFirst(query)
  const selectStatement = ast as SelectFromStatement
  return selectStatement.orderBy !== undefined
}
