import { DataUpdateSignalType, EidosDataEventChannelMsgType } from "@/lib/const"
import { allFieldTypesMap } from "../fields"
import { FieldType } from "../fields/const"
import type { ILinkProperty } from "../fields/link"
import { ColumnTableName } from "../sqlite/const"
import { alterColumnType } from "../sqlite/sql-alter-column-type"
import {
  findDependentFormulaFields,
  getFormulaFieldDeletionOrder,
  transformFormula2VirtualGeneratedField,
} from "../sqlite/sql-formula-parser"
import type { IField } from "../types/IField"
import { getColumnIndexName, getTableIdByRawTableName } from "@/lib/utils"

import type { BaseServerDatabase } from "../sqlite/interface"
import { TableManager } from "../sdk/table"
import type { BaseTable } from "./base"
import { BaseTableImpl } from "./base"

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

  CREATE TRIGGER IF NOT EXISTS column_delete_trigger_${ColumnTableName}
  AFTER DELETE ON ${ColumnTableName}
  FOR EACH ROW
  BEGIN
      SELECT eidos_column_event_delete(old.table_name, json_object('name', old.name, 'type', old.type, 'table_name', old.table_name, 'table_column_name', old.table_column_name, 'property', old.property));
  END;
`
  JSONFields: string[] = ["property"]

  static getColumnTypeByFieldType(type: FieldType | `${FieldType}`) {
    const typeMap: any = {
      [FieldType.Checkbox]: "BOOLEAN",
      [FieldType.Number]: "REAL",
      [FieldType.Rating]: "INT",
    }
    const columnType = typeMap[type] ?? "TEXT"
    return columnType
  }

  async addPureUIColumn(data: IField) {
    const { name, type, table_name, table_column_name, property } = data
    this.dataSpace.db
      .prepare(
        `INSERT INTO ${ColumnTableName} (name,type,table_name,table_column_name,property) VALUES (?,?,?,?,?)`
      )
      .run([
        name,
        type,
        table_name,
        table_column_name,
        JSON.stringify(property),
      ])
  }

  async updatePureUIColumn(data: Partial<IField>) {
    this.dataSpace.db
      .prepare(
        `UPDATE ${ColumnTableName} SET name = ?, type = ?, table_name = ?, table_column_name = ?, property = ? WHERE table_column_name = ? AND table_name = ?`
      )
      .run([
        data.name,
        data.type,
        data.table_name,
        data.table_column_name,
        JSON.stringify(data.property),
        data.table_column_name,
        data.table_name,
      ])
  }

  async add(data: IField): Promise<IField> {
    const { name, type, table_name, table_column_name, property } = data
    const columnType = ColumnTable.getColumnTypeByFieldType(type as FieldType)
    const tableId = getTableIdByRawTableName(table_name)

    try {
      await this.dataSpace.db.exec("PRAGMA foreign_keys = OFF;")

      await this.dataSpace.db.prepare("BEGIN TRANSACTION;").run()

      let _property = property
      if (type === FieldType.Formula) {
        _property = { formula: "upper(title)" }
      }
      // add ui column
      this.dataSpace.db
        .prepare(
          `INSERT INTO ${ColumnTableName} (name,type,table_name,table_column_name,property) VALUES (?,?,?,?,?)`
        )
        .run([
          name,
          type,
          table_name,
          table_column_name,
          JSON.stringify(_property),
        ])
      // add real column in table
      switch (type) {
        case FieldType.CreatedBy:
          this.dataSpace.db
            .prepare(
              `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_created_by);`
            )
            .run()
          break
        case FieldType.LastEditedBy:
          this.dataSpace.db
            .prepare(
              `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_last_edited_by);`
            )
            .run()
          break
        case FieldType.LastEditedTime:
          this.dataSpace.db
            .prepare(
              `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_last_edited_time);`
            )
            .run()
          break
        case FieldType.CreatedTime:
          this.dataSpace.db
            .prepare(
              `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (_created_time);`
            )
            .run()
          break
        case FieldType.Formula:
          this.dataSpace.db
            .prepare(
              `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} GENERATED ALWAYS AS (upper(title));`
            )
            .run()
          break
        case FieldType.Link:
          const tm = new TableManager(tableId, this.dataSpace)
          await tm.fields.link.addField(data, this.dataSpace.db)
          break
        default:
          this.dataSpace.db
            .prepare(
              `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} ${columnType};`
            )
            .run()
          break
      }

      await this.dataSpace.db.prepare("COMMIT;").run()
    } catch (error) {
      await this.dataSpace.db.prepare("ROLLBACK;").run()
      console.error("Error in add transaction:", error)
      throw error
    } finally {
      await this.dataSpace.db.exec("PRAGMA foreign_keys = ON;")
    }
    return data
  }

  async addField(data: IField) {
    const res = await this.add(data)
    await this.dataSpace.onTableChange(this.dataSpace.dbName, data.table_name)
    // Smart FTS schema sync with threshold-based decision
    await this.dataSpace.tableFullTextSearch.smartEnsureFTSSchema(
      data.table_name
    )
    return res
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
    const columnsToDelete: { tableName: string; columnName: string }[] = []

    try {
      await this.dataSpace.db.prepare("BEGIN TRANSACTION;").run()

      const column = await this.getColumn(tableName, tableColumnName)
      const tm = new TableManager(
        getTableIdByRawTableName(tableName),
        this.dataSpace
      )
      if (column?.type === FieldType.Text) {
        await tm.fields.text.beforeDeleteColumn(tableName, tableColumnName)
      }
      if (column?.type === FieldType.Link) {
        const pairedField = await tm.fields.link.getPairedLinkField(column)
        effectTables.push(pairedField.table_name)
        // delete relation
        await tm.fields.link.beforeDeleteColumn(
          tableName,
          tableColumnName,
          this.dataSpace.db
        )
        // queue paired field for deletion
        columnsToDelete.push({
          tableName: pairedField.table_name,
          columnName: pairedField.table_column_name,
        })
        // queue paired field's __title column for deletion
        columnsToDelete.push({
          tableName: pairedField.table_name,
          columnName: `${pairedField.table_column_name}__title`,
        })
        // queue current field's __title column for deletion
        columnsToDelete.push({
          tableName: tableName,
          columnName: `${tableColumnName}__title`,
        })
      }

      // queue main column for deletion
      columnsToDelete.push({ tableName, columnName: tableColumnName })

      const affectedTables = new Set(columnsToDelete.map((c) => c.tableName))

      // Step 1: Delete all metadata records first
      for (const { tableName: tn, columnName: cn } of columnsToDelete) {
        // Skip __title columns as they don't have metadata records
        if (!cn.endsWith("__title")) {
          this.dataSpace.db
            .prepare(
              `DELETE FROM ${ColumnTableName} WHERE table_column_name = ? AND table_name = ?;`
            )
            .run([cn, tn])
        }
      }

      // Step 2: Drop all FTS triggers to avoid errors during DROP COLUMN
      for (const tn of affectedTables) {
        await this.dataSpace.tableFullTextSearch.dropFTSTriggers(tn)
      }

      // Step 3: Drop all data change triggers to avoid errors during DROP COLUMN
      for (const tn of affectedTables) {
        await this.dataSpace.dataChangeTrigger.dropTriggers(this.dataSpace, tn)
      }

      // Step 4: Delete all columns from tables
      for (const { tableName: tn, columnName: cn } of columnsToDelete) {
        this.dataSpace.db.prepare(`ALTER TABLE ${tn} DROP COLUMN ${cn};`).run()
      }

      // Step 5: Rebuild FTS tables and triggers after columns are dropped
      for (const tn of affectedTables) {
        await this.dataSpace.tableFullTextSearch.ensureFTSSchema(tn)
      }

      // Step 6: Recreate data change triggers after columns are dropped
      for (const tn of affectedTables) {
        const collist = await this.dataSpace.listRawColumns(tn)
        await this.dataSpace.dataChangeTrigger.setTrigger(
          this.dataSpace,
          tn,
          collist
        )
      }

      await this.dataSpace.db.prepare("COMMIT;").run()
    } catch (error) {
      await this.dataSpace.db.prepare("ROLLBACK;").run()
      console.error("Error in deleteField transaction:", error)
      this.dataSpace.notify({
        title: "Error",
        description: `Failed to delete column, ${error}`,
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

  /**
   * Update formula column and handle dependencies
   * @param tableName Table name
   * @param tableColumnName Column name
   * @param property New property
   * @param fields All fields
   * @param db Database connection
   */
  private async updateFormulaColumn(
    tableName: string,
    tableColumnName: string,
    property: any,
    fields: IField[],
    db: BaseServerDatabase
  ) {
    // Find other generated columns that depend on the current column
    const dependentFields = findDependentFormulaFields(tableColumnName, fields)

    if (dependentFields.length > 0) {
      // If there are dependencies, we need to temporarily delete all dependent columns
      const allColumnsToUpdate = [
        tableColumnName,
        ...dependentFields.map((f) => f.columnName),
      ]

      // Get the correct deletion order (delete columns that depend on others first)
      const deletionOrder = getFormulaFieldDeletionOrder(
        allColumnsToUpdate,
        fields
      )

      // Save all column expressions for later recreation
      const columnExpressions: Record<string, string> = {}

      // First delete all related columns (in dependency order)
      for (const colName of deletionOrder) {
        // Save expression for rebuilding
        const expr = transformFormula2VirtualGeneratedField(colName, fields)
        if (expr) {
          columnExpressions[colName] = expr
        }

        // Delete column
        db.prepare(`ALTER TABLE ${tableName} DROP COLUMN ${colName};`).run()
      }

      // Update the current column's expression
      const updatedFields = fields.map((f) =>
        f.table_column_name === tableColumnName ? { ...f, property } : f
      )

      // Recalculate the current column's expression
      columnExpressions[tableColumnName] =
        transformFormula2VirtualGeneratedField(
          tableColumnName,
          updatedFields
        ) || ""

      // Recreate all columns in reverse order (create dependent columns first)
      for (const colName of deletionOrder.reverse()) {
        if (columnExpressions[colName]) {
          db.prepare(
            `ALTER TABLE ${tableName} ADD COLUMN ${colName} GENERATED ALWAYS AS (${columnExpressions[colName]});`
          ).run()
        }
      }
    } else {
      // No dependencies, update directly
      const formulaExpr = transformFormula2VirtualGeneratedField(
        tableColumnName,
        fields.map((f) =>
          f.table_column_name === tableColumnName ? { ...f, property } : f
        )
      )
      db.prepare(
        `ALTER TABLE ${tableName} DROP COLUMN ${tableColumnName};`
      ).run()

      db.prepare(
        `ALTER TABLE ${tableName} ADD COLUMN ${tableColumnName} GENERATED ALWAYS AS (${formulaExpr});`
      ).run()
    }
  }

  async updateProperty(data: {
    tableName: string
    tableColumnName: string
    property: any
    type: FieldType | `${FieldType}`
  }) {
    const { tableName, tableColumnName, property, type } = data

    try {
      await this.dataSpace.db.prepare("BEGIN TRANSACTION;").run()

      const oldField = await this.getColumn(tableName, tableColumnName)
      if (!oldField) {
        await this.dataSpace.db.prepare("ROLLBACK;").run()
        return
      }

      await this.dataSpace
        .sql`UPDATE ${Symbol(ColumnTableName)} SET property = ${JSON.stringify(
        property
      )} WHERE table_column_name = ${tableColumnName} AND table_name = ${tableName};`

      const tm = new TableManager(
        getTableIdByRawTableName(tableName),
        this.dataSpace
      )
      switch (type) {
        case FieldType.Text:
          await tm.fields.text.onPropertyChange(oldField, property)
          break
        case FieldType.Lookup:
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

          await this.updateFormulaColumn(
            tableName,
            tableColumnName,
            property,
            fields,
            this.dataSpace.db
          )

          this.dataSpace.dataEventChannel.postMessage({
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
      await this.dataSpace.db.prepare("COMMIT;").run()
    } catch (error) {
      await this.dataSpace.db.prepare("ROLLBACK;").run()
      console.error("Error in updateProperty transaction:", error)
      throw error
    }
  }

  async list(q: { table_name: string }): Promise<IField[]> {
    const res = await super.list(q)
    if (q.table_name.startsWith("vw_")) {
      return res
    }
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

    const oldColumnType = ColumnTable.getColumnTypeByFieldType(
      field.type as FieldType
    )
    const newColumnType = ColumnTable.getColumnTypeByFieldType(
      newType as FieldType
    )
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
        sql += `DROP INDEX IF EXISTS ${getColumnIndexName(tableName, tableColumnName)};`

        sql += alterColumnType(tableName, tableColumnName, newColumnType)
        db.exec(sql)
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
