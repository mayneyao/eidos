import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"

import {
  createBaseFile,
  hasSqliteHeader,
  inspectBaseFile,
  openBaseFile,
} from "./better-sqlite3"
import type { BetterSqlite3BaseConnection } from "./better-sqlite3"
import {
  BASE_COLUMNS_TABLE,
  BASE_FORMAT,
  BASE_META_TABLE,
  BASE_SCHEMA_VERSION,
} from "./constants"
import { BaseError } from "./errors"

function expectBaseError(
  operation: () => unknown,
  code: BaseError["code"]
): void {
  try {
    operation()
    throw new Error(`Expected BaseError: ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(BaseError)
    expect((error as BaseError).code).toBe(code)
  }
}

describe("Eidos Base files", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-base-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("creates a portable Base with a table, fields, view, and editable rows", () => {
    const filePath = path.join(root, "tasks.base")
    const base = createBaseFile(filePath, {
      title: "Project Tasks",
      description: "Portable task data",
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          {
            name: "Status",
            columnName: "status",
            type: "select",
            property: {
              options: [
                { id: "todo", name: "Todo" },
                { id: "done", name: "Done" },
              ],
            },
          },
          {
            name: "Attachment",
            columnName: "attachment",
            type: "file",
          },
        ],
      },
    })

    expect(hasSqliteHeader(filePath)).toBe(true)
    expect(base.info()).toMatchObject({
      format: BASE_FORMAT,
      formatVersion: 1,
      schemaVersion: BASE_SCHEMA_VERSION,
      title: "Project Tasks",
      defaultTableId: "tasks",
    })
    expect(base.listTables()).toMatchObject([
      { id: "tasks", name: "Tasks", rawTableName: "tb_tasks" },
    ])
    base.createTable({ id: "people", name: "People" })
    expect(base.listTables()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "tasks", name: "Tasks" }),
        expect.objectContaining({ id: "people", name: "People" }),
      ])
    )
    expect(base.listFields("tasks")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableColumnName: "status",
          type: "select",
          property: {
            options: [
              { id: "todo", name: "Todo" },
              { id: "done", name: "Done" },
            ],
          },
        }),
        expect.objectContaining({
          tableColumnName: "attachment",
          type: "file",
          storageCodec: "json_array",
        }),
      ])
    )
    const gridView = base.listViews("tasks")[0]
    expect(gridView).toMatchObject({ name: "Grid", type: "grid" })
    expect(
      base.updateView(gridView.id, {
        properties: { fieldWidthMap: { title: 320 } },
        orderMap: { title: 0, status: 1, attachment: 2 },
      })
    ).toMatchObject({
      properties: { fieldWidthMap: { title: 320 } },
      orderMap: { title: 0, status: 1, attachment: 2 },
    })

    const inserted = base.insertRow("tasks", {
      title: "Ship Base v1",
      status: "todo",
      attachment: "assets/spec.pdf",
    })
    expect(inserted).toMatchObject({
      title: "Ship Base v1",
      status: "todo",
      attachment: '["assets/spec.pdf"]',
    })
    expect(typeof inserted._id).toBe("string")

    expect(
      base.updateRow("tasks", String(inserted._id), { status: "done" })
    ).toMatchObject({ status: "done" })
    expect(base.listRows("tasks")).toHaveLength(1)
    expect(base.deleteRow("tasks", String(inserted._id))).toBe(true)
    expect(base.listRows("tasks")).toEqual([])
    base.close()

    const checkboxBase = createBaseFile(path.join(root, "checkbox.base"), {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [{ name: "Done", columnName: "done", type: "checkbox" }],
      },
    })
    expect(
      checkboxBase.insertRow("tasks", { title: "Boolean input", done: true })
    ).toMatchObject({ done: 1 })
    checkboxBase.close()

    const inspection = inspectBaseFile(filePath)
    expect(inspection).toMatchObject({
      valid: true,
      metadata: { format: BASE_FORMAT, defaultTableId: "tasks" },
      tables: [
        { id: "tasks", rawTableName: "tb_tasks" },
        { id: "people", rawTableName: "tb_people" },
      ],
      errors: [],
    })

    const reopened = openBaseFile(filePath, { readonly: true })
    expect(reopened.info().title).toBe("Project Tasks")
    expect(reopened.listTables()).toHaveLength(2)
    expect(reopened.listViews("tasks")[0]).toMatchObject({
      properties: { fieldWidthMap: { title: 320 } },
    })
    reopened.close()
  })

  it("requires both a SQLite header and Base metadata", async () => {
    const textPath = path.join(root, "fake.base")
    await writeFile(textPath, "not sqlite")

    expect(inspectBaseFile(textPath)).toMatchObject({
      valid: false,
      errors: [{ code: "invalid-sqlite" }],
    })
    expectBaseError(() => openBaseFile(textPath), "invalid-sqlite")

    const sqlitePath = path.join(root, "ordinary.base")
    const sqlite = new Database(sqlitePath)
    sqlite.exec("CREATE TABLE notes (id TEXT PRIMARY KEY)")
    sqlite.close()

    expect(inspectBaseFile(sqlitePath)).toMatchObject({
      valid: false,
      metadata: null,
    })
    expectBaseError(() => openBaseFile(sqlitePath), "not-base")
  })

  it("persists the complete Grid view lifecycle independently per view", () => {
    const filePath = path.join(root, "views.base")
    const base = createBaseFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [{ name: "Priority", columnName: "priority", type: "number" }],
      },
    })
    const original = base.listViews("tasks")[0]
    base.updateView(original.id, {
      name: "All tasks",
      properties: { fieldWidthMap: { title: 280 } },
      hiddenFields: ["priority"],
    })
    const priority = base.createView("tasks", {
      name: "By priority",
      type: "grid",
      sorts: [{ field: "priority", direction: "desc" }],
      orderMap: { priority: 0, title: 1 },
    })
    const duplicate = base.duplicateView(priority.id)

    expect(duplicate).toMatchObject({
      name: "By priority copy",
      type: "grid",
      sorts: [{ field: "priority", direction: "desc" }],
      orderMap: { priority: 0, title: 1 },
    })
    expect(base.updateView(duplicate.id, { name: "Focus" })).toMatchObject({
      name: "Focus",
    })
    expect(
      base.reorderViews("tasks", [duplicate.id, original.id, priority.id])
    ).toMatchObject([
      { id: duplicate.id, position: 1 },
      { id: original.id, position: 2 },
      { id: priority.id, position: 3 },
    ])
    expectBaseError(
      () => base.reorderViews("tasks", [original.id, priority.id]),
      "invalid-range"
    )
    expect(base.deleteView(priority.id)).toBe(true)
    expect(base.deleteView(duplicate.id)).toBe(true)
    expectBaseError(() => base.deleteView(original.id), "protected-view")
    base.close()

    const reopened = openBaseFile(filePath)
    expect(reopened.listViews("tasks")).toMatchObject([
      {
        id: original.id,
        name: "All tasks",
        properties: { fieldWidthMap: { title: 280 } },
        hiddenFields: ["priority"],
      },
    ])
    reopened.close()
  })

  it("renames and deletes Base tables and fields transactionally", () => {
    const filePath = path.join(root, "structure.base")
    const base = createBaseFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          {
            name: "Status",
            columnName: "status",
            type: "select",
            property: { options: [{ id: "todo", name: "Todo" }] },
          },
          { name: "Notes", columnName: "notes", type: "text" },
        ],
      },
    })
    base.createTable({ id: "people", name: "People" })

    expect(base.updateTable("people", { name: "Contacts" })).toMatchObject({
      id: "people",
      name: "Contacts",
    })
    expect(
      base.updateField("tasks", "status", {
        name: "State",
        property: { options: [{ id: "done", name: "Done" }] },
      })
    ).toMatchObject({
      name: "State",
      tableColumnName: "status",
      property: { options: [{ id: "done", name: "Done" }] },
    })

    const view = base.listViews("tasks")[0]
    base.updateView(view.id, {
      properties: { fieldWidthMap: { title: 240, status: 160 } },
      orderMap: { title: 0, status: 1, notes: 2 },
      hiddenFields: ["status"],
    })
    expect(base.deleteField("tasks", "status")).toBe(true)
    expect(base.listFields("tasks")).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableColumnName: "status" }),
      ])
    )
    expect(base.listViews("tasks")[0]).toMatchObject({
      properties: { fieldWidthMap: { title: 240 } },
      orderMap: { title: 0, notes: 1 },
      hiddenFields: [],
    })
    expectBaseError(() => base.deleteField("tasks", "title"), "protected-field")

    expect(base.deleteTable("tasks")).toBe(true)
    expect(base.listTables()).toMatchObject([
      { id: "people", name: "Contacts" },
    ])
    expect(base.info().defaultTableId).toBe("people")
    expectBaseError(() => base.getTable("tasks"), "table-not-found")
    expect(base.deleteTable("people")).toBe(true)
    expect(base.listTables()).toEqual([])
    expect(base.info().defaultTableId).toBeUndefined()
    base.close()
  })

  it("imports legacy field semantics, views, references, and historical rows", () => {
    const filePath = path.join(root, "imported.base")
    const base = createBaseFile(filePath, { title: "Imported Space" })
    base.createTable({
      id: "tasks",
      name: "Tasks",
      createDefaultView: false,
    })
    base.createTable({
      id: "people",
      name: "People",
      createDefaultView: false,
    })
    base.importField("tasks", {
      name: "Computed label",
      columnName: "computed_label",
      type: "formula",
      property: { formula: "upper(title)" },
      storageCodec: "materialized_text",
      valueKind: "materialized",
      isDerived: true,
      dependsOn: ["title"],
    })
    base.importField("tasks", {
      name: "Owner",
      columnName: "owner",
      type: "link",
      storageCodec: "relation",
      valueKind: "relation",
    })
    base.importField("people", {
      name: "Task lookup",
      columnName: "task_lookup",
      type: "lookup",
      valueKind: "materialized",
      isDerived: true,
      sourceTableColumnName: "owner",
    })
    base.importField("tasks", {
      name: "Task title",
      columnName: "title",
      type: "title",
      property: { migrated: true },
    })
    base.importField("tasks", {
      name: "Legacy row ID",
      columnName: "_id",
      type: "row-id",
      valueKind: "system",
      isHidden: true,
      property: { migrated: true },
    })
    base.createView("tasks", {
      id: "legacy_grid",
      name: "All tasks",
      type: "grid",
      query: "SELECT * FROM tb_tasks",
      orderMap: { title: 0, owner: 1, computed_label: 2 },
      hiddenFields: ["computed_label"],
    })
    base.createReference({
      selfTableId: "people",
      selfColumnName: "task_lookup",
      refTableId: "tasks",
      refColumnName: "title",
      linkTableId: "tasks",
      linkColumnName: "owner",
    })

    expect(
      base.insertImportedRow("tasks", {
        _id: "legacy-row",
        title: "Ship migration",
        computed_label: "SHIP MIGRATION",
        owner: "person-1",
        _created_time: "2025-01-02 03:04:05",
        _last_edited_time: "2025-01-03 04:05:06",
        _created_by: "legacy-user",
        _last_edited_by: "legacy-user",
      })
    ).toMatchObject({
      _id: "legacy-row",
      computed_label: "SHIP MIGRATION",
      _created_time: "2025-01-02 03:04:05",
    })
    const connection = base.connection as BetterSqlite3BaseConnection
    const prepare = vi.spyOn(connection.database, "prepare")
    expect(
      base.insertImportedRows("tasks", [
        { _id: "legacy-row-2", title: "Second" },
        { _id: "legacy-row-3", title: "Third" },
      ])
    ).toHaveLength(2)
    expect(
      prepare.mock.calls.filter(([sql]) =>
        String(sql).startsWith('INSERT INTO "tb_tasks"')
      )
    ).toHaveLength(1)
    prepare.mockRestore()
    expect(base.countRows("tasks")).toBe(3)
    expect(base.listFields("tasks")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableColumnName: "title",
          property: { migrated: true },
        }),
        expect.objectContaining({
          tableColumnName: "_id",
          property: { migrated: true },
          valueKind: "system",
        }),
        expect.objectContaining({
          tableColumnName: "computed_label",
          type: "formula",
          valueKind: "materialized",
          isDerived: true,
          dependsOn: ["title"],
        }),
      ])
    )
    expect(base.listViews("tasks")).toEqual([
      expect.objectContaining({
        id: "legacy_grid",
        orderMap: { title: 0, owner: 1, computed_label: 2 },
        hiddenFields: ["computed_label"],
      }),
    ])
    expect(
      base.connection.query("SELECT self, ref, link FROM eidos__references")
    ).toEqual([
      {
        self: "tb_people.task_lookup",
        ref: "tb_tasks.title",
        link: "tb_tasks.owner",
      },
    ])
    base.close()

    expect(inspectBaseFile(filePath)).toMatchObject({ valid: true, errors: [] })
  })

  it("migrates compatible pre-v1 field metadata without core", () => {
    const filePath = path.join(root, "legacy.base")
    createBaseFile(filePath).close()

    const sqlite = new Database(filePath)
    sqlite.exec(`
      DROP TABLE ${BASE_COLUMNS_TABLE};
      CREATE TABLE ${BASE_COLUMNS_TABLE} (
        name TEXT,
        type TEXT,
        table_name TEXT,
        table_column_name TEXT,
        property TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(table_name, table_column_name)
      );
      DELETE FROM ${BASE_META_TABLE} WHERE key = 'schema_version';
    `)
    sqlite.close()

    const before = inspectBaseFile(filePath)
    expect(before.valid).toBe(true)
    expect(before.warnings).toContainEqual(
      expect.objectContaining({ code: "schema-migration-available" })
    )

    openBaseFile(filePath, { migrate: true }).close()

    const migrated = new Database(filePath, { readonly: true })
    const columnNames = migrated
      .prepare(`PRAGMA table_info(${BASE_COLUMNS_TABLE})`)
      .all()
      .map((column) => (column as { name: string }).name)
    const schemaVersion = migrated
      .prepare(
        `SELECT value FROM ${BASE_META_TABLE} WHERE key = 'schema_version'`
      )
      .pluck()
      .get()
    migrated.close()

    expect(columnNames).toEqual(
      expect.arrayContaining([
        "storage_codec",
        "value_kind",
        "is_hidden",
        "is_derived",
        "source_table_column_name",
        "depends_on",
      ])
    )
    expect(schemaVersion).toBe(String(BASE_SCHEMA_VERSION))
  })

  it("reports a registered table whose physical table is missing", () => {
    const filePath = path.join(root, "broken.base")
    createBaseFile(filePath, {
      defaultTable: { id: "tasks", name: "Tasks" },
    }).close()
    const sqlite = new Database(filePath)
    sqlite.exec("DROP TABLE tb_tasks")
    sqlite.close()

    expect(inspectBaseFile(filePath)).toMatchObject({
      valid: false,
      errors: [
        expect.objectContaining({
          code: "missing-user-table",
          table: "tb_tasks",
        }),
      ],
    })
  })

  it("queries and deletes the visible rows using persisted search, filter, and sort semantics", () => {
    const filePath = path.join(root, "query.base")
    const base = createBaseFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          { name: "Priority", columnName: "priority", type: "number" },
          { name: "Status", columnName: "status", type: "select" },
          {
            name: "Labels",
            columnName: "labels",
            type: "multi-select",
            storageCodec: "csv_ids",
          },
        ],
      },
    })
    base.insertRow("tasks", {
      title: "Write release notes",
      priority: 2,
      status: "doing",
      labels: "docs,urgent",
    })
    base.insertRow("tasks", {
      title: "Fix desktop build",
      priority: 3,
      status: "doing",
      labels: "bug,urgent",
    })
    base.insertRow("tasks", {
      title: "Archive draft",
      priority: 1,
      status: "done",
      labels: "docs",
    })

    const filter = {
      type: "group" as const,
      conjunction: "and" as const,
      children: [
        {
          type: "rule" as const,
          field: "status",
          operator: "equals" as const,
          value: "doing",
        },
        {
          type: "rule" as const,
          field: "labels",
          operator: "contains" as const,
          value: "urgent",
        },
      ],
    }
    const query = {
      search: "i",
      filter,
      sorts: [{ field: "priority", direction: "desc" as const }],
    }
    expect(base.getRowPage("tasks", 0, 100, query)).toMatchObject({
      total: 2,
      rows: [
        { title: "Fix desktop build", priority: 3 },
        { title: "Write release notes", priority: 2 },
      ],
    })

    const view = base.listViews("tasks")[0]
    base.updateView(view.id, { filter, sorts: query.sorts })
    expect(base.listViews("tasks")[0]).toMatchObject({
      filter,
      sorts: query.sorts,
    })

    expect(
      base.deleteRowRanges("tasks", [{ startIndex: 0, endIndex: 1 }], query)
    ).toBe(1)
    expect(base.listRows("tasks", 100, 0).map((row) => row.title)).toEqual([
      "Write release notes",
      "Archive draft",
    ])
    base.close()

    const reopened = openBaseFile(filePath)
    expect(reopened.listViews("tasks")[0]).toMatchObject({
      filter,
      sorts: query.sorts,
    })
    reopened.close()
  })

  it("pages large tables and deletes selected rows without a snapshot cap", () => {
    const filePath = path.join(root, "large.base")
    createBaseFile(filePath, {
      defaultTable: { id: "records", name: "Records" },
    }).close()
    const sqlite = new Database(filePath)
    const insert = sqlite.prepare(
      "INSERT INTO tb_records (_id, title) VALUES (?, ?)"
    )
    sqlite.transaction(() => {
      for (let index = 0; index < 10_000; index += 1) {
        insert.run(`row_${index}`, `Row ${index}`)
      }
    })()
    sqlite.close()
    const base = openBaseFile(filePath)

    expect(base.countRows("records")).toBe(10_000)
    const lastPage = base.getRowPage("records", 9_975, 50)
    expect(lastPage).toMatchObject({
      tableId: "records",
      offset: 9_975,
      limit: 50,
      total: 10_000,
    })
    expect(lastPage.rows).toHaveLength(25)
    expect(lastPage.rows[0]).toMatchObject({
      _id: "row_9975",
      title: "Row 9975",
    })

    expect(
      base.deleteRowRanges("records", [
        { startIndex: 1, endIndex: 3 },
        { startIndex: 5_000, endIndex: 9_000 },
        { startIndex: 8_990, endIndex: 9_010 },
      ])
    ).toBe(4_012)
    expect(base.countRows("records")).toBe(5_988)
    expectBaseError(
      () => base.deleteRowRanges("records", [{ startIndex: 4, endIndex: 4 }]),
      "invalid-range"
    )

    expect(
      base.deleteRows("records", ["row_3", "row_3", "row_9010", "missing"])
    ).toEqual(["row_3", "row_9010"])
    expect(base.countRows("records")).toBe(5_986)
    base.close()
  })
})
