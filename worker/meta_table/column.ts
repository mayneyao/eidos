import { FieldType } from "@/lib/fields/const"
import { ColumnTableName } from "@/lib/sqlite/const"
import { IUIColumn } from "@/hooks/use-table"

import { BaseTable, BaseTableImpl } from "./base"

export class ColumnTable extends BaseTableImpl implements BaseTable<IUIColumn> {
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
  async add(data: IUIColumn): Promise<IUIColumn> {
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
      if (type === FieldType.Formula) {
        this.dataSpace.exec(
          `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} ${columnType} GENERATED ALWAYS AS (upper(title));`
        )
      } else {
        this.dataSpace.exec(
          `ALTER TABLE ${table_name} ADD COLUMN ${table_column_name} ${columnType};`
        )
      }
    })
    return data
  }

  get(id: string): Promise<IUIColumn | null> {
    throw new Error("Method not implemented.")
  }
  set(id: string, data: Partial<IUIColumn>): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  del(id: string): Promise<boolean> {
    throw new Error("Method not implemented.")
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
        this.dataSpace.exec(
          `
          ALTER TABLE ${tableName} DROP COLUMN ${tableColumnName};
          ALTER TABLE ${tableName} ADD COLUMN ${tableColumnName} GENERATED ALWAYS AS (${property.formula});
          `
        )
      }
    })
  }

  async list(tableName: string): Promise<IUIColumn[]> {
    const cols = await this.dataSpace.exec2(
      `SELECT * FROM ${ColumnTableName} WHERE table_name=?;`,
      [tableName]
    )
    return cols
      .filter((col) => !col.name.startsWith("_"))
      .map((col) => {
        return {
          ...col,
          property: JSON.parse(col.property),
        }
      }) as IUIColumn[]
  }
}
