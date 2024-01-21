import {
  SelectFromStatement,
  SelectedColumn,
  astMapper,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

import { FieldType } from "../fields/const"
import { IField } from "../store/interface"
import { nonNullable } from "../utils"

export const transformFormula2VirtualGeneratedField = (
  columnName: string,
  fields: IField[]
) => {
  const formulaFields = fields.filter((f) => f.type === FieldType.Formula)
  const fieldNameRawIdMap: Record<string, string> = {}
  fields.forEach((field) => {
    fieldNameRawIdMap[field.name.toLowerCase()] = field.table_column_name
  })

  // create a mapper
  const mapper = astMapper((map) => ({
    ref: (t) => {
      const rawName = fieldNameRawIdMap[t.name]
      if (rawName) {
        return {
          ...t,
          name: rawName,
        }
      }
      return map.super().ref(t)
    },
  }))
  const field = formulaFields.find((f) => f.table_column_name === columnName)
  if (!field) return null
  const ast = parseFirst(`select ${field.property.formula}`)
  const modified = mapper.statement(ast) as SelectFromStatement
  const sql = toSql.statement(modified)
  return sql.replace("SELECT", "").trim()
}

export const transformQueryWithFormulaFields2Sql = (
  query: string,
  fields: IField[]
) => {
  // we drop this solution but use sqlite virtual generated field, it's more simple
  return query
  const formulaFields = fields.filter((f) => f.type === FieldType.Formula)
  const fieldNameRawIdMap: Record<string, string> = {}
  fields.forEach((field) => {
    fieldNameRawIdMap[field.name.toLowerCase()] = field.table_column_name
  })
  const ast = parseFirst(query)
  const selectStatement = ast as SelectFromStatement

  // create a mapper
  const mapper = astMapper((map) => ({
    ref: (t) => {
      const rawName = fieldNameRawIdMap[t.name]
      if (rawName) {
        return {
          ...t,
          name: rawName,
        }
      }
      return map.super().ref(t)
    },
  }))

  const res: SelectedColumn[] = formulaFields
    .map((field) => {
      const ast = parseFirst(
        `select ${field.property.formula} as ${field.table_column_name}`
      )
      const modified = mapper.statement(ast) as SelectFromStatement
      return modified.columns?.[0]
    })
    .filter(nonNullable)

  selectStatement.columns = [
    {
      expr: {
        type: "ref",
        name: "*",
      },
    },
    ...res,
  ]
  return toSql.statement(selectStatement)
}
