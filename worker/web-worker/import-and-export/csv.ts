import Papa from "papaparse"
import { v4 as uuidv4 } from "uuid"

import { ColumnTableName } from "@/lib/sqlite/const"
import { generateColumnName, getRawTableNameById } from "@/lib/utils"

import { DataSpace } from "../DataSpace"
import { TableManager } from "../sdk/table"
import { BaseImportAndExport } from "./base"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class CsvImportAndExport extends BaseImportAndExport {
  async import(file: File, dataSpace: DataSpace): Promise<string> {
    // name without extension
    const nodeName = file.name.replace(/\.[^/.]+$/, "")
    const tableId = uuidv4().split("-").join("")
    let tm = new TableManager(tableId, dataSpace)
    let rows2Create: any[] = []
    const batchSize = 10000
    const start = performance.now()
    console.log("importing csv file", file)
    await new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        preview: 1,
        step: (results: any, parser: any) => {
          const rawTableName = getRawTableNameById(tableId)
          const columns = Object.keys(results.data)
          const rawColumns = columns.map((column) => generateColumnName())
          let createTableSql = `
  CREATE TABLE ${rawTableName} (
    _id TEXT PRIMARY KEY NOT NULL,
    title TEXT  NULL,
    _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    _created_by TEXT DEFAULT 'unknown',
    _last_edited_by TEXT DEFAULT 'unknown',
    ${rawColumns.join(" TEXT  NULL,\n") + " VARCHAR(100)  NULL"}
  );
  INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('title', 'title', '${rawTableName}', 'title');
  `
          columns.forEach((column, index) => {
            const rawColumn = rawColumns[index]
            createTableSql += `INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('${column}', 'text', '${rawTableName}', '${rawColumn}');`
          })

          dataSpace.blockUIMsg("Creating table...")
          dataSpace
            .createTable(tableId, nodeName, createTableSql)
            .then((res) => {
              resolve(results)
            })
        },
      })
    })

    await sleep(1000)
    const fieldMap = await tm.rows.getFieldMap()
    console.log("fieldMap", fieldMap)
    dataSpace.blockUIMsg("Importing data...")
    // for high performance, turn off foreign key constraints
    // dataSpace.db.exec("PRAGMA foreign_keys = OFF;")

    /**
     * PRAGMA journal_mode = OFF;
      PRAGMA synchronous = 0;
      PRAGMA cache_size = 1000000;
      PRAGMA locking_mode = EXCLUSIVE;
      PRAGMA temp_store = MEMORY;
     */

    dataSpace.db.exec("PRAGMA journal_mode = OFF;")
    dataSpace.db.exec("PRAGMA synchronous = 0;")
    dataSpace.db.exec("PRAGMA cache_size = 1000000;")
    dataSpace.db.exec("PRAGMA locking_mode = EXCLUSIVE;")
    dataSpace.db.exec("PRAGMA temp_store = MEMORY;")

    await new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function (results) {
          if (rows2Create.length > 0) {
            tm.rows.batchSyncCreate(rows2Create, fieldMap)
          }
          resolve(results)
          const end = performance.now()
          console.log("import csv file done", end - start)
          dataSpace.blockUIMsg(null)
        },
        step: (results: any, parser: any) => {
          rows2Create.push(results.data)
          if (rows2Create.length === batchSize) {
            tm.rows.batchSyncCreate(rows2Create, fieldMap)
            dataSpace.blockUIMsg("Importing data...", {
              progress: (results.meta.cursor / file.size) * 100,
            })
            rows2Create = []
          }
        },
      })
    })
    // dataSpace.db.exec("PRAGMA foreign_keys = ON;")
    return tableId
  }
  async export(nodeId: string, dataSpace: DataSpace): Promise<File> {
    const tableName = getRawTableNameById(nodeId)
    const columns = await dataSpace.column.list({ table_name: tableName })
    const columnNames = columns.map((column) => column.name)
    const tm = new TableManager(nodeId, dataSpace)
    const rows = await tm.rows.query()
    const csv = Papa.unparse({ fields: columnNames, data: rows })
    const blob = new Blob([csv], { type: "text/csv" })
    return new File([blob], `${tableName}.csv`)
  }
}
