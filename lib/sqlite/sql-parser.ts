import {
  SelectFromStatement,
  Statement,
  astMapper,
  parse,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"



export const getColumnsFromQuery = (sql?: string) => {
  if (!sql) return []
  // parse multiple statements
  const ast: Statement[] = parse(sql)
  return (ast?.[0] as SelectFromStatement).columns
}

export const replaceQueryTableName = (
  query: string,
  tableNameMap: Record<string, string>
) => {
  const ast: Statement = parseFirst(query)
  const selectStatement = ast as SelectFromStatement
  selectStatement.from?.forEach((from) => {
    if (from.type === "table") {
      const tableName = from.name.name
      from.name.name = tableNameMap[tableName] ?? tableName
    }
  })
  return toSql.statement(selectStatement)
}

/**
 * transform sql query replace column name with columnNameMap
 * @param sql
 * @param columnNameMap
 * @returns transformed sql
 */

export const transformSql = (
  sql: string,
  rawTableName: string,
  columnNameMap: Map<string, string>
): string => {
  const lowerCaseColumnNameMap = new Map<string, string>()
  columnNameMap.forEach((v, k) => {
    lowerCaseColumnNameMap.set(k.toLowerCase(), v)
  })
  // create a mapper
  const mapper = astMapper((map) => ({
    ref: (t) => {
      const rawName = lowerCaseColumnNameMap.get(t.name)
      if (rawName) {
        return {
          ...t,
          name: rawName,
        }
      }
      return map.super().ref(t)
    },
    tableRef: (t) => {
      return {
        ...t,
        name: rawTableName,
      }
    },
  }))

  // parse + map + reconvert to sql
  const modified = mapper.statement(parseFirst(sql))
  return toSql.statement(modified!)
}
