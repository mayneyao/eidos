import { FileTableName } from "@/lib/sqlite/const"

import { BaseTable } from "./base"

export class FileTable implements BaseTable {
  name = FileTableName
  createTableSql = ``
}
