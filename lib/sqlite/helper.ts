export function isReadOnlySql(sql: string) {
  const readonlySqls = [
    'SELECT',
    'PRAGMA',
    'EXPLAIN',
    'ANALYZE',
  ]
  return readonlySqls.some(item => sql.trim().toUpperCase().startsWith(item))
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
  if (strings.filter(item => item.trim().length > 0).length === 0) {
    return {
      sql: values.join(' '),
      bind: []
    }
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (typeof value === 'symbol') {
      sql += value.description + strings[i + 1]
    } else if (Array.isArray(value)) {
      sql += `(${Array.from({ length: value.length }).fill('?').join(',')})`
      bind.push(...value)
    } else {
      sql += '?' + strings[i + 1]
      bind.push(value)
    }
  }
  return {
    sql,
    bind
  }
}