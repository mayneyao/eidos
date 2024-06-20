import { GridCellKind } from "@glideapps/glide-data-grid"

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

export const getShowColumns = (
  uiColumns: IField[],
  options: {
    fieldWidthMap?: Record<string, number>
    orderMap?: Record<string, number>
    hiddenFields?: string[]
  }
): IField[] => {
  const { orderMap } = options
  uiColumns.sort((a, b) => {
    const aOrder = orderMap?.[a.table_column_name] ?? 233
    const bOrder = orderMap?.[b.table_column_name] ?? 233
    return aOrder - bOrder
  })
  const hiddenFieldsSet = new Set(options.hiddenFields ?? [])

  return uiColumns.filter(
    (column) => !hiddenFieldsSet.has(column.table_column_name)
  )
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

export const createTemplateTableSql = (tableName: string) => {
  const templateTableSql = `
CREATE TABLE ${tableName} (
  _id TEXT PRIMARY KEY NOT NULL DEFAULT (uuidv4()),
  _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  _created_by TEXT DEFAULT 'unknown',
  _last_edited_by TEXT DEFAULT 'unknown',
  title          TEXT  NULL
);
INSERT INTO ${tableName}(title) VALUES ('foo');
INSERT INTO ${tableName}(title) VALUES ('bar');
INSERT INTO ${tableName}(title) VALUES ('baz');

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

let scrollbarWidthCache: number | null = null

export const getScrollbarWidth = function () {
  if (scrollbarWidthCache !== null) {
    return scrollbarWidthCache
  }
  const outer = document.createElement("div")
  outer.style.visibility = "hidden"
  outer.style.width = "100px"
  document.body.appendChild(outer)

  const widthNoScroll = outer.offsetWidth
  outer.style.overflow = "scroll"

  const inner = document.createElement("div")
  inner.style.width = "100%"
  outer.appendChild(inner)
  const widthWithScroll = inner.offsetWidth
  outer.parentNode?.removeChild(outer)
  scrollbarWidthCache = widthNoScroll - widthWithScroll
  return scrollbarWidthCache
}
