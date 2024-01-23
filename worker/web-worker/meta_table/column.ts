import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { FieldType } from "@/lib/fields/const"
import { ColumnTableName } from "@/lib/sqlite/const"
import { transformFormula2VirtualGeneratedField } from "@/lib/sqlite/sql-formula-parser"
import { IField } from "@/lib/store/interface"

import { BaseTable, BaseTableImpl } from "./base"

const bc = new BroadcastChannel(EidosDataEventChannelName)

export class ColumnTable extends BaseTableImpl implements BaseTable<IField> {
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
  JSONFields: string[] = ["property"]

  async add(data: IField): Promise<IField> {
    const { name, type, table_name, table_column_name, property } = data
    const typeMap: any = {
      [FieldType.Checkbox]: "BOOLEAN",
      [FieldType.Number]: "REAL",
      [FieldType.Rating]: "INT",
    }
    const columnType = typeMap[type] ?? "TEXT"
    await this.dataSpace.withTransaction(async () => {
      let _property = property
      if (type === FieldType.Formula) {
        _property = { formula: "upper(title)" }
      }
      this.dataSpace.exec(
        `INSERT INTO ${ColumnTableName} (name,type,table_name,table_column_name,property) VALUES (?,?,?,?,?)`,
        [name, type, table_name, table_column_name, JSON.stringify(_property)]
      )
      switch (type) {
        case FieldType.Formula:
          this.dataSpace.exec(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (upper(title));`
          )
          break
        case FieldType.CreatedTime:
          this.dataSpace.exec(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_created_time);`
          )
          break
        case FieldType.LastEditedTime:
          this.dataSpace.exec(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_last_edited_time);`
          )
          break
        default:
          this.dataSpace.exec(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} ${columnType};`
          )
          break
      }
    })
    bc.postMessage({
      type: EidosDataEventChannelMsgType.DataUpdateSignalType,
      payload: {
        type: DataUpdateSignalType.AddColumn,
        table: table_name,
        column: data,
      },
    })
    return data
  }

  get(id: string): Promise<IField | null> {
    throw new Error("Method not implemented.")
  }
  set(id: string, data: Partial<IField>): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  del(id: string): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  async deleteField(tableName: string, tableColumnName: string) {
    try {
      await this.dataSpace.withTransaction(async () => {
        // update trigger before delete column
        await this.dataSpace.onTableChange(this.dataSpace.dbName, tableName, [
          tableColumnName,
        ])
        await this.dataSpace.sql`DELETE FROM ${Symbol(
          ColumnTableName
        )} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`
        await this.dataSpace.exec2(
          `ALTER TABLE ${tableName} DROP COLUMN ${tableColumnName};`
        )
      })
    } catch (error) {
      this.dataSpace.notify({
        title: "Error",
        description:
          "Failed to delete column, because it is referenced by other fields",
      })
    }
  }

  /**
   * @param tableName tb_<uuid>
   */
  async deleteByRawTableName(tableName: string) {
    await this.dataSpace.exec2(
      `DELETE FROM ${ColumnTableName} WHERE table_name=?;`,
      [tableName]
    )
  }

  async updateProperty(data: {
    tableName: string
    tableColumnName: string
    property: any
    isFormula?: boolean
  }) {
    const { tableName, tableColumnName, property, isFormula } = data
    await this.dataSpace.withTransaction(async () => {
      await this.dataSpace.sql`UPDATE ${Symbol(
        ColumnTableName
      )} SET property = ${JSON.stringify(
        property
      )} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`

      if (isFormula) {
        const fields = await this.list({ table_name: tableName })
        const formulaExpr = transformFormula2VirtualGeneratedField(
          tableColumnName,
          fields
        )
        this.dataSpace.exec(
          `
          ALTER TABLE ${tableName} DROP COLUMN ${tableColumnName};
          ALTER TABLE ${tableName} ADD COLUMN ${tableColumnName} GENERATED ALWAYS AS ${formulaExpr};
          `
        )
        bc.postMessage({
          type: EidosDataEventChannelMsgType.DataUpdateSignalType,
          payload: {
            type: DataUpdateSignalType.UpdateColumn,
            table: tableName,
            column: data,
          },
        })
      }
    })
  }

  async list(q: { table_name: string }): Promise<IField[]> {
    const res = await super.list(q)
    return res.filter((col) => !col.name.startsWith("_"))
  }
}
