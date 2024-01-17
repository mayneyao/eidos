import { IField } from "@/lib/store/interface"

import { FieldType } from "../fields/const"
import { getLinkQuery, replaceQueryTableName, transformSql } from "./sql-parser"

describe("buildQuery", () => {
  test("getDefaultQuery -> table with two link fields", () => {
    const uiColumnMapWithLinkField = new Map<string, IField>()

    uiColumnMapWithLinkField.set("link", {
      name: "link",
      type: FieldType.Link,
      table_column_name: "fld_link",
      table_name: "raw_tb_a",
      property: {
        linkTable: "raw_tb_b",
      },
    })

    uiColumnMapWithLinkField.set("link2", {
      name: "link2",
      type: FieldType.Link,
      table_column_name: "fld_link2",
      table_name: "raw_tb_a",
      property: {
        linkTable: "raw_tb_c",
      },
    })
    const res = getLinkQuery(uiColumnMapWithLinkField)
    expect(res).toStrictEqual([
      {
        columnName: "fld_link",
        sql: "SELECT thisTable.fld_link, linkTable.title as fld_link__title FROM raw_tb_a as thisTable INNER JOIN raw_tb_b as linkTable ON thisTable.fld_link = linkTable._id",
      },
      {
        columnName: "fld_link2",
        sql: "SELECT thisTable.fld_link2, linkTable.title as fld_link2__title FROM raw_tb_a as thisTable INNER JOIN raw_tb_c as linkTable ON thisTable.fld_link2 = linkTable._id",
      },
    ])
  })

  test("getDefaultQuery -> table without link fields", () => {
    const uiColumnMapWithLinkField = new Map<string, IField>()

    uiColumnMapWithLinkField.set("text", {
      name: "text",
      type: FieldType.Text,
      table_column_name: "fld_text",
      table_name: "raw_tb_a",
      property: {},
    })

    uiColumnMapWithLinkField.set("number", {
      name: "number",
      type: FieldType.Number,
      table_column_name: "fld_number",
      table_name: "raw_tb_a",
      property: {},
    })
    const res = getLinkQuery(uiColumnMapWithLinkField)
    expect(res).toStrictEqual([])
  })
  test("transformSql", () => {
    const res = transformSql(`select * from tb_a`, "raw_tb_a", new Map())
    expect(res).toBe("SELECT *  FROM raw_tb_a")
  })
})

describe("replaceQueryTableName", () => {
  test("should replace table name in the query", () => {
    const query = "SELECT * FROM tb_a"
    const tableName = "raw_tb_a"
    const result = replaceQueryTableName(query, {
      tb_a: tableName,
    })
    const expected = replaceQueryTableName("SELECT * FROM raw_tb_a", {})
    expect(result).toBe(expected)
  })
})
