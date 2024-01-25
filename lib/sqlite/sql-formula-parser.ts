import {
  ExprRef,
  SelectFromStatement,
  SelectedColumn,
  astMapper,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

import { FieldType } from "../fields/const"
import { IField } from "../store/interface"
import { nonNullable } from "../utils"

/**
 * example:
 * sql: select * from table1
 * fields: [{name: "id", type: "number"}, {name: "name", type: "string"}]
 * return: select id, name from table1
 *
 * example2:
 * sql: select id,name from table1
 * fields: [{name: "id", type: "number","table_column_name": "cl_xxx1"}, {name: "name", type: "string"},"table_column_name": "cl_xxx2"]
 * return: select cl_xxx1 as id, cl_xxx2 as name from table1
 * @param sql
 * @param fields
 */
export const transformQuery = (sql: string, fields: IField[]) => {
  const ast = parseFirst(sql)
  const selectStatement = ast
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

  const modified = mapper.statement(selectStatement)!
  return toSql.statement(modified)
}

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
    expr: (t) => {
      // turn props("field name with space") to cl_xxx
      if (t && t.type === "call" && t.function.name === "props") {
        const param = t.args[0] as ExprRef
        const rawName = fieldNameRawIdMap[param.name.toLowerCase()]
        return {
          type: "call",
          function: {
            type: "ref",
            // props is udf function, just return the param, generated column must be a expression
            name: "props",
          },
          args: [
            {
              type: "ref",
              name: rawName,
            },
          ],
        }
      }
      return map.super().expr(t)
    },
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
