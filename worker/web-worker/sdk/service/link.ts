
import { FieldType } from "@/lib/fields/const"
import { ILinkProperty } from "@/lib/fields/link"
import { ColumnTableName } from "@/lib/sqlite/const"
import { IField } from "@/lib/store/interface"
import { getTableIdByRawTableName } from "@/lib/utils"

import { DataSpace, EidosDatabase } from "../../DataSpace"
import { TableManager } from "../table"

interface IRelation {
  self: string
  ref: string
  link_field_id: string
}

export class LinkFieldService {
  dataSpace: DataSpace
  db: EidosDatabase
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
    this.db = this.table.db || this.dataSpace.db
  }

  getEffectRowsByRelationDeleted = async (
    relationTableName: string,
    relation: IRelation,
    db = this.dataSpace.db
  ) => {
    // relationTableName will be like lk_tb_xxx__tb_yyy
    const [selfTable, refTable] = relationTableName
      .replace("lk_", "")
      .split("__", 2)
    // self + link_field_id will update
    const res1 = await this.dataSpace.syncExec2(
      `SELECT * FROM ${relationTableName} WHERE self = ? AND link_field_id = ?`,
      [relation.self, relation.link_field_id],
      db
    )

    return {
      // group by link_field_id
      [selfTable]: res1.reduce(
        (acc: Record<string, Set<string>>, item: IRelation) => {
          const linkFieldId = item.link_field_id
          if (!acc[linkFieldId]) {
            acc[linkFieldId] = new Set()
          }
          acc[linkFieldId].add(item.self)
          return acc
        },
        {
          [relation.link_field_id]: new Set([relation.self]),
        }
      ),
    }
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
    const newList = newValue?.split(/,/) || []
    const oldList = oldValue?.split(/,/) || []
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
    const allLinkTables = await db.selectObjects(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lk_tb_%${table_name}%'`
    )
    const allLinkRelationTableNames = allLinkTables.map(
      (item: any) => item.name
    )
    const effectRows: Record<string, string[]> = {}
    allLinkRelationTableNames.forEach(async (relationTableName) => {
      const sql = `SELECT self FROM ${relationTableName} WHERE ref IN (${rowIds
        .map(() => "?")
        .join(",")})`
      const bind = [...rowIds]
      const res = await db.selectObjects(sql, bind)
      const effectTableName = relationTableName
        .replace(`__${table_name}`, "")
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
    return node?.name || "Untitled"
  }

  getPairedLinkField = async (data: IField<ILinkProperty>) => {
    const { table_name, table_column_name } = data
    const pairedFieldProperty: ILinkProperty = {
      linkTableName: table_name,
      linkColumnName: table_column_name,
    }
    const tableName = await this.getTableNodeName(table_name)
    const randomId = Math.random().toString(36).slice(2, 8)
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
    return `lk_${table_name}__${property.linkTableName}`
  }

  getParentRelationTableName = (field: IField<ILinkProperty>) => {
    const { table_name, property } = field
    return `lk_${property.linkTableName}__${table_name}`
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
    const sql = `SELECT _id,title FROM ${property.linkTableName
      } WHERE _id IN (${rowIds.map(() => "?").join(",")})`
    const bind = [...rowIds]
    const rows = await this.dataSpace.exec2(sql, bind)
    // map id to title, avoid order change
    const idTitleMap = rows.reduce((acc: Record<string, string>, item: any) => {
      acc[item._id] = item.title
      return acc
    }, {})
    return rows.map((item: any) => idTitleMap[item._id]).join(",")
  }

  private getLinkCellValue = async (
    field: IField<ILinkProperty>,
    rowIds: string[],
    db = this.dataSpace.db
  ) => {
    const relationTableName = this.getRelationTableName(field)
    const sql = `SELECT * FROM ${relationTableName} WHERE link_field_id = ? AND self IN (${rowIds
      .map(() => "?")
      .join(",")}) ORDER BY rowid ASC`
    const bind = [field.table_column_name, ...rowIds]
    const res = await this.dataSpace.syncExec2(sql, bind, db)
    // group by self
    const groupBySelf = res.reduce(
      (acc: Record<string, string[]>, item: any) => {
        const self = item.self
        if (!acc[self]) {
          acc[self] = []
        }
        acc[self].push(item.ref)
        return acc
      },
      {}
    )
    return groupBySelf
  }

  updateLinkCell = async (
    tableName: string,
    tableColumnName: string,
    rowIds: string[]
  ) => {
    const field = await this.dataSpace.column.getColumn(
      tableName,
      tableColumnName
    )
    if (!field) return

    const values = await this.getLinkCellValue(field, rowIds)
    // update link cell and title
    rowIds.forEach(async (rowId) => {
      const value = values[rowId]?.join(",") || null
      const title = await this.getLinkCellTitle(field, value)
      this.dataSpace.db.exec({
        sql: `UPDATE ${tableName} SET ${tableColumnName} = ?, ${tableColumnName}__title = ? WHERE _id = ?`,
        bind: [value, title, rowId],
      })
    })
    // update lookup cell
    const effectFields = await this.dataSpace.reference.getEffectedFields(
      tableName,
      tableColumnName
    )
    effectFields.forEach(async (field) => {
      this.table.fields.lookup.updateColumn({
        tableName: field.table_name,
        tableColumnName: field.table_column_name,
        rowIds,
      })
    })
  }

  /**
   * when user setCell, we also need to update the paired link field and update relation table
   * @param field
   * @param rowId
   * @param value
   * @param oldValue
   */
  updateLinkRelation = async (
    field: IField<ILinkProperty>,
    rowId: string,
    value: string | null,
    oldValue: string | null
  ) => {
    // get diff between new value and old value
    const { added, removed } = this.getDiff(value, oldValue)
    const relationTableName = this.getRelationTableName(field)
    const reverseRelationTableName = this.getParentRelationTableName(field)

    this.dataSpace.db.transaction(async (db) => {
      // update relation table
      removed.length &&
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
    })
  }

  /**
   * when user add a link field, we also need to add a paired link field and create relation table and set trigger
   * @param data
   * @param db
   * @returns
   */
  addField = async (data: IField<ILinkProperty>, db = this.dataSpace.db) => {
    const { table_name, table_column_name } = data
    // link field always has a paired link field
    const pairedField = await this.getPairedLinkField(data)
    console.log("pairedField", pairedField, data)
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
    db.exec(
      `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} TEXT;
        ALTER TABLE ${table_name} ADD COLUMN ${table_column_name}__title TEXT;
        ALTER TABLE ${pairedField.table_name} ADD COLUMN ${pairedField.table_column_name} TEXT;
        ALTER TABLE ${pairedField.table_name} ADD COLUMN ${pairedField.table_column_name}__title TEXT;
        `,
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

    // add relation table and delete trigger
    const relationTableName = `lk_${table_name}__${pairedField.table_name}`
    const reverseRelationTableName = `lk_${pairedField.table_name}__${table_name}`
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${relationTableName} (
          self TEXT,
          ref TEXT,
          link_field_id TEXT,
          PRIMARY KEY (self,ref,link_field_id),
          FOREIGN KEY (self) REFERENCES ${table_name}(_id) ON DELETE CASCADE,
          FOREIGN KEY (ref) REFERENCES ${pairedField.table_name}(_id) ON DELETE CASCADE
        );

        CREATE TRIGGER IF NOT EXISTS data_delete_trigger_${relationTableName}
        AFTER DELETE ON ${relationTableName}
        FOR EACH ROW
        BEGIN
            SELECT eidos_data_event_delete('${relationTableName}', json_object('self',OLD.self,'ref',OLD.ref,'link_field_id',OLD.link_field_id));
        END;

        CREATE TRIGGER IF NOT EXISTS data_insert_trigger_${relationTableName}
        AFTER INSERT ON ${relationTableName}
        FOR EACH ROW
        BEGIN
            SELECT eidos_data_event_insert('${relationTableName}', json_object('self',NEW.self,'ref',NEW.ref,'link_field_id',NEW.link_field_id));
        END;

        CREATE TABLE IF NOT EXISTS ${reverseRelationTableName} (
          self TEXT,
          ref TEXT,
          link_field_id TEXT,
          PRIMARY KEY (self,ref,link_field_id),
          FOREIGN KEY (self) REFERENCES ${pairedField.table_name}(_id) ON DELETE CASCADE,
          FOREIGN KEY (ref) REFERENCES ${table_name}(_id) ON DELETE CASCADE
        );

        CREATE TRIGGER IF NOT EXISTS data_delete_trigger_${reverseRelationTableName}
        AFTER DELETE ON ${reverseRelationTableName}
        FOR EACH ROW
        BEGIN
            SELECT eidos_data_event_delete('${reverseRelationTableName}', json_object('self',OLD.self,'ref',OLD.ref,'link_field_id',OLD.link_field_id));
        END;

        CREATE TRIGGER IF NOT EXISTS data_insert_trigger_${reverseRelationTableName}
        AFTER INSERT ON ${reverseRelationTableName}
        FOR EACH ROW
        BEGIN
            SELECT eidos_data_event_insert('${reverseRelationTableName}', json_object('self',NEW.self,'ref',NEW.ref,'link_field_id',NEW.link_field_id));
        END;
        `,
    )
    return db
  }

  /**
   * when user delete a table, we need check if there are link fields in the table, if so, we need to delete the paired link field and delete relation table and delete trigger
   */
  async beforeDeleteTable(tableName: string, db = this.dataSpace.db) {
    // clear relation
    const allLinkTables = await db.selectObjects(
      `SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'lk_${tableName}__%' OR name LIKE 'lk_%__${tableName}')`
    )
    allLinkTables.forEach(async (item: any) => {
      const { name: relationTableName } = item
      // delete trigger
      const triggers = await db.selectObjects(
        `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name = ?`,
        [relationTableName]
      )
      triggers.forEach((item: any) => {
        db.exec(`DROP TRIGGER ${item.name}`)
      })
      // delete relation table
      db.exec(`DROP TABLE ${relationTableName}`)
    })
    // clear reference: lookup link title
    await this.dataSpace.reference.delBy(
      {
        self_table_name: tableName,
      },
      db
    )
  }

  /**
   * when user delete a link field, we also need to delete the paired link field and delete relation data
   */
  async beforeDeleteColumn(
    tableName: string,
    columnName: string,
    db = this.dataSpace.db
  ) {
    const field = await this.dataSpace.column.getColumn(tableName, columnName)
    if (!field) return
    const pairedField = await this.getPairedLinkField(field)
    const relationTableName = `lk_${tableName}__${pairedField.table_name}`
    const reverseRelationTableName = `lk_${pairedField.table_name}__${tableName}`
    // drop relation rows where link_field_id = columnName
    db.exec({
      sql: `DELETE FROM ${relationTableName} WHERE link_field_id = ?`,
      bind: [columnName],
    })
    // drop reverse relation rows where link_field_id = pairedField.table_column_name
    db.exec({
      sql: `DELETE FROM ${reverseRelationTableName} WHERE link_field_id = ?`,
      bind: [pairedField.table_column_name],
    })
  }
}
