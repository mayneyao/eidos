import {
  Expr,
  ExprBinary,
  ExprRef,
  ExprString,
  ExprUnary,
  SelectFromStatement,
  astVisitor,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

import { FilterValueType } from "@/components/table/view-filter-editor/interface"

import { BinaryOperator, CompareOperator } from "../fields/const"

export const isLogicOperator = (op: string): op is BinaryOperator => {
  return [BinaryOperator.And, BinaryOperator.Or].includes(op as BinaryOperator)
}

const opMap: Record<string, BinaryOperator | CompareOperator> = {
  AND: BinaryOperator.And,
  OR: BinaryOperator.Or,
  "=": CompareOperator.Equal,
  "!=": CompareOperator.NotEqual,
  ">": CompareOperator.GreaterThan,
  ">=": CompareOperator.GreaterThanOrEqual,
  "<": CompareOperator.LessThan,
  "<=": CompareOperator.LessThanOrEqual,
  // LIKE: CompareOperator.Contains,
  "NOT LIKE": CompareOperator.NotContains,
  "IS NULL": CompareOperator.IsEmpty,
  "IS NOT NULL": CompareOperator.IsNotEmpty,
}

export const reverseOpMap: Record<BinaryOperator | CompareOperator, string> = {
  [BinaryOperator.And]: "AND",
  [BinaryOperator.Or]: "OR",
  [CompareOperator.Equal]: "=",
  [CompareOperator.NotEqual]: "!=",
  [CompareOperator.GreaterThan]: ">",
  [CompareOperator.GreaterThanOrEqual]: ">=",
  [CompareOperator.LessThan]: "<",
  [CompareOperator.LessThanOrEqual]: "<=",
  [CompareOperator.Contains]: "LIKE",
  [CompareOperator.StartsWith]: "LIKE",
  [CompareOperator.EndsWith]: "LIKE",
  [CompareOperator.NotContains]: "NOT LIKE",
  [CompareOperator.IsEmpty]: "IS NULL",
  [CompareOperator.IsNotEmpty]: "IS NOT NULL",
}

const transformOP = (expr: ExprBinary) => {
  const { op, left, right } = expr
  if (op === "LIKE") {
    if (
      right.type === "string" &&
      right.value.startsWith("%") &&
      right.value.endsWith("%")
    ) {
      return CompareOperator.Contains
    }
    if (right.type === "string" && right.value.startsWith("%")) {
      return CompareOperator.EndsWith
    }
    if (right.type === "string" && right.value.endsWith("%")) {
      return CompareOperator.StartsWith
    }
  }
  return opMap[op]
}

export const expr2FilterValue = (expr: ExprBinary): FilterValueType => {
  const { op, left, right } = expr
  const _op = transformOP(expr)
  if (isLogicOperator(_op)) {
    return {
      operator: _op,
      operands: [
        expr2FilterValue(left as ExprBinary),
        expr2FilterValue(right as ExprBinary),
      ],
    }
  } else if (
    _op === CompareOperator.IsEmpty ||
    _op === CompareOperator.IsNotEmpty
  ) {
    return {
      operator: _op,
      operands: [
        ((expr as unknown as ExprUnary).operand as ExprRef).name,
        null,
      ],
    }
  } else {
    let rightValue = (right as ExprString).value
    switch (_op) {
      case CompareOperator.StartsWith:
        rightValue = rightValue.slice(1)
        break
      case CompareOperator.EndsWith:
        rightValue = rightValue.slice(0, -1)
        break
      case CompareOperator.Contains:
        rightValue = rightValue.slice(1, -1)
        break
      default:
        break
    }
    return {
      operator: _op,
      operands: [(left as ExprRef).name, rightValue],
    }
  }
}

export const transformSql2FilterItems = (sql: string): FilterValueType => {
  const parsedSql = parseFirst(sql) as SelectFromStatement
  let value = parsedSql.where
  const filterValue = expr2FilterValue(value as ExprBinary)
  if (isLogicOperator(filterValue.operator)) {
    return filterValue
  } else {
    return {
      operator: BinaryOperator.And,
      operands: [filterValue],
    }
  }
}

const ExprTypeMap: any = {
  number: "numeric",
}

export const transformFilterItems2SqlExpr = (
  filterItems: FilterValueType
): any => {
  const { operator, operands } = filterItems

  if (isLogicOperator(operator)) {
    if (operands.length === 1) {
      return transformFilterItems2SqlExpr(operands[0] as FilterValueType)
    }
    if (operands.length === 2) {
      const expr: ExprBinary = {
        type: "binary",
        op: reverseOpMap[operator] as BinaryOperator,
        left: transformFilterItems2SqlExpr(operands[0] as FilterValueType),
        right: transformFilterItems2SqlExpr(operands[1] as FilterValueType),
      }
      return expr
    }
    // and(1,2,3,4) => and(1, and(2, and(3, 4)))
    if (operands.length > 2) {
      const expr: ExprBinary = {
        type: "binary",
        op: reverseOpMap[operator] as BinaryOperator,
        left: transformFilterItems2SqlExpr(operands[0] as FilterValueType),
        right: transformFilterItems2SqlExpr({
          operator,
          operands: operands.slice(1) as FilterValueType[],
        }),
      }
      return expr
    }
  } else {
    const [field, value] = operands
    switch (operator) {
      case CompareOperator.Contains:
        return {
          type: "binary",
          op: "LIKE",
          left: {
            type: "ref",
            name: field as string,
          },
          right: {
            type: "string",
            value: `%${value}%`,
          },
        }
      case CompareOperator.NotContains:
        return {
          type: "binary",
          op: "NOT LIKE",
          left: {
            type: "ref",
            name: field as string,
          },
          right: {
            type: "string",
            value: `%${value}%`,
          },
        }
      case CompareOperator.StartsWith:
        return {
          type: "binary",
          op: "LIKE",
          left: {
            type: "ref",
            name: field as string,
          },
          right: {
            type: "string",
            value: `${value}%`,
          },
        }
      case CompareOperator.EndsWith:
        return {
          type: "binary",
          op: "LIKE",
          left: {
            type: "ref",
            name: field as string,
          },
          right: {
            type: "string",
            value: `%${value}`,
          },
        }
      case CompareOperator.IsEmpty:
        return {
          type: "unary",
          operand: {
            type: "ref",
            name: field as string,
          },
          op: "IS NULL",
        }
      case CompareOperator.IsNotEmpty:
        return {
          type: "unary",
          operand: {
            type: "ref",
            name: field as string,
          },
          op: "IS NOT NULL",
        }
      default:
        return {
          type: "binary",
          op: reverseOpMap[operator] as any,
          left: {
            type: "ref",
            name: field as string,
          },
          right:
            value == null
              ? {
                  type: "null",
                }
              : {
                  type: ExprTypeMap[typeof value] || typeof value || "string",
                  value,
                },
        }
    }
  }
}

export const transformFilterItems2SqlString = (
  sql: string,
  filterItems: FilterValueType | null
): string => {
  const parsedSql = parseFirst(sql) as SelectFromStatement
  if (filterItems == null) {
    parsedSql.where = null
    return toSql.statement(parsedSql)
  }
  const expr = transformFilterItems2SqlExpr(filterItems)
  parsedSql.where = expr
  return toSql.statement(parsedSql)
}

export const getFilterColumns = (query: string) => {
  const ast = parseFirst(query) as SelectFromStatement
  const columns: string[] = []
  const visitor = astVisitor((v) => ({
    ref: (r) => {
      if (r.type === "ref") {
        columns.push(r.name)
      }
      v.super().ref(r)
    },
  }))
  if (ast.where) {
    visitor.expr(ast.where)
  }
  return columns
}
