import {
  SelectFromStatement,
  Statement,
  astMapper,
  parse,
  parseFirst,
  toSql,
} from "pgsql-ast-parser"

import type { IField } from "@/lib/store/interface"

import { FieldType } from "../fields/const"

export const getColumnsFromQuery = (sql?: string) => {
  if (!sql) return []
  // parse multiple statements
  const ast: Statement[] = parse(sql)
  return (ast?.[0] as SelectFromStatement).columns
}

/**
 * 1. every user-created-table has a `_id` and a `title` column
 * 2. to render a table, first we query data.
 * 2.1 if the table has link fields, we need to join the link table to get the title
 * @param uiColumnMap name -> IUIColumn map of the table
 * @returns
 */
export const getLinkQuery = (uiColumnMap: Map<string, IField>) => {
  const rawColumns = Array.from(uiColumnMap.values())
  const thisTable = rawColumns[0].table_name
  const linkColumns = rawColumns.filter((c) => c.type === FieldType.Link)
  const queryList: {
    columnName: string
    sql: string
  }[] = []

  for (const column of linkColumns) {
    const linkTable = column.property.linkTable
    let sql = "SELECT "
    sql += `thisTable.${column.table_column_name}`
    sql += `, linkTable.title as ${column.table_column_name}__title `
    sql += `FROM ${thisTable} as thisTable INNER JOIN ${linkTable} as linkTable ON thisTable.${column.table_column_name} = linkTable._id`
    queryList.push({
      columnName: column.table_column_name,
      sql,
    })
  }
  return queryList
}

/**
 * transform sql query replace column name with columnNameMap
 * @param sql
 * @param columnNameMap
 * @returns transformed sql
 */

export const transformSql = (
  sql: string,
  rawTableName: string,
  columnNameMap: Map<string, string>
): string => {
  const lowerCaseColumnNameMap = new Map<string, string>()
  columnNameMap.forEach((v, k) => {
    lowerCaseColumnNameMap.set(k.toLowerCase(), v)
  })
  // create a mapper
  const mapper = astMapper((map) => ({
    ref: (t) => {
      const rawName = lowerCaseColumnNameMap.get(t.name)
      if (rawName) {
        return {
          ...t,
          name: rawName,
        }
      }
      return map.super().ref(t)
    },
    tableRef: (t) => {
      return {
        ...t,
        name: rawTableName,
      }
    },
  }))

  // parse + map + reconvert to sql
  const modified = mapper.statement(parseFirst(sql))
  return toSql.statement(modified!)
}
