import Papa from "papaparse"
import { v4 as uuidv4 } from "uuid"

import { logger } from "@/lib/log"
import { ColumnTableName } from "@/lib/sqlite/const"
import { getRawTableNameById } from "@/lib/utils"

export type ISqls = {
  sql: string
  bind: any[]
}[]
export const csvFile2Sql = async (
  file: File
): Promise<{
  createTableSql: string
  columns: string[]
  tableId: string
  sqls: ISqls
}> => {
  let hasCreateTable = false
  const tableId = uuidv4().split("-").join("")
  let createTableSql = ""
  const sqls: ISqls = []
  let columns: string[] = []

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any, file: any) => {
        logger.info("Parsing complete:", results, file)
        resolve({
          createTableSql,
          sqls,
          columns,
          tableId,
        })
      },
      step: (results: any, parser: any) => {
        const rawTableName = getRawTableNameById(tableId)
        if (!hasCreateTable) {
          columns = Object.keys(results.data)
          createTableSql = `
  CREATE TABLE ${rawTableName} (
    _id TEXT PRIMARY KEY NOT NULL
    ,${columns.join(" TEXT  NULL,\n") + " VARCHAR(100)  NULL"}
  );
  INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('_id', 'text', '${rawTableName}', '_id');
  `
          columns.forEach((column) => {
            createTableSql += `INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('${column}', 'text', '${rawTableName}', '${column}');`
          })

          hasCreateTable = true
        } else {
          const values = Object.values(results.data)
          const _values = [uuidv4(), ...values].map((item: any) => `'${item}'`)
          const _columns = ["_id", ...columns]
          const sql = `INSERT INTO ${rawTableName} (${_columns.join(
            ","
          )}) VALUES (${Array.from(_values).fill("?").join(",")});`
          sqls.push({
            sql,
            bind: [uuidv4(), ...values],
          })
        }
      },
    })
  })
}
