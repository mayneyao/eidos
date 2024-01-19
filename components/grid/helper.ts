import { GridCellKind, GridColumn } from "@glideapps/glide-data-grid"
import { v4 as uuidv4 } from "uuid"

import { ColumnTableName } from "@/lib/sqlite/const"
import { IField } from "@/lib/store/interface"

import { defaultAllColumnsHandle } from "./fields/colums"

export function getColumnsHandleMap(): {
  [kind: string]: Omit<(typeof defaultAllColumnsHandle)[0], "getContent"> & {
    getContent: (data: any) => any
  }
} {
  return defaultAllColumnsHandle.reduce((acc, column) => {
    acc[column.kind] = column
    return acc
  }, {} as any)
}

export const columnsHandleMap = getColumnsHandleMap()

export const getColumns = (
  uiColumns: IField[],
  options: {
    fieldWidthMap?: Record<string, number>
    orderMap?: Record<string, number>
    hiddenFields?: string[]
  }
): GridColumn[] => {
  const { fieldWidthMap, orderMap } = options

  uiColumns.sort((a, b) => {
    const aOrder = orderMap?.[a.table_column_name] ?? 0
    const bOrder = orderMap?.[b.table_column_name] ?? 0
    return aOrder - bOrder
  })
  const hiddenFieldsSet = new Set(options.hiddenFields ?? [])

  return uiColumns
    .filter((column) => !hiddenFieldsSet.has(column.table_column_name))
    .map((column) => {
      return {
        id: column.table_column_name,
        title: column.name,
        width: fieldWidthMap?.[column.table_column_name] || 200,
        hasMenu: false,
        icon: column.type,
      }
    })
}

export const guessCellKind = (value: any) => {
  const valueType = typeof value
  switch (valueType) {
    case "string":
      if (value.startsWith("http")) {
        return GridCellKind.Uri
      }
      return GridCellKind.Text
    case "number":
      return GridCellKind.Number
    case "boolean":
      return GridCellKind.Boolean
    case "object":
      return GridCellKind.Text
    default:
      return GridCellKind.Text
  }
}

// Uri = "uri",
// Text = "text",
// Image = "image",
// RowID = "row-id",
// Number = "number",
// Bubble = "bubble",
// Boolean = "boolean",
// Loading = "loading",
// Markdown = "markdown",
// Drilldown = "drilldown",
// Protected = "protected",
// Custom = "custom"
export const createTemplateTableSql = (tableName: string) => {
  const templateTableSql = `
CREATE TABLE ${tableName} (
  _id TEXT PRIMARY KEY NOT NULL
  ,title          TEXT  NULL
);
INSERT INTO ${tableName}(_id,title) VALUES ('${uuidv4()}','foo');
INSERT INTO ${tableName}(_id,title) VALUES ('${uuidv4()}','bar');
INSERT INTO ${tableName}(_id,title) VALUES ('${uuidv4()}','baz');

--- insert ui-column to table
INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('_id', 'row-id', '${tableName}', '_id');
INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('title', 'title', '${tableName}', 'title');
`
  return templateTableSql
}

export const createTemplateTableColumnsSql = () => {
  return `
  
  
`
}
