import type {
  Expr,
  ExprCall,
  ExprRef,
  SelectFromStatement,
  SelectedColumn,
} from "pgsql-ast-parser"
import { parseFirst, toSql } from "pgsql-ast-parser"
import type { AggregateItem } from "./interface"

export const transformAggregateItems2SqlString = (
  sql: string,
  aggregateItems: AggregateItem[],
  groupByColumns?: string[],
  selectedFields?: string[]
): string => {
  const parsedSql = parseFirst(sql) as SelectFromStatement

  // Check if there's a SELECT * in the query
  const hasSelectAll = parsedSql.columns?.some(
    (col) => col.expr.type === "ref" && col.expr.name === "*"
  )

  if (hasSelectAll) {
    parsedSql.columns = ["_id", "title"].map((field) => ({
      expr: { type: "ref", name: field },
    })) as SelectedColumn[]
  }

  const selectedColumns = (selectedFields || [])?.map((field) => ({
    expr: { type: "ref", name: field },
  })) as SelectedColumn[]

  const aggregateColumns = aggregateItems.map((item) => {
    let expr: ExprCall
    const columnRef: ExprRef = {
      type: "ref",
      name: item.column,
    }

    switch (item.function) {
      case "count_distinct":
        expr = {
          type: "call",
          function: {
            name: "count",
          },
          args: [columnRef],
          distinct: "distinct",
        }
        break
      case "count":
        expr = {
          type: "call",
          function: {
            name: "count",
          },
          args: [columnRef],
        }
        break
      default:
        expr = {
          type: "call",
          function: {
            // pgsql-ast-parser quotes upper-case function identifiers. Keep the
            // canonical lower-case name so the generated SQL remains portable.
            name: item.function.toLowerCase(),
          },
          args: [columnRef],
        }
    }

    return {
      expr,
      alias: item.alias,
    }
  })

  const groupByExpressions: Expr[] = (groupByColumns || []).map((column) => ({
    type: "ref",
    name: column,
  }))
  if (aggregateColumns?.length) {
    parsedSql.columns = [
      ...(parsedSql.columns || []),
      ...selectedColumns,
      ...aggregateColumns.map((item) => ({
        expr: item.expr,
        alias: item.alias ? { name: item.alias } : undefined,
      })),
    ] as SelectedColumn[]
  }

  if (groupByExpressions?.length) {
    parsedSql.groupBy = groupByExpressions
  }
  const newSql = toSql.statement(parsedSql)
  return newSql.toString()
}
