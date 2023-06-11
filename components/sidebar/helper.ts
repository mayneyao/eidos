import Papa from "papaparse"
import { v4 as uuidv4 } from "uuid"

import { logger } from "@/lib/log"

export const csvFile2Sql = async (
  file: File,
  tableName: string
): Promise<{
  createTableSql: string
  insertSql: string
}> => {
  let hasCreateTable = false
  let createTableSql = ""
  let insertSql = ""

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any, file: any) => {
        logger.info("Parsing complete:", results, file)
        resolve({
          createTableSql,
          insertSql,
        })
      },
      step: (results: any, parser: any) => {
        if (!hasCreateTable) {
          const columns = Object.keys(results.data)
          createTableSql = `
  CREATE TABLE ${tableName} (
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
          const sql = `INSERT INTO ${tableName} (${_columns.join(
            ","
          )}) VALUES (${_values.join(",")});\n`
          insertSql += sql
        }
      },
    })
  })
}
