export function isReadOnlySql(sql: string) {
  const readonlySqls = [
    'SELECT',
    'PRAGMA',
    'EXPLAIN',
    'ANALYZE',
  ]
  return readonlySqls.some(item => sql.trim().toUpperCase().startsWith(item))
}