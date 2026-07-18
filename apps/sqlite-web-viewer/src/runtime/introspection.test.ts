// @vitest-environment node

import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"

import type { RelationDetails } from "../types"
import {
  buildRelationPageQuery,
  introspectDatabase,
  introspectRelation,
  readRelationPage,
  type SQLiteBindValue,
  type SQLiteReadonlyDatabase,
} from "./introspection"

const fixturePath = fileURLToPath(
  new URL("../../fixtures/sqlite-viewer-fixture.sqlite", import.meta.url)
)

function bindValues(bind: readonly SQLiteBindValue[] = []): unknown[] {
  return [...bind]
}

function adapter(database: Database.Database): SQLiteReadonlyDatabase {
  return {
    selectArrays(sql, bind) {
      return database
        .prepare(sql)
        .raw(true)
        .all(...bindValues(bind)) as unknown[][]
    },
    selectObjects(sql, bind) {
      return database.prepare(sql).all(...bindValues(bind)) as Record<
        string,
        unknown
      >[]
    },
    selectValue(sql, bind) {
      return database
        .prepare(sql)
        .pluck()
        .get(...bindValues(bind))
    },
  }
}

describe("SQLite schema introspection", () => {
  let database: Database.Database
  let readonlyDatabase: SQLiteReadonlyDatabase

  beforeEach(() => {
    database = new Database(fixturePath, { readonly: true })
    database.pragma("query_only = ON")
    readonlyDatabase = adapter(database)
  })

  afterEach(() => database.close())

  it("reads tables, a view, and database-level metadata from a real fixture", () => {
    const snapshot = introspectDatabase(readonlyDatabase, "fixture.eidos", 1234)
    expect(snapshot.readOnly).toBe(true)
    expect(snapshot.overview).toMatchObject({
      fileBytes: 1234,
      tableCount: 2,
      userVersion: 7,
      viewCount: 1,
    })
    expect(snapshot.relations.map(({ kind, name }) => [kind, name])).toEqual([
      ["table", "authors"],
      ["table", "entries"],
      ["view", "entry_summary"],
    ])
    expect(snapshot.relations[0]?.withoutRowid).toBe(true)
  })

  it("reads columns, indexes, foreign keys, and rowid differences", () => {
    const snapshot = introspectDatabase(readonlyDatabase, "fixture.sqlite", 1)
    const entries = introspectRelation(
      readonlyDatabase,
      snapshot.relations.find((relation) => relation.name === "entries")!
    )
    expect(entries.rowCount).toBe(620)
    expect(entries.rowidAlias).toBe("rowid")
    expect(entries.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "entries_author_score_idx",
          partial: true,
        }),
      ])
    )
    expect(entries.foreignKeys[0]).toMatchObject({
      from: "author_code",
      table: "authors",
      to: "code",
    })

    const authors = introspectRelation(
      readonlyDatabase,
      snapshot.relations.find((relation) => relation.name === "authors")!
    )
    expect(authors.relation.withoutRowid).toBe(true)
    expect(authors.rowidAlias).toBeNull()
    expect(authors.stableOrder).toBe("code")

    const view = introspectRelation(
      readonlyDatabase,
      snapshot.relations.find((relation) => relation.kind === "view")!
    )
    expect(view.rowidAlias).toBeNull()
    expect(view.stableOrder).toBe("visible columns")
  })

  it("pages in a stable order and bounds long text and BLOB values", () => {
    const snapshot = introspectDatabase(readonlyDatabase, "fixture.db", 1)
    const details = introspectRelation(
      readonlyDatabase,
      snapshot.relations.find((relation) => relation.name === "entries")!
    )
    const page = readRelationPage(readonlyDatabase, details, 0, 1)
    expect(page.offset).toBe(0)
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.[0]).toEqual({ kind: "integer", value: "1" })
    expect(page.rows[0]?.[5]).toMatchObject({
      kind: "text",
      totalLength: 3_200,
      truncated: true,
    })
    expect(page.rows[0]?.[6]).toMatchObject({
      byteLength: 96,
      kind: "blob",
    })
    const laterPage = readRelationPage(readonlyDatabase, details, 205, 10)
    expect(laterPage.offset).toBe(205)
    expect(laterPage.rows[0]?.[0]).toEqual({ kind: "integer", value: "206" })
    expect(laterPage.rows).toHaveLength(10)
    expect(() => readRelationPage(readonlyDatabase, details, 0, 501)).toThrow(
      /between 1 and 500/
    )
  })

  it("quotes relation names in generated page SQL", () => {
    const details = {
      columns: [],
      foreignKeys: [],
      indexes: [],
      relation: {
        kind: "view",
        name: 'odd"name; DROP TABLE entries',
        rootPage: 0,
        sql: null,
        withoutRowid: false,
      },
      rowCount: 0,
      rowidAlias: null,
      stableOrder: "SQLite scan order",
    } satisfies RelationDetails
    expect(buildRelationPageQuery(details, 0, 100).sql).toContain(
      'FROM "odd""name; DROP TABLE entries"'
    )
  })

  it("cannot mutate the fixture through its read-only connection", () => {
    expect(() =>
      database.exec("INSERT INTO entries(title) VALUES ('no')")
    ).toThrow(/readonly|read-only/i)
  })
})
