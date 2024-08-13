import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { allFieldTypesMap } from "@/lib/fields"
import { FieldType } from "@/lib/fields/const"
import { ILinkProperty } from "@/lib/fields/link"
import { ColumnTableName } from "@/lib/sqlite/const"
import { alterColumnType } from "@/lib/sqlite/sql-alter-column-type"
import { transformFormula2VirtualGeneratedField } from "@/lib/sqlite/sql-formula-parser"
import { IField } from "@/lib/store/interface"
import { getColumnIndexName, getTableIdByRawTableName } from "@/lib/utils"

import { TableManager } from "../sdk/table"
import { BaseTable, BaseTableImpl } from "./base"

const bc = new BroadcastChannel(EidosDataEventChannelName)

/**
 * define
 * 1. column: a real column in table
 * 2. field: a wrapper of column, with some additional properties which control the UI behavior
 *
 * this table is used to manage the mapping between column and field
 */
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

  CREATE TRIGGER IF NOT EXISTS column_update_trigger_${ColumnTableName}
  AFTER UPDATE ON ${ColumnTableName}
  FOR EACH ROW
  BEGIN
      SELECT eidos_column_event_update(new.table_name, json_object('name', new.name, 'type', new.type, 'table_name', new.table_name, 'table_column_name', new.table_column_name, 'property', new.property), json_object('name', old.name, 'type', old.type, 'table_name', old.table_name, 'table_column_name', old.table_column_name, 'property', old.property));
  END;
`
  JSONFields: string[] = ["property"]

  static getColumnTypeByFieldType(type: FieldType) {
    const typeMap: any = {
      [FieldType.Checkbox]: "BOOLEAN",
      [FieldType.Number]: "REAL",
      [FieldType.Rating]: "INT",
    }
    const columnType = typeMap[type] ?? "TEXT"
    return columnType
  }
  async add(data: IField): Promise<IField> {
    const { name, type, table_name, table_column_name, property } = data
    const columnType = ColumnTable.getColumnTypeByFieldType(type)
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
        case FieldType.CreatedBy:
          this.dataSpace.syncExec2(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_created_by);`,
            [],
            db
          )
          break
        case FieldType.LastEditedBy:
          this.dataSpace.syncExec2(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_last_edited_by);`,
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
        case FieldType.CreatedTime:
          this.dataSpace.syncExec2(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_created_time);`,
            [],
            db
          )
          break
        case FieldType.Formula:
          this.dataSpace.syncExec2(
            `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (upper(title));`,
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
    const effectTables: string[] = [tableName]
    try {
      await this.dataSpace.db.transaction(async (db) => {
        const _deleteField = async (
          tableName: string,
          tableColumnName: string
        ) => {
          await this.dataSpace.onTableChange(this.dataSpace.dbName, tableName, [
            tableColumnName,
          ])
          this.dataSpace.syncExec2(
            `DELETE FROM ${ColumnTableName} WHERE table_column_name = ? AND table_name = ?;`,
            [tableColumnName, tableName],
            db
          )
          this.dataSpace.syncExec2(
            `ALTER TABLE ${tableName} DROP COLUMN ${tableColumnName};`,
            [],
            db
          )
        }
        const column = await this.getColumn(tableName, tableColumnName)
        if (column?.type === FieldType.Link) {
          const tm = new TableManager(
            getTableIdByRawTableName(tableName),
            this.dataSpace
          )
          const pairedField = await tm.fields.link.getPairedLinkField(column)
          effectTables.push(pairedField.table_name)
          // delete relation
          await tm.fields.link.beforeDeleteColumn(
            tableName,
            tableColumnName,
            db
          )
          // delete paired field
          await _deleteField(
            pairedField.table_name,
            pairedField.table_column_name
          )
        }
        await _deleteField(tableName, tableColumnName)
      })
    } catch (error) {
      console.error(error)
      this.dataSpace.notify({
        title: "Error",
        description:
          "Failed to delete column, because it is referenced by other fields",
      })
    }
    return effectTables
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
    await this.dataSpace.db.transaction(async (D) => {
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
          D.exec(
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
    return res.filter((col) => !col.table_column_name.startsWith("_"))
  }

  static isColumnTypeChanged(oldType: FieldType, newType: FieldType) {
    return (
      ColumnTable.getColumnTypeByFieldType(oldType) !==
      ColumnTable.getColumnTypeByFieldType(newType)
    )
  }
  async changeType(
    tableName: string,
    tableColumnName: string,
    newType: FieldType
  ) {
    const defaultFieldProperty =
      allFieldTypesMap[newType].getDefaultFieldProperty()
    let newProperty = defaultFieldProperty
    const field = await this.getColumn<ILinkProperty>(
      tableName,
      tableColumnName
    )
    if (!field) return

    const oldColumnType = ColumnTable.getColumnTypeByFieldType(field.type)
    const newColumnType = ColumnTable.getColumnTypeByFieldType(newType)
    const isColumnTypeChanged = oldColumnType !== newColumnType

    await this.dataSpace.db.transaction(async (db) => {
      if (isColumnTypeChanged) {
        this.dataSpace.blockUIMsg("Changing column type")
        // unRegisterTrigger first
        await this.dataSpace.dataChangeTrigger.unRegisterTrigger(
          this.dataSpace.dbName,
          tableName
        )
        if (this.dataSpace.activeUndoManager) {
          this.dataSpace.undoRedoManager.deactivate()
        }

        // drop trigger
        let sql = `DROP TRIGGER IF EXISTS data_update_trigger_${tableName};
        DROP TRIGGER IF EXISTS data_insert_trigger_${tableName};
        DROP TRIGGER IF EXISTS data_delete_trigger_${tableName};`

        // drop related index
        sql += `DROP INDEX IF EXISTS ${getColumnIndexName(
          tableName,
          tableColumnName
        )};`

        sql += alterColumnType(tableName, tableColumnName, newColumnType)
        this.dataSpace.syncExec2(sql, [], db)
      }

      switch (newType) {
        case FieldType.MultiSelect:
        case FieldType.Select:
          const tm = new TableManager(
            getTableIdByRawTableName(tableName),
            this.dataSpace
          )
          const options = await tm.fields.select.beforeConvert(field, db)
          newProperty = {
            ...defaultFieldProperty,
            options,
          }
          break
        default:
          break
      }
      this.dataSpace.syncExec2(
        `UPDATE ${ColumnTableName} SET type = ?, property = ? WHERE table_column_name = ? AND table_name = ?;`,
        [newType, JSON.stringify(newProperty), tableColumnName, tableName],
        db
      )
    })
    this.dataSpace.blockUIMsg(null)
    if (isColumnTypeChanged) {
      // re-create trigger
      const collist = await this.dataSpace.listRawColumns(tableName)
      await this.dataSpace.dataChangeTrigger.setTrigger(
        this.dataSpace,
        tableName,
        collist
      )
    }
  }
}
