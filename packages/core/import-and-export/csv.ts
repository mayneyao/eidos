import { v4 as uuidv4 } from "uuid"

import { FieldType } from "../fields/const"
import { ColumnTableName } from "../sqlite/const"
import { generateColumnName, getRawTableNameById } from "@/lib/utils"

import type { DataSpace } from "../data-space"
import { TableManager } from "../sdk/table"
import { BaseImportAndExport } from "./base"
import { parse } from "csv-parse/sync"
import { stringify } from "csv-stringify/sync"
import type { Stringifier } from "csv-stringify"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class CsvImportAndExport extends BaseImportAndExport {
  useWal: boolean
  constructor({ useWal = true }: { useWal?: boolean }) {
    super()
    this.useWal = useWal
  }

  async guessColumnType(content: string): Promise<{
    [name: string]: "String" | "Number" | "Date"
  }> {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      to: 1000
    })

    const sampleSize = Math.min(10, records.length)
    const sampledRecords: any[] = []
    const seen = new Set()

    while (sampledRecords.length < sampleSize) {
      const randomIndex = Math.floor(Math.random() * records.length)
      if (!seen.has(randomIndex)) {
        seen.add(randomIndex)
        sampledRecords.push(records[randomIndex])
      }
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
    return columnTypes
  }

  async import(file: { name: string; content: string }, dataSpace: DataSpace): Promise<string> {
    dataSpace.blockUIMsg("Starting import...")
    const nodeName = file.name?.replace(/\.[^/.]+$/, "")
    const tableId = uuidv4().split("-").join("")
    let tm = new TableManager(tableId, dataSpace)
    const batchSize = 20000
    const start = performance.now()

    try {
      if (!file.content.trim()) {
        throw new Error("CSV file is empty")
      }

      const firstParseResult = parse(file.content, {
        columns: (headers: string[]) => {
          return headers.map((header, index) => {
            const cleaned = (header || '').trim()
            return cleaned || `unknown${index}`
          })
        },
        skip_empty_lines: true,
        to: 1
      })

      console.log('Parse result:', firstParseResult)
      console.log('Header row:', firstParseResult[0])

      if (!Array.isArray(firstParseResult) || firstParseResult.length === 0) {
        throw new Error("Failed to parse CSV header")
      }

      const headerRow = firstParseResult[0]
      if (!headerRow || typeof headerRow !== 'object') {
        throw new Error("Invalid CSV header format")
      }

      let columns = Object.keys(headerRow)
      if (columns.length === 0) {
        throw new Error("No columns found in CSV")
      }

      const previewContent = file.content.split('\n').slice(0, 1001).join('\n')
      dataSpace.blockUIMsg("Analyzing file structure...")
      const types = await this.guessColumnType(previewContent)

      const lines = file.content.split('\n').filter(line => line.trim())
      if (lines.length < 2) {
        throw new Error("CSV file must contain at least one data row")
      }

      const header = lines[0]

      const rawTableName = getRawTableNameById(tableId)
      let rawColumns = columns.map((column) => generateColumnName())
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
      await dataSpace.createTableViaSchema(tableId, nodeName, createTableSql)
      await sleep(1000)
      const fieldMap = await tm.rows.getFieldMap()

      const cacheSize = 2 * 1024 * 1024
      // dataSpace.db.exec("PRAGMA journal_mode = OFF;")
      await dataSpace.db.exec("PRAGMA synchronous = 0;")
      await dataSpace.db.exec(`PRAGMA cache_size = ${cacheSize};`)
      await dataSpace.db.exec("PRAGMA locking_mode = EXCLUSIVE;")
      await dataSpace.db.exec("PRAGMA temp_store = MEMORY;")

      console.log('locksInfo:', await dataSpace.sql`PRAGMA locking_mode`)

      const dataLines = lines.slice(1)
      const totalRows = dataLines.length
      let processedRows = 0
      let lastUIUpdate = Date.now()
      const UI_UPDATE_INTERVAL = 500

      dataSpace.blockUIMsg("Importing data...")

      for (let i = 0; i < dataLines.length; i += batchSize) {
        const batchLines = [header, ...dataLines.slice(i, i + batchSize)]
        const batchContent = batchLines.join('\n')
        let records
        try {
          records = parse(batchContent, {
            columns: (headers: string[]) => {
              return headers.map((header, index) => {
                const cleaned = (header || '').trim()
                return cleaned || `unknown${index}`
              })
            },
            skip_empty_lines: true,
            relax_column_count: true,
          })

          records.shift()
          records = records.filter((record: any) => {
            return record && typeof record === 'object' &&
              Object.keys(record).length > 0 &&
              !Object.keys(record).includes('')
          })
          if (records.length > 0) {
            await tm.rows.batchSyncCreate(records, fieldMap)
            processedRows += records.length
          }
        } catch (err) {
          console.warn(`Error processing batch at index ${i}:`, err)
          continue
        }

        const now = Date.now()
        if (now - lastUIUpdate >= UI_UPDATE_INTERVAL) {
          dataSpace.blockUIMsg("Importing data...", {
            progress: (processedRows / totalRows) * 100,
          })
          lastUIUpdate = now
          await new Promise(resolve => setTimeout(resolve, 0))
        }

        if (i % (batchSize * 5) === 0) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }

      const end = performance.now()
      console.log("import csv file done", end - start)
      dataSpace.blockUIMsg(null)
      return tableId

    } catch (error) {
      console.error("CSV import error:", error)
      dataSpace.blockUIMsg(null)
      throw error
    } finally {
      // restore default config
      if (this.useWal) {
        await dataSpace.db.exec("PRAGMA journal_mode = WAL;")
      } else {
        await dataSpace.db.exec("PRAGMA journal_mode = OFF;")
      }
      await dataSpace.db.exec("PRAGMA synchronous = 1;")
      await dataSpace.db.exec("PRAGMA locking_mode = NORMAL;")
    }
  }

  async export(nodeId: string, dataSpace: DataSpace): Promise<string> {
    const tableName = getRawTableNameById(nodeId)
    const columns = await dataSpace.column.list({ table_name: tableName })
    const columnNames = columns.map((column) => column.name)
    const tm = new TableManager(nodeId, dataSpace)
    const rows = await tm.rows.query()
    const csv = stringify(rows, { header: true, columns: columnNames })
    if (typeof csv === "string") {
      return csv
    } else {
      return new Promise((resolve, reject) => {
        const chunks: string[] = [];
        (csv as Stringifier)
          .on('data', (chunk) => chunks.push(chunk.toString()))
          .on('error', reject)
          .on('end', () => resolve(chunks.join('')));
      });
    }
  }
}
