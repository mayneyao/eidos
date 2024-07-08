import { getFilterColumns } from "./sql-filter-parser"
import { getSortColumns } from "./sql-sort-parser"

const getQueryFields = (query: string) => {
  const filterColumns = getFilterColumns(query)
  const sortColumns = getSortColumns(query)
  return Array.from(new Set([...filterColumns, ...(sortColumns || [])]))
}

export const isFieldsInQuery = (query: string, fields: string[]) => {
  const queryFields = getQueryFields(query)
  console.log("queryFields", queryFields, fields)
  return fields.some((f) => queryFields?.includes(f))
}
