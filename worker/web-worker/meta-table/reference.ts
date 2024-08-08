import { ColumnTableName, ReferenceTableName } from "@/lib/sqlite/const"
import { IField } from "@/lib/store/interface"

import { BaseTable, BaseTableImpl } from "./base"

export interface IReference {
  // lookup field id
  self: string
  // target field id
  ref: string
  // link field id
  link: string

  self_table_name: string
  self_table_column_name: string

  ref_table_name: string
  ref_table_column_name: string

  link_table_name: string
  link_table_column_name: string
}

/**
 * just for field reference relation, not for link cell
 */
export class ReferenceTable
  extends BaseTableImpl
  implements BaseTable<IReference>
{
  del(id: string): Promise<boolean> {
    throw new Error("Method not implemented.")
  }

  name = ReferenceTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    self_table_name TEXT,
    self_table_column_name TEXT,
    ref_table_name TEXT,
    ref_table_column_name TEXT,
    link_table_name TEXT,
    link_table_column_name TEXT,
    self GENERATED ALWAYS AS (self_table_name || '.' || self_table_column_name) STORED,
    ref GENERATED ALWAYS AS (ref_table_name || '.' || ref_table_column_name) STORED,
    link GENERATED ALWAYS AS (link_table_name || '.' || link_table_column_name) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (self_table_name, self_table_column_name, ref_table_name, ref_table_column_name, link_table_name, link_table_column_name),
    FOREIGN KEY (self_table_name, self_table_column_name) REFERENCES ${ColumnTableName}(table_name, table_column_name) ON DELETE CASCADE
  );
`
  getEffectedFields = async (
    table_name: string,
    table_column_name: string
  ): Promise<IField[]> => {
    const sql = `
      SELECT * FROM ${this.name} WHERE (
        (ref_table_name = ? AND ref_table_column_name = ?) OR (link_table_name = ? AND link_table_column_name = ?)
      )
    `
    const result = await this.dataSpace.syncExec2(sql, [
      table_name,
      table_column_name,
      table_name,
      table_column_name,
    ])
    return result.map((r: any) => ({
      table_name: r.self_table_name,
      table_column_name: r.self_table_column_name,
    })) as IField[]
  }
}
