import {
  CreateColumnDef,
  CreateTableStatement,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

/**
 * sqlite has some limitations on alter table, for example, we can't add a column with non-constant default value.
 * when we want to add new columns to a table
 * 1. we need to create a new table with new columns
 * 2. copy data from old table to new table
 * 3. then drop old table
 * 4. rename new table to old table name.
 * @param createTableSql
 * @param newColumnSql
 */
export function generateMergeTableWithNewColumnsSql(
  createTableSql: string,
  newColumnSql: string
) {
  const ast = parseFirst(createTableSql) as CreateTableStatement
  const tableName = ast.name.name
  const tmpTableName = `tmp_${tableName}`
  const tmpAst = parseFirst(`
  CREATE TABLE tb_123(
    ${newColumnSql}
  );`) as CreateTableStatement

  const newColumns = tmpAst.columns
  const oldColumns = ast.columns
  ast.columns = [...oldColumns, ...newColumns]
  ast.name.name = tmpTableName
  const newTmpTableSql = toSql.statement(ast)
  let sql = newTmpTableSql
  //   copy data
  sql += `\n;INSERT INTO ${tmpTableName} (${oldColumns
    .map((item) => (item as CreateColumnDef).name.name)
    .join(",")}) SELECT ${oldColumns
    .map((item) => (item as CreateColumnDef).name.name)
    .join(",")} FROM ${tableName};`
  //   drop old table
  sql += `DROP TABLE ${tableName};`
  //   rename new table
  sql += `ALTER TABLE ${tmpTableName} RENAME TO ${tableName};`
  return {
    newTmpTableSql,
    sql,
  }
}
