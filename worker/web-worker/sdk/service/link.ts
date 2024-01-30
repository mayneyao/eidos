import { FieldType } from "@/lib/fields/const"
import { ILinkProperty } from "@/lib/fields/link"
import { ColumnTableName } from "@/lib/sqlite/const"
import { IField } from "@/lib/store/interface"
import { getTableIdByRawTableName } from "@/lib/utils"

import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"

export class LinkFieldService {
  dataSpace: DataSpace
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
  }

  /**
   * get diff between new value and old value
   * eg: new value is "1,2,3", old value is "1,2,3,4" => added: [], removed: [4]
   * eg: new value is "1,2,3,4", old value is "1,3" => added: [2,4], removed: []
   * eg: new value is "1,2,3,4", old value is "1,2,3,4" => added: [], removed: []
   * eg: new value is null, old value is "1,2,3,4" => added: [], removed: [1,2,3,4]
   * eg: new value is "1,2,3,4", old value is null => added: [1,2,3,4], removed: []
   * eg: new value is "1,3,4,5", old value is "1,2,3,4" => added: [5], removed: [2]
   * eg: new value is "1", old value is "2" => added: [1], removed: [2]
   * @param newValue
   * @param oldValue
   */
  getDiff = (
    newValue: string | null,
    oldValue: string | null
  ): {
    added: string[]
    removed: string[]
  } => {
    const newList = newValue?.split(",")
    const oldList = oldValue?.split(",")
    const added = newList?.filter((item) => !oldList?.includes(item)) || []
    const removed = oldList?.filter((item) => !newList?.includes(item)) || []
    return {
      added,
      removed,
    }
  }

  getEffectRows = async (
    table_name: string,
    rowIds: string[],
    db = this.dataSpace.db
  ) => {
    // get all lk table
    const allLinkTables = db.selectObjects(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lk_tb_%${table_name}%'`
    )
    const allLinkRelationTableNames = allLinkTables.map(
      (item: any) => item.name
    )
    const effectRows: Record<string, string[]> = {}
    allLinkRelationTableNames.forEach((relationTableName) => {
      const sql = `SELECT self FROM ${relationTableName} WHERE ref IN (${rowIds
        .map(() => "?")
        .join(",")})`
      const bind = [...rowIds]
      const res = db.selectObjects(sql, bind)
      const effectTableName = relationTableName
        .replace(`_${table_name}`, "")
        .replace("lk_", "")
      const rows = res.map((item: any) => item.self)
      if (!effectRows[effectTableName]) {
        effectRows[effectTableName] = []
      }
      effectRows[effectTableName] = [...effectRows[effectTableName], ...rows]
    })
    return effectRows
  }

  getTableNodeName = async (tableName: string) => {
    const nodeId = getTableIdByRawTableName(tableName)
    const node = await this.dataSpace.tree.get(nodeId)
    return node?.name
  }

  getParentLinkField = async (data: IField<ILinkProperty>) => {
    const { table_name, table_column_name } = data
    const pairedFieldProperty: ILinkProperty = {
      linkTableName: table_name,
      linkColumnName: table_column_name,
    }
    const tableName = await this.getTableNodeName(table_name)
    const randomId = Math.random().toString(36).substr(2, 5)
    return {
      name: `${tableName}_${randomId}`,
      type: FieldType.Link,
      table_name: data.property.linkTableName,
      table_column_name: data.property.linkColumnName,
      property: pairedFieldProperty,
    }
  }

  getRelationTableName = (field: IField<ILinkProperty>) => {
    const { table_name, property } = field
    return `lk_${table_name}_${property.linkTableName}`
  }

  getParentRelationTableName = (field: IField<ILinkProperty>) => {
    const { table_name, property } = field
    return `lk_${property.linkTableName}_${table_name}`
  }

  getLinkCellTitle = async (
    field: IField<ILinkProperty>,
    value: string | null
  ): Promise<string | null> => {
    const { property } = field
    if (!value) {
      return null
    }
    const rowIds = value?.split(",") || []
    const sql = `SELECT title FROM ${
      property.linkTableName
    } WHERE _id IN (${rowIds.map(() => "?").join(",")})`
    const bind = [...rowIds]
    const rows = await this.dataSpace.exec2(sql, bind)
    return rows.map((item) => item.title).join(",")
  }

  getLinkCellValue = async (
    field: IField<ILinkProperty>,
    rowIds: string[],
    db = this.dataSpace.db
  ) => {
    const relationTableName = this.getRelationTableName(field)
    const sql = `SELECT * FROM ${relationTableName} WHERE link_field_id = ? AND self IN (${rowIds
      .map(() => "?")
      .join(",")})`
    const bind = [field.table_column_name, ...rowIds]
    const res = this.dataSpace.syncExec2(sql, bind, db)
    // group by self
    const groupBySelf = res.reduce((acc: Record<string, string[]>, item) => {
      const self = item.self
      if (!acc[self]) {
        acc[self] = []
      }
      acc[self].push(item.ref)
      return acc
    }, {})
    return groupBySelf
  }

  /**
   * when user setCell, we also need to update the paired link field and update relation table
   * @param field
   * @param rowId
   * @param value
   * @param oldValue
   */
  updateCell = async (
    field: IField<ILinkProperty>,
    rowId: string,
    value: string | null,
    oldValue: string | null
  ) => {
    // get diff between new value and old value
    const { added, removed } = this.getDiff(value, oldValue)
    const relationTableName = this.getRelationTableName(field)
    const pairedField = await this.getParentLinkField(field)
    const reverseRelationTableName = this.getParentRelationTableName(field)

    this.dataSpace.db.transaction(async (db) => {
      // update relation table
      // TODO: use json function to filter added and removed
      db.exec({
        sql: `DELETE FROM ${relationTableName} WHERE self = ? AND ref IN (${removed
          .map(() => "?")
          .join(",")})`,
        bind: [rowId, ...removed],
      })
      removed.forEach((item) => {
        db.exec({
          sql: `DELETE FROM ${reverseRelationTableName} WHERE self = ? AND ref = ? AND link_field_id = ?`,
          bind: [item, rowId, field.property.linkColumnName],
        })
      })
      // add new records
      added.forEach((item) => {
        db.exec({
          sql: `INSERT INTO ${relationTableName} (self,ref,link_field_id) VALUES (?,?,?)`,
          bind: [rowId, item, field.table_column_name],
        })
        db.exec({
          sql: `INSERT INTO ${reverseRelationTableName} (self,ref,link_field_id) VALUES (?,?,?)`,
          bind: [item, rowId, field.property.linkColumnName],
        })
      })
      const effectRows = [...added, ...removed]

      const thisTableEffectFields =
        await this.dataSpace.reference.getEffectedFields(
          field.table_name,
          field.table_column_name
        )
      thisTableEffectFields.forEach(async (field) => {
        this.table.fields.lookup.updateColumn({
          tableName: field.table_name,
          tableColumnName: field.table_column_name,
          db,
          rowIds: [rowId],
        })
      })

      // update paired link field
      const values = await this.getLinkCellValue(pairedField, effectRows, db)
      const effectFields = await this.dataSpace.reference.getEffectedFields(
        pairedField.table_name,
        pairedField.table_column_name
      )
      console.log("effectFields", { effectFields, effectRows })
      effectRows.forEach(async (rowId) => {
        // when link relation update, we also need to update the paired link relation and title
        const value = values[rowId]?.join(",") || null
        const title = await this.getLinkCellTitle(pairedField, value)
        db.exec({
          sql: `UPDATE ${pairedField.table_name} SET ${pairedField.table_column_name} = ?, ${pairedField.table_column_name}__title = ? WHERE _id = ?`,
          bind: [value, title, rowId],
        })
      })
      // also need to update lookup fields depend on this link field
      effectFields.forEach(async (field) => {
        this.table.fields.lookup.updateColumn({
          tableName: field.table_name,
          tableColumnName: field.table_column_name,
          db,
          rowIds: effectRows,
        })
      })
      // update title
      const title = await this.getLinkCellTitle(field, value)
      db.exec({
        sql: `UPDATE ${field.table_name} SET ${field.table_column_name}__title = ? WHERE _id = ?`,
        bind: [title, rowId],
      })
    })
  }

  add = async (data: IField<ILinkProperty>, db = this.dataSpace.db) => {
    const { table_name, table_column_name } = data
    // link field always has a paired link field
    const pairedField = await this.getParentLinkField(data)
    console.log("pairedField", pairedField)
    // generate paired link field

    this.dataSpace.syncExec2(
      `INSERT INTO ${ColumnTableName} (name,type,table_name,table_column_name,property) VALUES (?,?,?,?,?)`,
      [
        pairedField.name,
        pairedField.type,
        pairedField.table_name,
        pairedField.table_column_name,
        JSON.stringify(pairedField.property),
      ],
      db
    )

    // add column for two link fields
    this.dataSpace.syncExec2(
      `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} TEXT;
        ALTER TABLE ${table_name} ADD COLUMN ${table_column_name}__title TEXT;
        ALTER TABLE ${pairedField.table_name} ADD COLUMN ${pairedField.table_column_name} TEXT;
        ALTER TABLE ${pairedField.table_name} ADD COLUMN ${pairedField.table_column_name}__title TEXT;
        `,
      [],
      db
    )

    /**
     * because <link>__title column do not exist in eidos__column table, so we need to turn off foreign key check
     * TODO: REMEMBER we need to clear this reference when user delete the link field
     */
    db.exec("PRAGMA foreign_keys = OFF;")
    // add reference for link__title field
    await this.dataSpace.reference.add(
      {
        self_table_name: table_name,
        self_table_column_name: `${table_column_name}__title`,
        ref_table_name: pairedField.table_name,
        ref_table_column_name: "title",
        link_table_name: table_name,
        link_table_column_name: table_column_name,
      },
      db
    )
    await this.dataSpace.reference.add(
      {
        self_table_name: pairedField.table_name,
        self_table_column_name: `${pairedField.table_column_name}__title`,
        ref_table_name: table_name,
        ref_table_column_name: "title",
        link_table_name: pairedField.table_name,
        link_table_column_name: pairedField.table_column_name,
      },
      db
    )
    // open foreign key check
    db.exec("PRAGMA foreign_keys = ON;")

    // add relation table
    const relationTableName = `lk_${table_name}_${pairedField.table_name}`
    const reverseRelationTableName = `lk_${pairedField.table_name}_${table_name}`
    this.dataSpace.syncExec2(
      `CREATE TABLE IF NOT EXISTS ${relationTableName} (
          self TEXT,
          ref TEXT,
          link_field_id TEXT,
          PRIMARY KEY (self,ref,link_field_id),
          FOREIGN KEY (self) REFERENCES ${table_name}(_id) ON DELETE CASCADE,
          FOREIGN KEY (ref) REFERENCES ${pairedField.table_name}(_id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS ${reverseRelationTableName} (
          self TEXT,
          ref TEXT,
          link_field_id TEXT,
          PRIMARY KEY (self,ref,link_field_id),
          FOREIGN KEY (self) REFERENCES ${pairedField.table_name}(_id) ON DELETE CASCADE,
          FOREIGN KEY (ref) REFERENCES ${table_name}(_id) ON DELETE CASCADE
        );
        `,
      [],
      db
    )
    return db
  }
}
