import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { FieldType } from "@/lib/fields/const"
import { ILinkProperty } from "@/lib/fields/link"
import { ColumnTableName } from "@/lib/sqlite/const"
import { transformFormula2VirtualGeneratedField } from "@/lib/sqlite/sql-formula-parser"
import { IField } from "@/lib/store/interface"
import { getTableIdByRawTableName } from "@/lib/utils"

import { TableManager } from "../sdk/table"
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
    property TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(table_name, table_column_name)
  );

  CREATE TRIGGER IF NOT EXISTS column_insert_trigger_${ColumnTableName}
  AFTER INSERT ON ${ColumnTableName}
  FOR EACH ROW
  BEGIN
      SELECT eidos_column_event_insert(new.table_name, json_object('name', new.name, 'type', new.type, 'table_name', new.table_name, 'table_column_name', new.table_column_name, 'property', new.property));
  END;
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
    const tableId = getTableIdByRawTableName(table_name)
    await this.dataSpace.db.transaction(async (db) => {
      let _property = property
      if (type === FieldType.Formula) {
        _property = { formula: "upper(title)" }
      }
      // add ui column
      this.dataSpace.syncExec2(
        `INSERT INTO ${ColumnTableName} (name,type,table_name,table_column_name,property) VALUES (?,?,?,?,?)`,
        [name, type, table_name, table_column_name, JSON.stringify(_property)],
        db
      )
      // add real column in table
      switch (type) {
        case FieldType.Formula:
          this.dataSpace.syncExec2(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (upper(title));`,
            [],
            db
          )
          break
        case FieldType.CreatedTime:
          this.dataSpace.syncExec2(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_created_time);`,
            [],
            db
          )
          break
        case FieldType.LastEditedTime:
          this.dataSpace.syncExec2(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_last_edited_time);`,
            [],
            db
          )
          break
        case FieldType.Link:
          const tm = new TableManager(tableId, this.dataSpace)
          await tm.fields.link.addField(data, db)
          break
        default:
          this.dataSpace.syncExec2(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} ${columnType};`,
            [],
            db
          )
          break
      }
    })

    return data
  }

  async getColumn<T = any>(
    tableName: string,
    tableColumnName: string
  ): Promise<IField<T> | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${ColumnTableName} WHERE table_name=? AND table_column_name=?`,
      [tableName, tableColumnName]
    )
    if (res.length === 0) return null
    return this.toJson(res[0])
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
      console.error(error)
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
  async deleteByRawTableName(tableName: string, db = this.dataSpace.db) {
    this.dataSpace.syncExec2(
      `DELETE FROM ${ColumnTableName} WHERE table_name=?;`,
      [tableName],
      db
    )
  }

  async updateProperty(data: {
    tableName: string
    tableColumnName: string
    property: any
    type: FieldType
  }) {
    const { tableName, tableColumnName, property, type } = data
    await this.dataSpace.withTransaction(async () => {
      const oldField = await this.getColumn(tableName, tableColumnName)
      if (!oldField) return
      await this.dataSpace.sql`UPDATE ${Symbol(
        ColumnTableName
      )} SET property = ${JSON.stringify(
        property
      )} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`

      switch (type) {
        case FieldType.Lookup:
          const tm = new TableManager(
            getTableIdByRawTableName(tableName),
            this.dataSpace
          )
          await tm.fields.lookup.onPropertyChange(oldField, property)
          break
        case FieldType.Link:
          // get old property
          // const oldProperty =
          const field = await this.getColumn<ILinkProperty>(
            tableName,
            tableColumnName
          )
          const newLinkTable = (property as ILinkProperty).linkTableName
          const oldLinkTable = field?.property.linkTableName
          if (oldLinkTable !== newLinkTable) {
            console.log("update link title column")
          }
          break
        case FieldType.Formula:
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
          break
        default:
          break
      }
    })
  }

  async list(q: { table_name: string }): Promise<IField[]> {
    const res = await super.list(q)
    return res.filter((col) => !col.name.startsWith("_"))
  }
}
