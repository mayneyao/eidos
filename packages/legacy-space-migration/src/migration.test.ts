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
import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

import {
  exportLegacyExtensionArchive,
  exportLegacySpace,
  inspectLegacyExtensions,
  inspectLegacySpace,
} from "./better-sqlite3"
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
    CREATE TABLE eidos__extensions (
      id TEXT PRIMARY KEY,
      slug TEXT,
      name TEXT,
      description TEXT,
      type TEXT,
      version TEXT,
      code TEXT,
      ts_code TEXT,
      meta TEXT,
      icon TEXT,
      marketplace_id TEXT,
      enabled BOOLEAN,
      bindings TEXT,
      created_at TEXT,
      updated_at TEXT
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
    .run(
      "doc-b",
      '{"root":{"children":[{"type":"paragraph","children":[{"type":"text","text":"Recovered text"}]}]}}',
      null,
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
  database
    .prepare(
      `INSERT INTO eidos__extensions
        (id, slug, name, description, type, version, code, ts_code, meta,
         icon, marketplace_id, enabled, bindings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "ext-script",
      "hello/world",
      "Hello script",
      "A legacy document action",
      "script",
      "1.2.3",
      'exports.hello = async () => "compiled";',
      'export async function hello() { return "source" }',
      '{"type":"docAction","funcName":"hello"}',
      "data:image/svg+xml;base64,PHN2Zy8+",
      "marketplace-script",
      1,
      '{"folder":{"type":"text","value":"notes"}}',
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z"
    )
  database
    .prepare(
      `INSERT INTO eidos__extensions
        (id, slug, name, description, type, version, code, ts_code, meta,
         icon, marketplace_id, enabled, bindings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "ext-block",
      "hello:world",
      "Hello block",
      null,
      "block",
      null,
      "exports.default = function legacyView() {};",
      null,
      "{broken",
      null,
      null,
      0,
      null,
      null,
      null
    )
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
    expect(snapshot.extensions).toEqual([
      expect.objectContaining({
        id: "ext-script",
        slug: "hello/world",
        type: "script",
        enabled: true,
        metaJson: '{"type":"docAction","funcName":"hello"}',
        bindingsJson: '{"folder":{"type":"text","value":"notes"}}',
      }),
      expect.objectContaining({
        id: "ext-block",
        slug: "hello:world",
        type: "block",
        enabled: false,
        metaJson: "{broken",
        tsCode: null,
      }),
    ])

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
        targetEidosFilePath: "main.eidos",
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
    expect(plan.extensions).toHaveLength(2)
    expect(
      new Set(plan.extensions.map((extension) => extension.targetDirectory))
        .size
    ).toBe(2)
    expect(plan.extensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ext-script",
          sourcePath: expect.stringMatching(/src\/extension\.ts$/),
          compiledPath: expect.stringMatching(/dist\/extension\.js$/),
        }),
        expect.objectContaining({
          id: "ext-block",
          sourcePath: null,
          compiledPath: expect.stringMatching(/dist\/extension\.js$/),
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
        expect.objectContaining({ code: "legacy-extension-archived" }),
      ])
    )
    expect(plan.summary).toMatchObject({
      documentCount: 3,
      skippedEmptyDocumentCount: 0,
      tableCount: 1,
      rowCount: 1,
      fieldCount: 3,
      viewCount: 1,
      assetCount: 3,
      missingAssetCount: 1,
      extensionCount: 2,
      errorCount: 0,
    })
    expect(plan.mappings).toHaveLength(12)
    expect(
      planLegacySpaceMigration(snapshot, {
        targetRoot: "/tmp/exported-space",
      })
    ).toEqual(plan)
  })

  it("routes journals by year and skips empty documents without placeholders", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const database = new Database(fixture.databasePath)
    database
      .prepare(
        `INSERT INTO eidos__tree
          (id, name, type, parent_id, position, icon, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("empty-note", "Empty note", "doc", null, 7, null, 0, null, null)
    const insertDocument = database.prepare(
      `INSERT INTO eidos__docs
        (id, content, markdown, is_day_page, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    insertDocument.run(
      "empty-note",
      '{"root":{"children":[{"type":"paragraph","children":[]}]}}',
      "",
      0,
      "{}",
      null,
      null
    )
    insertDocument.run(
      "2025-03-23",
      '{"root":{"children":[]}}',
      "# Sunday\n",
      1,
      "{}",
      null,
      null
    )
    insertDocument.run(
      "2025-03-24",
      '{"root":{"children":[{"type":"paragraph","children":[]}]}}',
      "  \n",
      1,
      "{}",
      null,
      null
    )
    database.close()

    const targetParent = mkdtempSync(
      path.join(tmpdir(), "eidos-journal-target-")
    )
    roots.push(targetParent)
    const targetRoot = path.join(targetParent, "export")
    const plan = planLegacySpaceMigration(
      inspectLegacySpace(fixture.sourceRoot),
      { targetRoot }
    )

    expect(plan.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "2025-03-23",
          targetPath: "journals/2025/2025-03-23.md",
        }),
      ])
    )
    expect(plan.documents.map((document) => document.id)).not.toEqual(
      expect.arrayContaining(["empty-note", "2025-03-24"])
    )
    expect(plan.summary.skippedEmptyDocumentCount).toBe(2)
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "empty-documents-skipped" }),
      ])
    )

    const result = await exportLegacySpace(plan, {
      migrationId: "journal-export",
    })
    expect(result.skippedEmptyDocumentCount).toBe(2)
    expect(
      readFileSync(
        path.join(targetRoot, "journals", "2025", "2025-03-23.md"),
        "utf8"
      )
    ).toBe("# Sunday\n")
    expect(
      existsSync(path.join(targetRoot, "journals", "2025", "2025-03-24.md"))
    ).toBe(false)
    expect(existsSync(path.join(targetRoot, "notes", "Empty note.md"))).toBe(
      false
    )
    expect(readFileSync(result.reportPath, "utf8")).toContain(
      "Empty documents skipped: 2"
    )
  })

  it("normalizes negative and fractional legacy view positions without changing their order", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const database = new Database(fixture.databasePath)
    database
      .prepare("UPDATE eidos__views SET position = ? WHERE id = ?")
      .run(-2, "view-tasks")
    database
      .prepare(
        `INSERT INTO eidos__views
          (id, name, type, table_id, query, properties, filter,
           order_map, hidden_fields, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "view-tasks-secondary",
        "Secondary",
        "grid",
        "tasks",
        "SELECT * FROM tb_tasks",
        "{}",
        null,
        '{"title":0}',
        "[]",
        2015.5
      )
    database.close()

    const targetParent = mkdtempSync(
      path.join(tmpdir(), "eidos-view-position-target-")
    )
    roots.push(targetParent)
    const targetRoot = path.join(targetParent, "export")
    const plan = planLegacySpaceMigration(
      inspectLegacySpace(fixture.sourceRoot),
      { targetRoot }
    )

    expect(
      plan.issues
        .filter((issue) => issue.code === "view-position-normalized")
        .map((issue) => issue.sourceId)
    ).toEqual(["view-tasks", "view-tasks-secondary"])

    const result = await exportLegacySpace(plan, {
      migrationId: "view-position-export",
    })
    expect(result.validation.viewCountMatches).toBe(true)

    const eidosFile = openEidosFile(path.join(targetRoot, "main.eidos"), {
      readonly: true,
    })
    expect(
      eidosFile.listViews("tasks").map((view) => ({
        id: view.id,
        position: view.position,
      }))
    ).toEqual([
      { id: "view-tasks", position: 1 },
      { id: "view-tasks-secondary", position: 2 },
    ])
    eidosFile.close()
  })

  it("preserves an extension record even when no executable code was stored", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const database = new Database(fixture.databasePath)
    database
      .prepare(
        "UPDATE eidos__extensions SET code = NULL, ts_code = NULL WHERE id = ?"
      )
      .run("ext-block")
    database.close()
    const targetParent = mkdtempSync(
      path.join(tmpdir(), "eidos-empty-extension-target-")
    )
    roots.push(targetParent)
    const targetRoot = path.join(targetParent, "export")
    const plan = planLegacySpaceMigration(
      inspectLegacySpace(fixture.sourceRoot),
      { targetRoot }
    )
    const archived = plan.extensions.find(
      (extension) => extension.id === "ext-block"
    )!

    expect(archived).toMatchObject({ sourcePath: null, compiledPath: null })
    const result = await exportLegacySpace(plan, {
      migrationId: "empty-extension-export",
    })
    expect(result.validation.archivedExtensionsExist).toBe(true)
    expect(
      existsSync(path.join(targetRoot, archived.targetDirectory, "dist"))
    ).toBe(false)
    expect(
      JSON.parse(
        readFileSync(
          path.join(targetRoot, ...archived.metadataPath.split("/")),
          "utf8"
        )
      )
    ).toMatchObject({
      sourceModel: {
        originalTypeScriptStored: false,
        compiledJavaScriptStored: false,
      },
      portability: {
        readiness: "source-missing",
        reasonCode: "source-missing",
        sourceState: "missing",
      },
    })
  })

  it("exports one extension atomically without overwriting an existing target", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const extensions = inspectLegacyExtensions(fixture.sourceRoot)
    expect(extensions.map((extension) => extension.id)).toEqual([
      "ext-script",
      "ext-block",
    ])
    const parent = mkdtempSync(
      path.join(tmpdir(), "eidos-extension-archive-target-")
    )
    roots.push(parent)
    const targetDirectory = path.join(parent, "task-counter")

    const result = await exportLegacyExtensionArchive(extensions[0]!, {
      targetDirectory,
    })

    expect(result).toMatchObject({
      targetDirectory,
      archiveDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      portability: {
        readiness: "manual-port",
        candidateContribution: "command",
      },
    })
    expect(readFileSync(result.sourcePath!, "utf8")).toBe(
      'export async function hello() { return "source" }'
    )
    expect(JSON.parse(readFileSync(result.metadataPath, "utf8"))).toMatchObject(
      {
        formatVersion: 2,
        identity: { id: "ext-script" },
      }
    )

    await expect(
      exportLegacyExtensionArchive(extensions[1]!, { targetDirectory })
    ).rejects.toThrow("Migration target must be empty")
    expect(readFileSync(result.sourcePath!, "utf8")).toBe(
      'export async function hello() { return "source" }'
    )
    await expect(
      exportLegacyExtensionArchive(extensions[0]!, { targetDirectory: "" })
    ).rejects.toThrow("target is required")
  })

  it("remaps legacy field identifiers and skips missing document bodies", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const database = new Database(fixture.databasePath)
    database.function("legacy_percentage", { deterministic: true }, (value) =>
      Number.parseFloat(String(value))
    )
    database.exec(`
      ALTER TABLE tb_tasks ADD COLUMN "文本" TEXT;
      ALTER TABLE tb_tasks ADD COLUMN phys_attack TEXT;
      ALTER TABLE tb_tasks ADD COLUMN "⚔️phys_attack" TEXT;
      ALTER TABLE tb_tasks ADD COLUMN "_original_title" TEXT;
      ALTER TABLE tb_tasks ADD COLUMN mystery TEXT;
      ALTER TABLE tb_tasks ADD COLUMN broken_formula GENERATED ALWAYS AS (legacy_percentage(title));
    `)
    const insertField = database.prepare(
      `INSERT INTO eidos__columns
        (name, type, table_name, table_column_name, property)
       VALUES (?, ?, 'tb_tasks', ?, ?)`
    )
    insertField.run("文本", "text", "文本", "{}")
    insertField.run("Physical", "number", "phys_attack", null)
    insertField.run("⚔️ Physical", "number", "⚔️phys_attack", null)
    insertField.run("Original title", "text", "_original_title", null)
    insertField.run("Mystery", "currency", "mystery", '{"unit":"USD"}')
    insertField.run(
      "Broken formula",
      "formula",
      "broken_formula",
      '{"formula":"legacy_percentage(title)"}'
    )
    database
      .prepare(
        `UPDATE tb_tasks
            SET "文本" = ?, phys_attack = ?, "⚔️phys_attack" = ?, "_original_title" = ?, mystery = ?
          WHERE _id = ?`
      )
      .run("中文值", 10, 20, "Legacy", "12.50", "row-1")
    database
      .prepare(
        `UPDATE eidos__views
            SET query = ?, properties = ?, order_map = ?, hidden_fields = ?
          WHERE id = 'view-tasks'`
      )
      .run(
        `SELECT "文本", ⚔️phys_attack FROM tb_tasks WHERE title <> '文本'`,
        JSON.stringify({ fieldWidthMap: { 文本: 180 } }),
        JSON.stringify({ title: 0, 文本: 1, "⚔️phys_attack": 2 }),
        JSON.stringify(["文本"])
      )
    database
      .prepare(
        `INSERT INTO eidos__references
          (self_table_name, self_table_column_name,
           ref_table_name, ref_table_column_name,
           link_table_name, link_table_column_name)
         VALUES ('tb_tasks', 'attachment', 'tb_tasks', 'title', 'tb_tasks', 'status')`
      )
      .run()
    database
      .prepare(
        `INSERT INTO eidos__tree
          (id, name, type, parent_id, position, icon, is_deleted, created_at, updated_at)
         VALUES ('missing-doc', 'Missing body', 'doc', null, 20, null, 0, null, null)`
      )
      .run()
    database.close()

    const targetParent = mkdtempSync(path.join(tmpdir(), "eidos-remap-target-"))
    roots.push(targetParent)
    const targetRoot = path.join(targetParent, "export")
    const plan = planLegacySpaceMigration(
      inspectLegacySpace(fixture.sourceRoot),
      { targetRoot }
    )
    const plannedTable = plan.tables.find((table) => table.id === "tasks")!
    const fieldMap = new Map(
      plannedTable.fields.map((field) => [
        field.sourceColumnName,
        field.targetColumnName,
      ])
    )

    expect(plan.summary.errorCount).toBe(0)
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "field-column-remapped",
        }),
        expect.objectContaining({
          severity: "warning",
          code: "empty-documents-skipped",
        }),
        expect.objectContaining({
          severity: "warning",
          code: "unsupported-field-type",
        }),
        expect.objectContaining({
          severity: "warning",
          code: "generated-column-unreadable",
        }),
      ])
    )
    expect(fieldMap.get("文本")).toMatch(/^field_[a-f0-9]{8}$/)
    expect(fieldMap.get("⚔️phys_attack")).toMatch(/^phys_attack_[a-f0-9]{8}$/)
    expect(fieldMap.get("_original_title")).toBe("original_title")

    const result = await exportLegacySpace(plan, {
      migrationId: "remap-export",
    })
    expect(result.exportedReferenceCount).toBe(1)
    expect(result.skippedEmptyDocumentCount).toBe(1)
    expect(existsSync(path.join(targetRoot, "notes", "Missing body.md"))).toBe(
      false
    )

    const base = openEidosFile(path.join(targetRoot, "main.eidos"), {
      readonly: true,
    })
    const row = base.listRows("tasks")[0]
    expect(row[fieldMap.get("文本")!]).toBe("中文值")
    expect(row[fieldMap.get("⚔️phys_attack")!]).toBe(20)
    expect(row.original_title).toBe("Legacy")
    expect(row.broken_formula).toBeNull()
    expect(
      base
        .listFields("tasks")
        .find((field) => field.tableColumnName === "original_title")
    ).toMatchObject({ sourceTableColumnName: "_original_title" })
    expect(
      base
        .listFields("tasks")
        .find((field) => field.tableColumnName === "mystery")
    ).toMatchObject({
      type: "text",
      property: {
        unit: "USD",
        eidosMigration: { sourceFieldType: "currency" },
      },
    })
    expect(base.listViews("tasks")[0]).toMatchObject({
      query: expect.stringContaining(fieldMap.get("文本")!),
      properties: { fieldWidthMap: { [fieldMap.get("文本")!]: 180 } },
      orderMap: expect.objectContaining({ [fieldMap.get("文本")!]: 1 }),
      hiddenFields: [fieldMap.get("文本")!],
    })
    expect(base.listViews("tasks")[0].query).toContain("'文本'")
    base.close()
  })

  it("promotes compatible legacy formulas and lookups to live Eidos File fields", async () => {
    const fixture = createLegacyFixture()
    roots.push(fixture.sourceRoot)
    const database = new Database(fixture.databasePath)
    database.exec(`
      ALTER TABLE tb_tasks ADD COLUMN owner TEXT;
      ALTER TABLE tb_tasks ADD COLUMN owner_name TEXT;
      ALTER TABLE tb_tasks ADD COLUMN upper_title TEXT
        GENERATED ALWAYS AS (upper(title)) VIRTUAL;
      CREATE TABLE tb_people (
        _id TEXT PRIMARY KEY,
        title TEXT
      );
    `)
    database
      .prepare(
        `INSERT INTO eidos__tree
          (id, name, type, parent_id, position, icon, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("people", "People", "table", null, 5, null, 0, null, null)
    const insertField = database.prepare(
      `INSERT INTO eidos__columns
        (name, type, table_name, table_column_name, property)
       VALUES (?, ?, ?, ?, ?)`
    )
    insertField.run(
      "Owner",
      "link",
      "tb_tasks",
      "owner",
      JSON.stringify({ linkTableName: "tb_people", linkColumnName: "title" })
    )
    insertField.run(
      "Owner name",
      "lookup",
      "tb_tasks",
      "owner_name",
      JSON.stringify({ linkFieldId: "owner", lookupTargetFieldId: "title" })
    )
    insertField.run(
      "Upper title",
      "formula",
      "tb_tasks",
      "upper_title",
      JSON.stringify({ formula: "upper(title)", displayType: "text" })
    )
    database
      .prepare("INSERT INTO tb_people (_id, title) VALUES (?, ?)")
      .run("person-1", "Alice")
    database
      .prepare("UPDATE tb_tasks SET owner = ?, owner_name = ? WHERE _id = ?")
      .run("person-1", "Alice", "row-1")
    database
      .prepare(
        `INSERT INTO eidos__references
          (self_table_name, self_table_column_name,
           ref_table_name, ref_table_column_name,
           link_table_name, link_table_column_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("tb_tasks", "owner_name", "tb_people", "title", "tb_tasks", "owner")
    database.close()

    const targetParent = mkdtempSync(
      path.join(tmpdir(), "eidos-derived-target-")
    )
    roots.push(targetParent)
    const targetRoot = path.join(targetParent, "export")
    const plan = planLegacySpaceMigration(
      inspectLegacySpace(fixture.sourceRoot),
      { targetRoot }
    )
    expect(
      plan.issues.filter((issue) => issue.code === "derived-field-materialized")
    ).toEqual([])

    await exportLegacySpace(plan, { migrationId: "derived-export" })
    const filePath = path.join(targetRoot, "main.eidos")
    const base = openEidosFile(filePath)
    expect(base.listFields("tasks")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableColumnName: "upper_title",
          valueKind: "derived",
          isDerived: true,
          dependsOn: ["title"],
        }),
        expect.objectContaining({
          tableColumnName: "owner_name",
          valueKind: "derived",
          property: expect.objectContaining({
            relationField: "owner",
            targetField: "title",
            aggregate: "values",
          }),
        }),
      ])
    )
    expect(
      base.connection
        .query<{ name: string }>('PRAGMA table_xinfo("tb_tasks")')
        .map((column) => column.name)
    ).not.toEqual(expect.arrayContaining(["upper_title", "owner_name"]))
    expect(base.listRows("tasks")[0]).toMatchObject({
      title: "Ship",
      upper_title: "SHIP",
      owner: '["person-1"]',
      owner_name: '["Alice"]',
    })
    expect(base.updateRow("tasks", "row-1", { title: "Launch" })).toMatchObject(
      { upper_title: "LAUNCH" }
    )
    base.updateRow("people", "person-1", { title: "Bob" })
    expect(base.listRows("tasks")[0].owner_name).toBe('["Bob"]')
    base.close()

    const reopened = openEidosFile(filePath, { readonly: true })
    expect(reopened.listRows("tasks")[0]).toMatchObject({
      upper_title: "LAUNCH",
      owner_name: '["Bob"]',
    })
    reopened.close()
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

  it("exports Markdown, Eidos File rows, assets, recovery data, and reports atomically", async () => {
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
      skippedEmptyDocumentCount: 0,
      exportedTableCount: 1,
      exportedRowCount: 1,
      exportedFieldCount: 3,
      exportedViewCount: 1,
      exportedReferenceCount: 0,
      copiedAssetCount: 2,
      archivedExtensionCount: 2,
      recoveredLexicalDocumentCount: 1,
      validation: {
        eidosFileValid: true,
        documentCountMatches: true,
        tableCountMatches: true,
        rowCountMatches: true,
        fieldCountMatches: true,
        viewCountMatches: true,
        referenceCountMatches: true,
        assetCountMatches: true,
        copiedAssetsExist: true,
        extensionCountMatches: true,
        archivedExtensionsExist: true,
      },
    })
    expect(phases).toEqual(
      expect.arrayContaining([
        "preparing",
        "documents",
        "tables",
        "assets",
        "extensions",
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
    ).toBe(
      '{"root":{"children":[{"type":"paragraph","children":[{"type":"text","text":"Recovered text"}]}]}}'
    )
    expect(
      readFileSync(path.join(targetRoot, "assets", "logo.png"), "utf8")
    ).toBe("logo")
    expect(
      readFileSync(
        path.join(targetRoot, "assets", "nested", "unregistered.txt"),
        "utf8"
      )
    ).toBe("hello")
    const scriptArchive = plan.extensions.find(
      (extension) => extension.id === "ext-script"
    )!
    const blockArchive = plan.extensions.find(
      (extension) => extension.id === "ext-block"
    )!
    expect(result.extensionMigrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legacyExtensionId: "ext-script",
          archiveRelativePath: scriptArchive.targetDirectory,
          archiveDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          executable: false,
          portability: expect.objectContaining({
            readiness: "manual-port",
            candidateContribution: "command",
          }),
          nextAction: {
            kind: "port-manually",
            command: expect.stringContaining(
              `port "./${scriptArchive.targetDirectory}"`
            ),
          },
        }),
        expect.objectContaining({
          legacyExtensionId: "ext-block",
          archiveRelativePath: blockArchive.targetDirectory,
          executable: false,
          nextAction: { kind: "review-source", command: null },
        }),
      ])
    )
    expect(
      readFileSync(
        path.join(targetRoot, ...scriptArchive.sourcePath!.split("/")),
        "utf8"
      )
    ).toBe('export async function hello() { return "source" }')
    expect(
      readFileSync(
        path.join(targetRoot, ...scriptArchive.compiledPath!.split("/")),
        "utf8"
      )
    ).toBe('exports.hello = async () => "compiled";')
    expect(
      JSON.parse(
        readFileSync(
          path.join(targetRoot, ...blockArchive.metadataPath.split("/")),
          "utf8"
        )
      )
    ).toMatchObject({
      format: "eidos-legacy-extension-archive",
      formatVersion: 2,
      identity: { id: "ext-block", slug: "hello:world" },
      sourceModel: { metaJson: "{broken", enabled: false },
      portability: {
        readiness: "needs-review",
        reasonCode: "metadata-invalid",
        metadataState: "invalid",
      },
    })
    expect(
      readFileSync(
        path.join(targetRoot, ...blockArchive.readmePath.split("/")),
        "utf8"
      )
    ).toContain("not an installable file-based extension")
    expect(
      readFileSync(
        path.join(targetRoot, ...scriptArchive.readmePath.split("/")),
        "utf8"
      )
    ).toContain("@eidos.space/extension-cli port .")
    expect(existsSync(result.reportPath)).toBe(true)
    expect(readFileSync(result.reportPath, "utf8")).toContain(
      "Status: completed"
    )
    expect(readFileSync(result.reportPath, "utf8")).toContain(
      "## Legacy extension migration"
    )
    expect(readFileSync(result.reportPath, "utf8")).toContain(
      "npx @eidos.space/extension-cli port"
    )
    expect(JSON.parse(readFileSync(result.mappingPath, "utf8"))).toMatchObject({
      plan: { format: "eidos-legacy-space-migration-plan" },
      result: {
        status: "completed",
        extensionMigrations: expect.arrayContaining([
          expect.objectContaining({
            legacyExtensionId: "ext-script",
            executable: false,
          }),
          expect.objectContaining({
            legacyExtensionId: "ext-block",
            executable: false,
          }),
        ]),
      },
    })

    const base = openEidosFile(path.join(targetRoot, "main.eidos"), {
      readonly: true,
    })
    expect(base.listTables()).toMatchObject([{ id: "tasks", name: "Tasks" }])
    expect(base.listRows("tasks")).toEqual([
      expect.objectContaining({
        _id: "row-1",
        title: "Ship",
        attachment: '["assets/logo.png"]',
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
