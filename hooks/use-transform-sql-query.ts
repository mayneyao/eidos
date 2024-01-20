import { useMemo } from "react"

import { transformQueryWithFormulaFields2Sql } from "@/lib/sqlite/sql-formula-parser"
import { IField } from "@/lib/store/interface"

export const useTransformSqlQuery = (sql: string, fields: IField[]) => {
  return useMemo(() => {
    return transformQueryWithFormulaFields2Sql(sql, fields)
  }, [sql, fields])
}
