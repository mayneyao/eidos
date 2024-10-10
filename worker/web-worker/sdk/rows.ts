import { uuidv7 } from "uuidv7"

import { MsgType } from "@/lib/const"
import { getFieldInstance } from "@/lib/fields"
import { FieldType } from "@/lib/fields/const"
import { IView } from "@/lib/store/IView"
import type { IField } from "@/lib/store/interface"

import { DataSpace } from "../DataSpace"
import { workerStore } from "../store"
import { TableManager } from "./table"
import { BaseServerDatabase } from "@/lib/sqlite/interface"
import { NodeServerDatabase } from "@/electron/sqlite-server"

export class RowsManager {
  dataSpace: DataSpace
  fieldMap?: {
    fieldRawColumnNameFieldMap: Record<string, IField>
    fieldNameRawColumnNameMap: Record<string, string>
  }
  tableManager: TableManager
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
    this.tableManager = table
  }

  static getReadableRows(rows: Record<string, any>[], fields: IField[]) {
    const fieldMap = fields.reduce((acc, cur) => {
      acc[cur.table_column_name] = cur
      return acc
    }, {} as Record<string, IField>)
    return rows.map((row) => {
      const data: Record<string, any> = {}
      Object.entries(row).forEach(([key, value]) => {
        const field = fieldMap[key]
        if (key.startsWith("cl_") && field) {
          const readableFieldName = field.name
          data[readableFieldName] = value
        } else {
          data[key] = value
        }
      })
      return data
    })
  }

  async getFieldMap() {
    if (this.fieldMap) {
      return this.fieldMap
    }
    // query ui columns
    const uiColumns = await this.dataSpace.column.list({
      table_name: this.table.rawTableName,
    })

    const fieldRawColumnNameFieldMap = uiColumns.reduce((acc, cur) => {
      acc[cur.table_column_name] = cur
      return acc
    }, {} as Record<string, IField>)

    const fieldNameRawColumnNameMap = uiColumns.reduce((acc, cur) => {
      acc[cur.name] = cur.table_column_name
      return acc
    }, {} as Record<string, string>)

    this.fieldMap = {
      fieldRawColumnNameFieldMap,
      fieldNameRawColumnNameMap,
    }
    return this.fieldMap
  }

  static rawData2Json(
    row: Record<string, any>,
    fieldRawColumnNameFieldMap: Record<string, IField>
  ) {
    const data: Record<string, any> = {}
    Object.entries(row).forEach(([key, value]) => {
      if (key === "rowid") {
        // pass
      } else if (key === "_id") {
        data[key] = value
      } else {
        const uiColumn = fieldRawColumnNameFieldMap[key]
        if (!uiColumn) {
          //
          return
        }
        const field = getFieldInstance(uiColumn)
        data[uiColumn.name] = field.rawData2JSON(value as never)
      }
    })
    return data
  }

  transformData(
    data: Record<string, any>,
    context: {
      fieldNameRawColumnNameMap: Record<string, string>
      fieldRawColumnNameFieldMap: Record<string, IField>
    },
    options?: {
      useFieldId?: boolean
    }
  ) {
    const { fieldRawColumnNameFieldMap, fieldNameRawColumnNameMap } = context
    const notExistKeys: string[] = []
    Object.keys(data).forEach((key) => {
      const rawColumnName = options?.useFieldId
        ? key
        : fieldNameRawColumnNameMap[key]
      if (key === "_id" || (key.startsWith("cl_") && key.length > 7)) {
        // pass
      } else if (!rawColumnName) {
        // delete key
        delete data[key]
        notExistKeys.push(key)
      } else {
        // transform text to raw data
        const uiColumn = fieldRawColumnNameFieldMap[rawColumnName]
        const field = getFieldInstance(uiColumn)
        data[key] = field.text2RawData(data[key])
      }
    })

    const kvTuple: [string, any][] = []
    Object.entries(data).forEach(([key, value]) => {
      if (key === "_id") {
        kvTuple.push([key, value])
      } else {
        const rawColumnName = options?.useFieldId
          ? key
          : fieldNameRawColumnNameMap[key]
        kvTuple.push([rawColumnName, value])
      }
    })
    return {
      notExistKeys,
      rawData: Object.fromEntries(kvTuple),
    }
  }

  /**
   * get row by id
   * @param id
   * @returns
   */
  async get(id: string, options?: { raw?: boolean; withRowId?: boolean }) {
    const { fieldRawColumnNameFieldMap } = await this.getFieldMap()
    let sql = `SELECT * FROM ${this.table.rawTableName} WHERE _id = ?`
    if (options?.withRowId) {
      sql = `SELECT rowid, * FROM ${this.table.rawTableName} WHERE _id = ?`
    }
    const rows = await this.dataSpace.exec2(sql, [id])
    if (rows.length === 0) {
      return null
    }
    if (options?.raw) {
      return rows[0]
    }
    return RowsManager.rawData2Json(rows[0], fieldRawColumnNameFieldMap)
  }

  /**
   * @param filter a filter object, the key is field name, the value is field value
   * @param options
   * @returns
   */
  async query(
    filter: Record<string, any> = {},
    options?: {
      viewId?: string
      limit?: number
      offset?: number
      raw?: boolean
      select?: string[]
      rawQuery?: string // if set, it will ignore viewId and filter
    }
  ) {
    const { fieldRawColumnNameFieldMap, fieldNameRawColumnNameMap } =
      await this.getFieldMap()

    let rows: Record<string, any>[] = []
    if (options?.rawQuery) {
      rows = await this.dataSpace.exec2(options.rawQuery)
    } else if (options?.viewId) {
      const view: IView = await this.dataSpace.view.get(options.viewId)
      if (!view) {
        throw new Error("view not found")
      }
      rows = await this.dataSpace.exec2(view.query)
    } else {
      const { rawData, notExistKeys } = this.transformData(filter || {}, {
        fieldNameRawColumnNameMap,
        fieldRawColumnNameFieldMap,
      })
      if (notExistKeys.length > 0) {
        throw new Error(`not exist keys: ${notExistKeys.join(",")}`)
      }

      const hasFilter = Object.keys(rawData).length > 0
      const sql = `SELECT * FROM ${this.table.rawTableName} ${hasFilter ? "WHERE" : ""
        } ${Object.keys(rawData)
          .map((key) => `${key} = ?`)
          .join(" AND ")} ${options?.limit ? `LIMIT ${options.limit}` : ""} ${options?.offset ? `OFFSET ${options.offset}` : ""
        }`
      const bind = Object.values(rawData)
      rows = await this.dataSpace.exec2(sql, bind)
    }
    if (options?.raw) {
      return rows
    }
    return rows.map((row) =>
      RowsManager.rawData2Json(row, fieldRawColumnNameFieldMap)
    )
  }

  getCreateData(data: Record<string, any>): Record<string, any> {
    return {
      _id: uuidv7(),
      _created_by: workerStore.currentCallUserId,
      _last_edited_by: workerStore.currentCallUserId,
      ...data,
    }
  }

  getUpdateData(data: Record<string, any>) {
    const { _id, _created_by, _created_time, ...restData } = data
    return {
      ...restData,
      _last_edited_time: new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ")
        .replace("Z", ""),
      _last_edited_by: workerStore.currentCallUserId,
    }
  }

  /**
   * for high performance, use transaction
   * @param datas
   * @param fieldMap
   * @param options
   * @returns
   */
  batchSyncCreate(
    datas: Record<string, any>[],
    fieldMap: {
      fieldRawColumnNameFieldMap: Record<string, IField>
      fieldNameRawColumnNameMap: Record<string, string>
    },
    options?: {
      useFieldId?: boolean
    }
  ) {
    const { fieldRawColumnNameFieldMap, fieldNameRawColumnNameMap } = fieldMap
    const createDatas = datas.map((data) => {
      const { rawData, notExistKeys } = this.transformData(
        data,
        {
          fieldNameRawColumnNameMap,
          fieldRawColumnNameFieldMap,
        },
        {
          useFieldId: options?.useFieldId,
        }
      )
      if (notExistKeys.length > 0) {
        throw new Error(`not exist keys: ${notExistKeys.join(",")}`)
      }
      return this.getCreateData(rawData)
    })
    const keys = Object.keys(createDatas[0]).join(",")
    const values = createDatas.map((data) => Object.values(data))
    const _values = Array(values[0].length).fill("?").join(",")

    const stmt = this.dataSpace.db.prepare(`
      INSERT INTO ${this.table.rawTableName} (${keys}) VALUES (${_values})`)
    // for high performance, use transaction
    if (this.dataSpace.db instanceof BaseServerDatabase) {
      for (const value of values) {
        stmt.run(value)
      }
    } else {
      this.dataSpace.db.transaction(async () => {
        for (const value of values) {
          stmt.bind(value).step()
          stmt.reset()
        }
        stmt.finalize()
      })
    }
    return createDatas
  }

  async create(
    data: Record<string, any>,
    options?: {
      // it means the key is raw_column_name not show name
      useFieldId?: boolean
    }
  ) {
    // query ui columns
    const { fieldRawColumnNameFieldMap, fieldNameRawColumnNameMap } =
      await this.getFieldMap()

    const { rawData, notExistKeys } = this.transformData(
      data,
      {
        fieldNameRawColumnNameMap,
        fieldRawColumnNameFieldMap,
      },
      {
        useFieldId: options?.useFieldId,
      }
    )
    if (notExistKeys.length > 0) {
      throw new Error(`not exist keys: ${notExistKeys.join(",")}`)
    }
    const createData = this.getCreateData(rawData)
    const keys = Object.keys(createData).join(",")
    const values = Object.values(createData)
    const _values = Array(values.length).fill("?").join(",")
    const sql = `INSERT INTO ${this.table.rawTableName} (${keys}) VALUES (${_values})`
    await this.dataSpace.exec2(sql, values)
    this.dataSpace.undoRedoManager.event()
    return createData
  }

  async delete(id: string) {
    try {
      await this.dataSpace.exec2(
        `DELETE FROM ${this.table.rawTableName} WHERE _id = ?`,
        [id]
      )
      return true
    } catch (error) {
      return false
    }
  }

  async batchDelete(ids: string[]) {
    try {
      const sql = `DELETE FROM ${this.table.rawTableName} WHERE _id IN (${ids
        .map(() => "?")
        .join(",")})`
      console.log(sql)
      await this.dataSpace.exec2(sql, ids)
      return true
    } catch (error) {
      return false
    }
  }

  private updateCellSideEffect = async (
    field: IField<any>,
    rowId: string,
    value: any
  ) => {
    switch (field?.type) {
      // if field type is select or multiSelect, we need to update select option
      case FieldType.Select:
        await this.tableManager.fields.select.updateFieldPropertyIfNeed(
          field,
          value
        )
        break
      case FieldType.MultiSelect:
        await this.tableManager.fields.multiSelect.updateFieldPropertyIfNeed(
          field,
          value
        )
        break
      case FieldType.Link:
        const row = await this.tableManager.rows.get(rowId, { raw: true })
        const oldValue = row?.[field.table_column_name]
        await this.tableManager.fields.link.updateLinkRelation(
          field,
          rowId,
          value,
          oldValue
        )
        break
      default:
        break
    }
  }

  async update(
    id: string,
    data: Record<string, any>,
    options?: {
      useFieldId?: boolean
    }
  ) {
    const { fieldRawColumnNameFieldMap, fieldNameRawColumnNameMap } =
      await this.getFieldMap()
    const { rawData, notExistKeys } = this.transformData(
      data,
      {
        fieldNameRawColumnNameMap,
        fieldRawColumnNameFieldMap,
      },
      {
        useFieldId: options?.useFieldId,
      }
    )
    if (notExistKeys.length > 0) {
      throw new Error(`not exist keys: ${notExistKeys.join(",")}`)
    }

    const updateData = this.getUpdateData(rawData)

    for (const [key, value] of Object.entries(updateData)) {
      const field = fieldRawColumnNameFieldMap[key]
      if (field) {
        await this.updateCellSideEffect(field, id, value)
      }
    }
    const values = Object.values(updateData)
    const sql = `UPDATE ${this.table.rawTableName} SET ${Object.keys(updateData)
      .map((key) => `${key} = ?`)
      .join(",")} WHERE _id = ?`
    const bind = [...values, id]
    await this.dataSpace.exec2(sql, bind)

    this.dataSpace.undoRedoManager.event()

    return {
      id,
      ...updateData,
    }
  }

  /**
   * highlight the row if it is in the current view
   * @param id row id
   */
  async highlight(id: string) {
    postMessage({
      type: MsgType.HighlightRow,
      payload: {
        tableId: this.table.id,
        rowId: id,
      },
    })
  }
}
