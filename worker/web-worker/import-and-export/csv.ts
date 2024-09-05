import * as Papa from "papaparse"
import { v4 as uuidv4 } from "uuid"

import { FieldType } from "@/lib/fields/const"
import { ColumnTableName } from "@/lib/sqlite/const"
import { generateColumnName, getRawTableNameById } from "@/lib/utils"

import { DataSpace } from "../DataSpace"
import { TableManager } from "../sdk/table"
import { BaseImportAndExport } from "./base"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class CsvImportAndExport extends BaseImportAndExport {
  async guessColumnType(file: File): Promise<{
    [name: string]: "String" | "Number" | "Date"
  }> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const records = result.data
          const sampledRecords: any[] = []
          for (let i = 0; i < 10; i++) {
            const randomIndex = Math.floor(Math.random() * records.length)
            sampledRecords.push(records[randomIndex])
          }
          const columnTypes: {
            [name: string]: "String" | "Number" | "Date"
          } = {}
          for (
            let columnIndex = 0;
            columnIndex < Object.keys(sampledRecords[0]).length;
            columnIndex++
          ) {
            const columnName = Object.keys(sampledRecords[0])[columnIndex]
            let columnType: "String" | "Number" | "Date" = "String"
            const columnDataList = sampledRecords
              .map((record) => record[columnName])
              .filter((value) => value !== null && value !== undefined)
            if (columnDataList.length === 0) {
              columnTypes[columnName] = columnType
              continue
            }
            const _isNumber = columnDataList.every((value) => {
              return !isNaN(Number(value))
            })
            if (_isNumber) {
              columnType = "Number"
            }
            // const _isDate = columnDataList.every((value) => {
            //   return !isNaN(Date.parse(value))
            // })
            // if (_isDate) {
            //   columnType = "Date"
            // }
            columnTypes[columnName] = columnType
          }
          resolve(columnTypes)
        },
      })
    })
  }
  async import(file: File, dataSpace: DataSpace): Promise<string> {
    // name without extension
    const nodeName = file.name?.replace(/\.[^/.]+$/, "")
    const tableId = uuidv4().split("-").join("")
    let tm = new TableManager(tableId, dataSpace)
    let rows2Create: any[] = []
    const batchSize = 10000
    const start = performance.now()
    console.log("importing csv file", file)
    dataSpace.blockUIMsg("Analyzing file...")
    const types = await this.guessColumnType(file)
    await new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        preview: 1,
        step: (results: any, parser: any) => {
          const rawTableName = getRawTableNameById(tableId)
          let columns = Object.keys(results.data)
          columns.forEach((column, index) => {
            if (column.length === 0) {
              column = "unknown" + index
            }
          })
          const rawColumns = columns.map((column) => generateColumnName())
          let createTableSql = `
  CREATE TABLE ${rawTableName} (
    _id TEXT PRIMARY KEY NOT NULL,
    title TEXT  NULL,
    _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    _created_by TEXT DEFAULT 'unknown',
    _last_edited_by TEXT DEFAULT 'unknown',
    
  `
          rawColumns.forEach((column, index) => {
            const type = types[columns[index]]
            const isLastColumn = index === rawColumns.length - 1
            createTableSql +=
              `${column} ${type === "Number" ? "REAL" : "TEXT"} NULL` +
              (isLastColumn ? "\n" : ",\n")
          })
          createTableSql += `);`

          const typeFieldMap = {
            String: FieldType.Text,
            Number: FieldType.Number,
            Date: FieldType.Date,
          }
          columns.forEach((column, index) => {
            const type = types[column]
            const isFirstColumn = index === 0
            const fieldType = isFirstColumn
              ? "title"
              : typeFieldMap[type] || FieldType.Text
            const rawColumn = isFirstColumn ? "title" : rawColumns[index]
            // column maybe include injected code, so we need to escape it, the best way is use bind parameter
            const _column = column.replace(/'/g, "''")
            createTableSql += `INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('${_column}', '${fieldType}', '${rawTableName}', '${rawColumn}');`
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
    // console.log("fieldMap", fieldMap)
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
