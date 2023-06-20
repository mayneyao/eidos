import Papa from "papaparse"
import { v4 as uuidv4 } from "uuid"

import { logger } from "@/lib/log"
import { getRawTableNameById } from "@/lib/utils"

export type ISqls = {
  sql: string
  bind: any[]
}[]
export const csvFile2Sql = async (
  file: File,
  tableName: string
): Promise<{
  createTableSql: string
  tableId: string
  sqls: ISqls
}> => {
  let hasCreateTable = false
  const tableId = uuidv4().split("-").join("")
  let createTableSql = ""
  const sqls: ISqls = []

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any, file: any) => {
        logger.info("Parsing complete:", results, file)
        resolve({
          createTableSql,
          sqls,
          tableId,
        })
      },
      step: (results: any, parser: any) => {
        const rawTableName = getRawTableNameById(tableId)
        if (!hasCreateTable) {
          const columns = Object.keys(results.data)
          createTableSql = `
  CREATE TABLE ${rawTableName} (
    _id VARCHAR(32) PRIMARY KEY NOT NULL
    ,${columns.join(" VARCHAR(100)  NULL,\n") + " VARCHAR(100)  NULL"}
  );
  `
          hasCreateTable = true
        } else {
          const columns = Object.keys(results.data)
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
