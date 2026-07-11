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
      attachment: "assets/spec.pdf",
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
})
