import { allFieldTypesMap } from "@/lib/fields"
import type { IField } from "@/lib/store/interface"
import { uuidv4 } from "@/lib/utils"

import { DataSpace } from "../DataSpace"
import { TableManager } from "./table"

export class RowsManager {
  dataSpace: DataSpace
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
  }

  async getFieldMap() {
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

    return {
      fieldRawColumnNameFieldMap,
      fieldNameRawColumnNameMap,
    }
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
        const fieldType = uiColumn.type
        const fieldCls = allFieldTypesMap[fieldType]
        const field = new fieldCls(uiColumn)
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
      noGenerateId?: boolean
      noId?: boolean
      useFieldId?: boolean
    }
  ) {
    const { _id, ...restData } = data
    const { fieldRawColumnNameFieldMap, fieldNameRawColumnNameMap } = context
    const notExistKeys: string[] = []
    Object.keys(restData).forEach((key) => {
      const rawColumnName = options?.useFieldId
        ? key
        : fieldNameRawColumnNameMap[key]
      if (!rawColumnName) {
        // delete key
        delete restData[key]
        notExistKeys.push(key)
      } else {
        // transform text to raw data
        const uiColumn = fieldRawColumnNameFieldMap[rawColumnName]
        const fieldType = uiColumn.type
        const fieldCls = allFieldTypesMap[fieldType]
        const field = new fieldCls(uiColumn)
        restData[key] = field.text2RawData(restData[key])
      }
    })

    const kvTuple: [string, any][] = options?.noId
      ? []
      : [["_id", options?.noGenerateId ? _id : uuidv4()]]

    Object.entries(restData).forEach(([key, value]) => {
      const rawColumnName = options?.useFieldId
        ? key
        : fieldNameRawColumnNameMap[key]
      kvTuple.push([rawColumnName, value])
    })
    return {
      notExistKeys,
      rawData: Object.fromEntries(kvTuple),
    }
  }

  async query(
    filter: Record<string, any> = {},
    options?: {
      limit?: number
      offset?: number
      raw?: boolean
    }
  ) {
    const { fieldRawColumnNameFieldMap, fieldNameRawColumnNameMap } =
      await this.getFieldMap()

    const { rawData, notExistKeys } = this.transformData(
      filter,
      {
        fieldNameRawColumnNameMap,
        fieldRawColumnNameFieldMap,
      },
      {
        noGenerateId: true,
        noId: true,
      }
    )
    if (notExistKeys.length > 0) {
      throw new Error(`not exist keys: ${notExistKeys.join(",")}`)
    }

    const hasFilter = Object.keys(rawData).length > 0
    const sql = `SELECT * FROM ${this.table.rawTableName} ${
      hasFilter ? "WHERE" : ""
    } ${Object.keys(rawData)
      .map((key) => `${key} = ?`)
      .join(" AND ")} ${options?.limit ? `LIMIT ${options.limit}` : ""} ${
      options?.offset ? `OFFSET ${options.offset}` : ""
    }`
    const bind = Object.values(rawData)
    const rows = await this.dataSpace.exec2(sql, bind)
    if (options?.raw) {
      return rows
    }
    return rows.map((row) =>
      RowsManager.rawData2Json(row, fieldRawColumnNameFieldMap)
    )
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
    const { _id, ...restData } = rawData
    const keys = ["_id", ...Object.keys(restData)].join(",")
    const values = [_id ?? uuidv4(), ...Object.values(restData)]
    const _values = Array(values.length).fill("?").join(",")
    const sql = `INSERT INTO ${this.table.rawTableName} (${keys}) VALUES (${_values})`
    await this.dataSpace.exec2(sql, values)
    return rawData
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

    const { _id, ...restData } = rawData
    const values = Object.values(restData)
    const sql = `UPDATE ${this.table.rawTableName} SET ${Object.keys(restData)
      .map((key) => `${key} = ?`)
      .join(",")} WHERE _id = ?`
    const bind = [...values, id]
    await this.dataSpace.exec2(sql, bind)
    return {
      _id: id,
      ...restData,
    }
  }
}
