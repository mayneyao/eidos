import { SelectFromStatement, parseFirst, toSql } from "pgsql-ast-parser"

export const getTransformedQuery = (query: string) => {
  const ast = parseFirst(query)
  const selectStatement = ast as SelectFromStatement
  return toSql.statement(selectStatement)
}

export function isReadOnlySql(sql: string) {
  const readonlySqls = ["SELECT", "PRAGMA", "EXPLAIN", "ANALYZE"]
  return readonlySqls.some((item) => sql.trim().toUpperCase().startsWith(item))
}

/**
 *
 * example 1:
 *
 * const id = 42
 * const fieldName = "id"
 * buildSql`select ${Symbol(fieldName)} from table where id = ${id}` => { sql: "select id from table where id = ?", bind: [42]}
 *
 * example 2:
 * const table = "books"
 * buildSql`select * from ${Symbol(table)}` => { sql: "select * from books", bind: []}
 *
 * buildSql only return sql and bind, no execute.we need to escape table name, column name, etc.
 *
 * in example 1, we can use ? placeholder to avoid sql injection
 * in example 2, we need to escape table name, column name, etc.
 *
 * if variable is a Symbol, we don't escape it.
 * @param strings
 * @param values
 * @returns
 */

export function buildSql(strings: TemplateStringsArray, ...values: any[]) {
  const bind: any[] = []
  let sql = strings[0]

  // if all strings are empty, e.g. sql`${sql} ${sql2}`, just concat values
  if (strings.filter((item) => item.trim().length > 0).length === 0) {
    return {
      sql: values.join(" "),
      bind: [],
    }
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (typeof value === "symbol") {
      sql += value.description + strings[i + 1]
    } else if (Array.isArray(value)) {
      sql += `(${Array.from({ length: value.length }).fill("?").join(",")})`
      bind.push(...value)
    } else {
      sql += "?" + strings[i + 1]
      bind.push(value)
    }
  }
  return {
    sql,
    bind,
  }
}

export const checkSqlIsModifyTableSchema = (sql: string) => {
  const modifyTableSqls = [
    "CREATE TABLE",
    "DROP TABLE",
    "ALTER TABLE",
    "RENAME TABLE",
  ]
  return modifyTableSqls.some((modifyTableSql) => sql.includes(modifyTableSql))
}

export const checkSqlIsOnlyQuery = (sql: string) => {
  const querySqls = ["SELECT", "PRAGMA"]
  return querySqls.some((querySql) => sql.includes(querySql))
}

export const checkSqlIsModifyTableData = (sql: string) => {
  const modifyTableSqls = ["INSERT", "UPDATE", "DELETE"]
  return modifyTableSqls.some((modifyTableSql) => sql.includes(modifyTableSql))
}

export function isAggregated(sql: string): boolean {
  if (sql.match(/SELECT\s+(SUM|AVG|COUNT|MAX|MIN)\(/i)) {
    return true
  }

  if (sql.match(/GROUP\s+BY/i)) {
    return true
  }

  if (sql.match(/HAVING/i)) {
    return true
  }
  return false
}

export const aggregateSql2columns = (sql: string, originFields: string[]) => {
  const result: any = { columns: [] }

  const matches = sql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)/i)
  if (matches) {
    const [, select, from] = matches
    const columns = select === "*" ? originFields : select.split(",")

    columns.forEach((column) => {
      // support "AS as"
      const [name, alias] = column.trim().split(/\s+as\s+/i)
      result.columns.push({ name: alias || name, type: "string" })
    })

    const orderByMatches = sql.match(/ORDER\s+BY\s+(\w+)/i)
    if (orderByMatches) {
      const [, orderBy] = orderByMatches
      result.orderBy = orderBy
    }

    const limitMatches = sql.match(/LIMIT\s+(\d+)/i)
    if (limitMatches) {
      const [, limit] = limitMatches
      result.limit = parseInt(limit)
    }
  }
  return result
}

export const getSqlQueryColumns = (sql: string, originSchema: any) => {
  const fields = originSchema[0]?.columns?.map((col: any) => col.name) ?? []
  const compactJsonTablesArray = aggregateSql2columns(sql, fields)
  return compactJsonTablesArray.columns.map((col: any) => col.name) ?? []
}

export const queryData2JSON = (sqlResult: any[][], fields: string[]) => {
  return sqlResult.map((row) => {
    const obj: any = {}
    row.forEach((value, index) => {
      obj[fields[index]] = value
    })
    return obj
  })
}

export const stringify = (obj: any) => {
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === "object" || Array.isArray(obj[key])) {
      obj[key] = JSON.stringify(obj[key])
    }
  })
  return obj
}
