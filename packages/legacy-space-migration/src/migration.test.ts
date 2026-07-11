import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"

import { inspectLegacySpace } from "./better-sqlite3"
import { planLegacySpaceMigration, sanitizePathSegment } from "./planner"

function createLegacyFixture() {
  const sourceRoot = mkdtempSync(path.join(tmpdir(), "eidos-legacy-source-"))
  const eidosRoot = path.join(sourceRoot, ".eidos")
  const filesRoot = path.join(eidosRoot, "files")
  mkdirSync(path.join(filesRoot, "nested"), { recursive: true })
  const databasePath = path.join(eidosRoot, "db.sqlite3")
  const database = new Database(databasePath)
  database.exec(`
    CREATE TABLE eidos__tree (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      parent_id TEXT,
      position REAL,
      icon TEXT,
      is_deleted BOOLEAN DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE eidos__docs (
      id TEXT PRIMARY KEY,
      content TEXT,
      markdown TEXT,
      is_day_page BOOLEAN DEFAULT 0,
      meta TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE eidos__columns (
      name TEXT,
      type TEXT,
      table_name TEXT,
      table_column_name TEXT,
      property TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE eidos__views (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      table_id TEXT,
      query TEXT,
      properties TEXT,
      filter TEXT,
      order_map TEXT,
      hidden_fields TEXT,
      position REAL
    );
    CREATE TABLE eidos__references (
      self_table_name TEXT,
      self_table_column_name TEXT,
      ref_table_name TEXT,
      ref_table_column_name TEXT,
      link_table_name TEXT,
      link_table_column_name TEXT
    );
    CREATE TABLE eidos__files (
      id TEXT PRIMARY KEY,
      name TEXT,
      path TEXT,
      size INTEGER,
      mime TEXT
    );
    CREATE TABLE tb_tasks (
      _id TEXT PRIMARY KEY,
      title TEXT,
      attachment TEXT,
      status TEXT
    );
  `)
  const insertNode = database.prepare(
    `INSERT INTO eidos__tree
      (id, name, type, parent_id, position, icon, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  insertNode.run("folder", "Projects", "folder", null, 1, null, 0, null, null)
  insertNode.run("doc-a", "Plan", "doc", "folder", 2, null, 0, null, null)
  insertNode.run("doc-b", "plan", "doc", "folder", 3, null, 0, null, null)
  insertNode.run("tasks", "Tasks", "table", null, 4, "check", 0, null, null)
  insertNode.run("deleted", "Deleted", "doc", null, 5, null, 1, null, null)
  insertNode.run("shortcut", "Website", "link", null, 6, null, 0, null, null)
  database
    .prepare(
      `INSERT INTO eidos__docs
        (id, content, markdown, is_day_page, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run("doc-a", '{"root":{}}', "# Plan\n", 0, "{}", null, null)
  database
    .prepare(
      `INSERT INTO eidos__docs
        (id, content, markdown, is_day_page, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run("doc-b", '{"root":{}}', null, 0, "{}", null, null)
  database
    .prepare(
      `INSERT INTO eidos__docs
        (id, content, markdown, is_day_page, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run("orphan", '{"root":{}}', "Recovered", 0, "{}", null, null)
  database
    .prepare(
      `INSERT INTO eidos__columns
        (name, type, table_name, table_column_name, property)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run("Title", "title", "tb_tasks", "title", null)
  database
    .prepare(
      `INSERT INTO eidos__columns
        (name, type, table_name, table_column_name, property)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run("Attachment", "file", "tb_tasks", "attachment", null)
  database
    .prepare(
      `INSERT INTO eidos__columns
        (name, type, table_name, table_column_name, property)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run("Status", "select", "tb_tasks", "status", '{"options":[]}')
  database
    .prepare(
      `INSERT INTO eidos__views
        (id, name, type, table_id, query, properties, filter, order_map, hidden_fields, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "view-tasks",
      "Grid",
      "grid",
      "tasks",
      "SELECT * FROM tb_tasks",
      "{}",
      null,
      '{"title":0}',
      "[]",
      1
    )
  database
    .prepare(
      "INSERT INTO tb_tasks (_id, title, attachment, status) VALUES (?, ?, ?, ?)"
    )
    .run("row-1", "Ship", "logo.png", "todo")
  database
    .prepare(
      "INSERT INTO eidos__files (id, name, path, size, mime) VALUES (?, ?, ?, ?, ?)"
    )
    .run("logo", "logo.png", "files/logo.png", 4, "image/png")
  database
    .prepare(
      "INSERT INTO eidos__files (id, name, path, size, mime) VALUES (?, ?, ?, ?, ?)"
    )
    .run("missing", "missing.png", "files/missing.png", 10, "image/png")
  database.close()
  writeFileSync(path.join(filesRoot, "logo.png"), "logo")
  writeFileSync(path.join(filesRoot, "nested", "unregistered.txt"), "hello")
  return { sourceRoot, databasePath }
}

describe("legacy Space migration planning", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true })
  })

  it("inspects legacy content without opening the database for writes", () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)

    const snapshot = inspectLegacySpace(fixture.sourceRoot)

    expect(snapshot.nodes).toHaveLength(6)
    expect(snapshot.documents).toHaveLength(3)
    expect(snapshot.tables).toEqual([
      expect.objectContaining({
        id: "tasks",
        rowCount: 1,
        fields: expect.arrayContaining([
          expect.objectContaining({ columnName: "attachment", type: "file" }),
        ]),
        views: [expect.objectContaining({ id: "view-tasks" })],
      }),
    ])
    expect(snapshot.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "logo", exists: true, registered: true }),
        expect.objectContaining({
          id: "missing",
          exists: false,
          registered: true,
        }),
        expect.objectContaining({
          sourceRelativePath: "nested/unregistered.txt",
          registered: false,
        }),
      ])
    )

    const database = new Database(fixture.databasePath, { readonly: true })
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM eidos__tree").get()
    ).toEqual({
      count: 6,
    })
    database.close()
  })

  it("creates deterministic paths, collision suffixes, mappings, and warnings", () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const snapshot = inspectLegacySpace(fixture.sourceRoot)

    const plan = planLegacySpaceMigration(snapshot, {
      targetRoot: "/tmp/exported-space",
    })

    expect(plan.documents).toEqual([
      expect.objectContaining({
        id: "doc-a",
        targetPath: "notes/Projects/Plan.md",
      }),
      expect.objectContaining({
        id: "doc-b",
        targetPath: "notes/Projects/plan--docb.md",
      }),
      expect.objectContaining({
        id: "orphan",
        targetPath: "notes/_Orphans/orphan.md",
      }),
    ])
    expect(plan.tables).toEqual([
      expect.objectContaining({
        id: "tasks",
        targetBasePath: "main.base",
        rowCount: 1,
        fieldCount: 3,
        viewCount: 1,
      }),
    ])
    expect(plan.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "logo", targetPath: "assets/logo.png" }),
        expect.objectContaining({
          sourceRelativePath: "nested/unregistered.txt",
          targetPath: "assets/nested/unregistered.txt",
        }),
      ])
    )
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "document-markdown-missing" }),
        expect.objectContaining({ code: "asset-missing" }),
        expect.objectContaining({ code: "asset-unregistered" }),
        expect.objectContaining({ code: "orphan-document-recovered" }),
        expect.objectContaining({ code: "unsupported-node-type" }),
      ])
    )
    expect(plan.summary).toMatchObject({
      documentCount: 3,
      tableCount: 1,
      rowCount: 1,
      fieldCount: 3,
      viewCount: 1,
      assetCount: 3,
      missingAssetCount: 1,
      errorCount: 0,
    })
    expect(plan.mappings).toHaveLength(7)
    expect(
      planLegacySpaceMigration(snapshot, {
        targetRoot: "/tmp/exported-space",
      })
    ).toEqual(plan)
  })

  it("reports an invalid legacy schema instead of guessing", () => {
    const sourceRoot = mkdtempSync(path.join(tmpdir(), "eidos-invalid-source-"))
    roots.push(sourceRoot)
    mkdirSync(path.join(sourceRoot, ".eidos"), { recursive: true })
    const database = new Database(path.join(sourceRoot, ".eidos", "db.sqlite3"))
    database.exec("CREATE TABLE unrelated (id TEXT)")
    database.close()

    const snapshot = inspectLegacySpace(sourceRoot)
    const plan = planLegacySpaceMigration(snapshot, {
      targetRoot: "/tmp/exported-space",
    })

    expect(plan.summary.errorCount).toBe(2)
    expect(plan.issues.map((issue) => issue.code)).toEqual([
      "legacy-schema-missing",
      "legacy-schema-missing",
    ])
  })

  it("sanitizes portable path segments", () => {
    expect(sanitizePathSegment("  CON. ")).toBe("_CON")
    expect(sanitizePathSegment("Roadmap: Q3/2026?")).toBe("Roadmap- Q3-2026-")
    expect(sanitizePathSegment("   ")).toBe("Untitled")
  })
})
