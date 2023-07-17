import { ColumnTableName } from "@/lib/sqlite/const"

import { BaseTable } from "./base"

export class ColumnTable implements BaseTable {
  name = ColumnTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${ColumnTableName} (
    name TEXT,
    type TEXT,
    table_name TEXT,
    table_column_name TEXT,
    property TEXT
  );
`
}
