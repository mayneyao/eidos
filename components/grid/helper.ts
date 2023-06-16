import { GridCellKind, GridColumn } from "@glideapps/glide-data-grid"
import { v4 as uuidv4 } from "uuid"

import { ColumnTableName } from "@/lib/sqlite/const"
import { IUIColumn } from "@/hooks/use-table"

import { defaultAllColumnsHandle } from "./colums"

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

export const getColumns = (uiColumns: IUIColumn[]): GridColumn[] => {
  return uiColumns.map((column) => {
    const colHandle = columnsHandleMap[column.type]
    return {
      id: column.name,
      title: column.name,
      with: 200,
      hasMenu: false,
      icon: colHandle.icon,
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
  ,no             INTEGER  NULL
  ,title          TEXT  NULL
  ,checked        BOOLEAN  NULL
  ,tags           TEXT  NULL
);
INSERT INTO ${tableName}(_id,no,title,checked) VALUES ('${uuidv4()}',1,'foo',1);
INSERT INTO ${tableName}(_id,no,title,checked,tags) VALUES ('${uuidv4()}',2,'bar',1, 'foo,bar');
INSERT INTO ${tableName}(_id,no,title) VALUES ('${uuidv4()}',3,'baz');

--- insert ui-column to table
INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('_id', 'row-id', '${tableName}', '_id');
INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('no', 'number', '${tableName}', 'no');
INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('title', 'text', '${tableName}', 'title');
INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('checked', 'boolean', '${tableName}', 'checked');
INSERT INTO ${ColumnTableName}(name, type, table_name, table_column_name) VALUES ('tags', 'bubble', '${tableName}', 'tags');
`
  return templateTableSql
}

export const createTemplateTableColumnsSql = () => {
  return `
  
  
`
}
