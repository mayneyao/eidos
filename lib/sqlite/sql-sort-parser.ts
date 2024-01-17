import {
    SelectFromStatement,
    parseFirst,
    toSql
} from "pgsql-ast-parser"

export const rewriteQuery2getSortedRowIds = (query: string) => {
  const ast = parseFirst(query)
  const selectStatement = ast as SelectFromStatement
  selectStatement.columns = [
    {
      expr: {
        type: "ref",
        name: "_id",
      },
    },
  ]
  return toSql.statement(selectStatement)
}
