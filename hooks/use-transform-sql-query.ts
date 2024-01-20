import { useMemo } from "react"

import { FieldType } from "@/lib/fields/const"
import { transformQueryWithFormulaFields2Sql } from "@/lib/sqlite/sql-formula-parser"
import { IField } from "@/lib/store/interface"

export const useTransformSqlQuery = (sql: string, fields: IField[]) => {
  return useMemo(() => {
    const fieldNameRawIdMap: Record<string, string> = {}
    fields.forEach((field) => {
      fieldNameRawIdMap[field.name] = field.table_column_name
    })
    return transformQueryWithFormulaFields2Sql(
      sql,
      fields.filter((f) => f.type === FieldType.Formula),
      fieldNameRawIdMap
    )
  }, [sql, fields])
}
