import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { openBaseFile } from "@eidos.space/base/better-sqlite3"

import { exportLegacySpace, inspectLegacySpace } from "./better-sqlite3"
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
      updated_at TEXT,
      priority TEXT,
      archived BOOLEAN
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
    .run(
      "doc-a",
      '{"root":{}}',
      "---\nowner: Alice\npriority: stale\n---\n# Plan\n\n![Logo](files/logo.png)\n",
      0,
      "{}",
      null,
      null
    )
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
    .prepare("UPDATE eidos__docs SET priority = ?, archived = ? WHERE id = ?")
    .run("high", 1, "doc-a")
  database
    .prepare(
      `INSERT INTO eidos__columns
        (name, type, table_name, table_column_name, property)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run("priority", "text", "eidos__docs", "priority", null)
  database
    .prepare(
      `INSERT INTO eidos__columns
        (name, type, table_name, table_column_name, property)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run("archived", "checkbox", "eidos__docs", "archived", null)
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
    expect(
      snapshot.documents.find((document) => document.id === "doc-a")
    ).toMatchObject({
      properties: { priority: "high", archived: true },
    })
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
    expect(plan.documents[0]).not.toHaveProperty("markdown")
    expect(plan.documents[0]).not.toHaveProperty("lexicalState")
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

  it("exports Markdown, Base rows, assets, recovery data, and reports atomically", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const targetParent = mkdtempSync(
      path.join(tmpdir(), "eidos-export-target-")
    )
    roots.push(targetParent)
    const targetRoot = path.join(targetParent, "Migrated Space")
    const snapshot = inspectLegacySpace(fixture.sourceRoot)
    const plan = planLegacySpaceMigration(snapshot, { targetRoot })
    const phases: string[] = []

    const result = await exportLegacySpace(plan, {
      migrationId: "fixture-export",
      rowBatchSize: 1,
      onProgress: (progress) => {
        phases.push(progress.phase)
        if (progress.phase === "reporting") {
          throw new Error("observer failure")
        }
      },
    })

    expect(result).toMatchObject({
      status: "completed",
      migrationId: "fixture-export",
      exportedDocumentCount: 3,
      exportedTableCount: 1,
      exportedRowCount: 1,
      exportedFieldCount: 3,
      exportedViewCount: 1,
      exportedReferenceCount: 0,
      copiedAssetCount: 2,
      recoveredLexicalDocumentCount: 1,
      validation: {
        baseValid: true,
        documentCountMatches: true,
        tableCountMatches: true,
        rowCountMatches: true,
        fieldCountMatches: true,
        viewCountMatches: true,
        referenceCountMatches: true,
        assetCountMatches: true,
        copiedAssetsExist: true,
      },
    })
    expect(phases).toEqual(
      expect.arrayContaining([
        "preparing",
        "documents",
        "tables",
        "assets",
        "validating",
        "reporting",
        "finalizing",
      ])
    )
    const exportedPlan = readFileSync(
      path.join(targetRoot, "notes", "Projects", "Plan.md"),
      "utf8"
    )
    expect(exportedPlan).toContain("owner: Alice")
    expect(exportedPlan).toContain("priority: high")
    expect(exportedPlan).toContain("archived: true")
    expect(exportedPlan).toContain("![Logo](assets/logo.png)")
    expect(
      readFileSync(
        path.join(targetRoot, "notes", "Projects", "plan--docb.md"),
        "utf8"
      )
    ).toContain("fixture-export/recovery/doc-b.lexical.json")
    expect(
      readFileSync(
        path.join(
          targetRoot,
          ".eidos",
          "migration",
          "fixture-export",
          "recovery",
          "doc-b.lexical.json"
        ),
        "utf8"
      )
    ).toBe('{"root":{}}')
    expect(
      readFileSync(path.join(targetRoot, "assets", "logo.png"), "utf8")
    ).toBe("logo")
    expect(
      readFileSync(
        path.join(targetRoot, "assets", "nested", "unregistered.txt"),
        "utf8"
      )
    ).toBe("hello")
    expect(existsSync(result.reportPath)).toBe(true)
    expect(readFileSync(result.reportPath, "utf8")).toContain(
      "Status: completed"
    )
    expect(JSON.parse(readFileSync(result.mappingPath, "utf8"))).toMatchObject({
      plan: { format: "eidos-legacy-space-migration-plan" },
      result: { status: "completed" },
    })

    const base = openBaseFile(path.join(targetRoot, "main.base"), {
      readonly: true,
    })
    expect(base.listTables()).toMatchObject([{ id: "tasks", name: "Tasks" }])
    expect(base.listRows("tasks")).toEqual([
      expect.objectContaining({
        _id: "row-1",
        title: "Ship",
        attachment: "assets/logo.png",
        status: "todo",
      }),
    ])
    expect(base.listViews("tasks")).toEqual([
      expect.objectContaining({ id: "view-tasks", name: "Grid" }),
    ])
    base.close()
  })

  it("never overwrites a non-empty target", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const targetRoot = mkdtempSync(
      path.join(tmpdir(), "eidos-non-empty-target-")
    )
    roots.push(targetRoot)
    writeFileSync(path.join(targetRoot, "keep.txt"), "keep")
    const plan = planLegacySpaceMigration(
      inspectLegacySpace(fixture.sourceRoot),
      {
        targetRoot,
      }
    )

    await expect(exportLegacySpace(plan)).rejects.toThrow(
      "Migration target must be empty"
    )
    expect(readFileSync(path.join(targetRoot, "keep.txt"), "utf8")).toBe("keep")
  })

  it("requires a new plan when the legacy database changes", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const targetParent = mkdtempSync(path.join(tmpdir(), "eidos-stale-target-"))
    roots.push(targetParent)
    const plan = planLegacySpaceMigration(
      inspectLegacySpace(fixture.sourceRoot),
      {
        targetRoot: path.join(targetParent, "export"),
      }
    )
    const database = new Database(fixture.databasePath)
    database
      .prepare(
        `INSERT INTO eidos__tree
          (id, name, type, parent_id, position, icon, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("late-doc", "Late", "doc", null, 99, null, 0, null, null)
    database.close()

    await expect(exportLegacySpace(plan)).rejects.toThrow(
      "Legacy Space changed after the migration plan was created"
    )
  })

  it("blocks registered assets that traverse symbolic links", () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const externalRoot = mkdtempSync(
      path.join(tmpdir(), "eidos-external-asset-")
    )
    roots.push(externalRoot)
    const externalFile = path.join(externalRoot, "secret.txt")
    writeFileSync(externalFile, "outside")
    symlinkSync(
      externalFile,
      path.join(fixture.sourceRoot, ".eidos", "files", "linked.txt")
    )
    const database = new Database(fixture.databasePath)
    database
      .prepare(
        "INSERT INTO eidos__files (id, name, path, size, mime) VALUES (?, ?, ?, ?, ?)"
      )
      .run("linked", "linked.txt", "files/linked.txt", 7, "text/plain")
    database.close()

    const plan = planLegacySpaceMigration(
      inspectLegacySpace(fixture.sourceRoot),
      {
        targetRoot: "/tmp/exported-space",
      }
    )

    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "asset-symlink-unsupported",
        }),
      ])
    )
  })

  it("sanitizes portable path segments", () => {
    expect(sanitizePathSegment("  CON. ")).toBe("_CON")
    expect(sanitizePathSegment("Roadmap: Q3/2026?")).toBe("Roadmap- Q3-2026-")
    expect(sanitizePathSegment("   ")).toBe("Untitled")
  })
})
