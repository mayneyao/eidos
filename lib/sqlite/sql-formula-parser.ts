import {
  SelectFromStatement,
  SelectedColumn,
  Statement,
  astMapper,
  astVisitor,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

import { FormulaProperty } from "../fields/formula"
import { IField } from "../store/interface"
import { nonNullable } from "../utils"

export const transformQueryWithFormulaFields2Sql = (
  query: string,
  formulaFields: IField<FormulaProperty>[],
  fieldNameRawIdMap: Record<string, string>
) => {
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
