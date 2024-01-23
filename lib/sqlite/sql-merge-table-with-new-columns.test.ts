import { getTransformedQuery } from "./helper"
import { generateMergeTableWithNewColumnsSql } from "./sql-merge-table-with-new-columns"

describe("fixTable", () => {
  test("should fix table creation SQL", () => {
    const createTableSql = `CREATE TABLE tb_123 (
        _id TEXT PRIMARY KEY NOT NULL DEFAULT (uuidv4()),
        title          TEXT  NULL
      );`

    const newColumnSql = `
    _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    _created_by TEXT DEFAULT 'unknown',
    _last_edited_by TEXT DEFAULT 'unknown'
    `
    const expectedSql = `CREATE TABLE tmp_tb_123 (
        _id TEXT PRIMARY KEY NOT NULL DEFAULT (uuidv4()),
        title          TEXT  NULL,
    _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    _created_by TEXT DEFAULT 'unknown',
    _last_edited_by TEXT DEFAULT 'unknown'
      );
      `

    const res = generateMergeTableWithNewColumnsSql(
      createTableSql,
      newColumnSql
    )
    expect(res.newTmpTableSql).toEqual(getTransformedQuery(expectedSql))
  })
})
