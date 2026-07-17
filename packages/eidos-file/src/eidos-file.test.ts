import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"

import {
  createEidosFile,
  hasSqliteHeader,
  inspectEidosFile,
  openEidosFile,
} from "./better-sqlite3"
import type { BetterSqlite3EidosFileConnection } from "./better-sqlite3"
import {
  EIDOS_FILE_COLUMNS_TABLE,
  EIDOS_FILE_FORMAT,
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_SCHEMA_VERSION,
  EIDOS_FILE_VIEWS_TABLE,
} from "./constants"
import { EidosFileError } from "./errors"
import * as formulaCompiler from "./formula"

function expectEidosFileError(
  operation: () => unknown,
  code: EidosFileError["code"]
): void {
  try {
    operation()
    throw new Error(`Expected EidosFileError: ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(EidosFileError)
    expect((error as EidosFileError).code).toBe(code)
  }
}

describe("Eidos File runtime", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-file-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("uses .eidos as the only Eidos File extension", () => {
    expectEidosFileError(
      () => createEidosFile(path.join(root, "legacy.base")),
      "invalid-identifier"
    )
    expectEidosFileError(
      () => openEidosFile(path.join(root, "legacy.base")),
      "invalid-identifier"
    )

    const eidosFile = createEidosFile(path.join(root, "current.eidos"))
    eidosFile.close()
  })

  it("creates a portable Eidos File with a table, fields, view, and editable rows", () => {
    const filePath = path.join(root, "tasks.eidos")
    const eidosFile = createEidosFile(filePath, {
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
              options: [{ value: "todo" }, { value: "done" }],
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
    expect(eidosFile.info()).toMatchObject({
      format: EIDOS_FILE_FORMAT,
      formatVersion: 1,
      schemaVersion: EIDOS_FILE_SCHEMA_VERSION,
      title: "Project Tasks",
      defaultTableId: "tasks",
    })
    expect(eidosFile.listTables()).toMatchObject([
      { id: "tasks", name: "Tasks", rawTableName: "tb_tasks" },
    ])
    eidosFile.createTable({ id: "people", name: "People" })
    const autoTable = eidosFile.createTable({ name: "Auto" })
    expect(autoTable.id).toMatch(/^[0-9a-f]{32}$/)
    expect(eidosFile.listTables()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "tasks", name: "Tasks" }),
        expect.objectContaining({ id: "people", name: "People" }),
      ])
    )
    expect(eidosFile.listFields("tasks")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableColumnName: "status",
          type: "select",
          property: {
            options: [{ value: "todo" }, { value: "done" }],
          },
        }),
        expect.objectContaining({
          tableColumnName: "attachment",
          type: "file",
          storageCodec: "json_array",
        }),
      ])
    )
    const gridView = eidosFile.listViews("tasks")[0]
    expect(gridView).toMatchObject({ name: "Grid", type: "grid" })
    expect(gridView.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(
      eidosFile.updateView(gridView.id, {
        properties: { fieldWidthMap: { title: 320 } },
        orderMap: { title: 0, status: 1, attachment: 2 },
      })
    ).toMatchObject({
      properties: { fieldWidthMap: { title: 320 } },
      orderMap: { title: 0, status: 1, attachment: 2 },
    })

    const inserted = eidosFile.insertRow("tasks", {
      title: "Ship Eidos File v1",
      status: "todo",
      attachment: '["assets/spec.pdf"]',
    })
    expect(inserted).toMatchObject({
      title: "Ship Eidos File v1",
      status: "todo",
      attachment: '["assets/spec.pdf"]',
    })
    expect(inserted._id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )

    expect(
      eidosFile.updateRow("tasks", String(inserted._id), { status: "done" })
    ).toMatchObject({ status: "done" })

    const second = eidosFile.insertRow("tasks", {
      title: "Document release",
      status: "todo",
    })
    expect(
      eidosFile.updateRows("tasks", [
        {
          rowId: String(inserted._id),
          changes: { title: "Ship Eidos File", status: "todo" },
        },
        {
          rowId: String(second._id),
          changes: { title: "Publish docs", status: "done" },
        },
      ])
    ).toMatchObject([
      { title: "Ship Eidos File", status: "todo" },
      { title: "Publish docs", status: "done" },
    ])

    expectEidosFileError(
      () =>
        eidosFile.updateRows("tasks", [
          {
            rowId: String(inserted._id),
            changes: { title: "Must roll back" },
          },
          { rowId: "missing-row", changes: { title: "Missing" } },
        ]),
      "row-not-found"
    )
    expect(eidosFile.listRows("tasks")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: inserted._id,
          title: "Ship Eidos File",
        }),
      ])
    )
    eidosFile.connection.run(
      `UPDATE ${EIDOS_FILE_META_TABLE} SET value = ? WHERE key = 'updated_at'`,
      ["2000-01-01T00:00:00.000Z"]
    )
    const metadataBeforeMissingUpdate = eidosFile.info().updatedAt
    expectEidosFileError(
      () => eidosFile.updateRow("tasks", "missing-row", { status: "todo" }),
      "row-not-found"
    )
    expect(eidosFile.info().updatedAt).toBe(metadataBeforeMissingUpdate)
    expect(eidosFile.listRows("tasks")).toHaveLength(2)
    expect(eidosFile.deleteRow("tasks", String(inserted._id))).toBe(true)
    expect(eidosFile.deleteRow("tasks", String(second._id))).toBe(true)
    expect(eidosFile.listRows("tasks")).toEqual([])
    eidosFile.close()

    const checkboxEidosFile = createEidosFile(
      path.join(root, "checkbox.eidos"),
      {
        defaultTable: {
          id: "tasks",
          name: "Tasks",
          fields: [{ name: "Done", columnName: "done", type: "checkbox" }],
        },
      }
    )
    expect(
      checkboxEidosFile.insertRow("tasks", {
        title: "Boolean input",
        done: true,
      })
    ).toMatchObject({ done: 1 })
    checkboxEidosFile.close()

    const inspection = inspectEidosFile(filePath)
    expect(inspection).toMatchObject({
      valid: true,
      metadata: { format: EIDOS_FILE_FORMAT, defaultTableId: "tasks" },
      tables: [
        { id: "tasks", rawTableName: "tb_tasks" },
        { id: "people", rawTableName: "tb_people" },
        {
          id: autoTable.id,
          rawTableName: `tb_${autoTable.id}`,
        },
      ],
      errors: [],
    })

    const reopened = openEidosFile(filePath, { readonly: true })
    expect(reopened.info().title).toBe("Project Tasks")
    expect(reopened.listTables()).toHaveLength(3)
    expect(reopened.listViews("tasks")[0]).toMatchObject({
      properties: { fieldWidthMap: { title: 320 } },
    })
    reopened.close()
  })

  it("requires both a SQLite header and Eidos File metadata", async () => {
    const textPath = path.join(root, "fake.eidos")
    await writeFile(textPath, "not sqlite")

    expect(inspectEidosFile(textPath)).toMatchObject({
      valid: false,
      errors: [{ code: "invalid-sqlite" }],
    })
    expectEidosFileError(() => openEidosFile(textPath), "invalid-sqlite")

    const sqlitePath = path.join(root, "ordinary.eidos")
    const sqlite = new Database(sqlitePath)
    sqlite.exec("CREATE TABLE notes (id TEXT PRIMARY KEY)")
    sqlite.close()

    expect(inspectEidosFile(sqlitePath)).toMatchObject({
      valid: false,
      metadata: null,
    })
    expectEidosFileError(() => openEidosFile(sqlitePath), "not-eidos-file")
  })

  it("rejects malformed field, view, and formula metadata before opening", () => {
    const filePath = path.join(root, "untrusted.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          { name: "Estimate", columnName: "estimate", type: "number" },
          {
            name: "Computed",
            columnName: "computed",
            type: "formula",
            property: {
              formula: "estimate * 2",
              displayType: "number",
            },
          },
        ],
      },
    })
    eidosFile.close()

    const sqlite = new Database(filePath)
    sqlite
      .prepare(
        `UPDATE ${EIDOS_FILE_COLUMNS_TABLE} SET type = 'unknown-type'
          WHERE table_column_name = 'estimate'`
      )
      .run()
    sqlite
      .prepare(
        `UPDATE ${EIDOS_FILE_COLUMNS_TABLE} SET property = ?
          WHERE table_column_name = 'computed'`
      )
      .run(
        JSON.stringify({
          formula: "randomblob(1000000000)",
          displayType: "number",
          expression: "estimate * 2",
        })
      )
    sqlite
      .prepare(`UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET hidden_fields = '{}'`)
      .run()
    sqlite.close()

    const inspection = inspectEidosFile(filePath)
    expect(inspection.valid).toBe(false)
    expect(inspection.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid-field-type",
        "invalid-formula-definition",
        "invalid-view-hidden-fields",
      ])
    )
    expectEidosFileError(() => openEidosFile(filePath), "not-eidos-file")
  })

  it("creates portable relations and hydrates linked record titles", () => {
    const filePath = path.join(root, "relations.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: { id: "projects", name: "Projects" },
    })
    eidosFile.createTable({ id: "people", name: "People" })
    const ada = eidosFile.insertRow("people", { title: "Ada Lovelace" })
    const grace = eidosFile.insertRow("people", { title: "Grace Hopper" })

    expect(
      eidosFile.addField("projects", {
        name: "Owners",
        columnName: "owners",
        type: "link",
        property: {
          targetTableId: "people",
          targetField: "title",
          multiple: true,
        },
      })
    ).toMatchObject({
      type: "link",
      storageCodec: "relation",
      valueKind: "relation",
    })
    eidosFile.importField("projects", {
      name: "Imported owner",
      columnName: "imported_owner",
      type: "link",
      property: {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      },
      storageCodec: "relation",
      valueKind: "relation",
    })

    const project = eidosFile.insertRow("projects", {
      title: "Compiler",
      owners: JSON.stringify([ada._id, grace._id]),
    })
    expect(project.owners).toBe(JSON.stringify([ada._id, grace._id]))
    expect(JSON.parse(String(project.owners__display))).toEqual([
      { id: ada._id, title: "Ada Lovelace" },
      { id: grace._id, title: "Grace Hopper" },
    ])
    expect(
      eidosFile.updateRow("projects", String(project._id), {
        imported_owner: JSON.stringify([ada._id]),
      }).imported_owner__display
    ).toBe(JSON.stringify([{ id: ada._id, title: "Ada Lovelace" }]))

    const updated = eidosFile.updateRow("projects", String(project._id), {
      owners: JSON.stringify([grace._id]),
    })
    expect(updated.owners).toBe(JSON.stringify([grace._id]))
    expect(JSON.parse(String(updated.owners__display))).toEqual([
      { id: grace._id, title: "Grace Hopper" },
    ])

    eidosFile.deleteRow("people", String(grace._id))
    expect(
      JSON.parse(String(eidosFile.listRows("projects")[0].owners__display))
    ).toEqual([{ id: grace._id, title: "Missing record" }])
    expectEidosFileError(
      () => eidosFile.deleteTable("people"),
      "relation-in-use"
    )
    eidosFile.close()
  })

  it("calculates chained formulas across edits, queries, and field lifecycle", () => {
    const filePath = path.join(root, "formulas.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "orders",
        name: "Orders",
        fields: [
          { name: "Unit price", columnName: "unit_price", type: "number" },
          { name: "Quantity", columnName: "quantity", type: "number" },
        ],
      },
    })
    expect(
      eidosFile.addField("orders", {
        name: "Total",
        columnName: "total",
        type: "formula",
        property: {
          formula: 'prop("Unit price") * quantity',
          displayType: "number",
        },
      })
    ).toMatchObject({
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["unit_price", "quantity"],
    })
    eidosFile.addField("orders", {
      name: "With tax",
      columnName: "with_tax",
      type: "formula",
      property: { formula: "total * 1.2", displayType: "number" },
    })

    const first = eidosFile.insertRow("orders", {
      title: "Keyboard",
      unit_price: 50,
      quantity: 2,
    })
    const second = eidosFile.insertRow("orders", {
      title: "Mouse",
      unit_price: 25,
      quantity: 1,
    })
    expect(first).toMatchObject({ total: 100, with_tax: 120 })
    expect(second).toMatchObject({ total: 25, with_tax: 30 })
    const preview = eidosFile.previewFormula("orders", {
      name: "Total",
      columnName: "total",
      formula: "unit_price * quantity * 3",
      displayType: "number",
    })
    expect(preview.expression).toContain("unit_price * quantity")
    expect(preview).toMatchObject({
      dependencies: [
        { name: "Unit price", columnName: "unit_price" },
        { name: "Quantity", columnName: "quantity" },
      ],
      samples: [
        { rowId: String(first._id), title: "Keyboard", value: 300 },
        { rowId: String(second._id), title: "Mouse", value: 75 },
      ],
    })
    expect(
      eidosFile.previewFormula("orders", {
        name: "Quantity plus one",
        columnName: "quantity_plus_one",
        formula: "quantity + 1",
        displayType: "number",
      }).samples
    ).toEqual([
      { rowId: String(first._id), title: "Keyboard", value: 3 },
      { rowId: String(second._id), title: "Mouse", value: 2 },
    ])
    expect(
      eidosFile
        .listFields("orders")
        .find((field) => field.tableColumnName === "total")?.property?.formula
    ).toBe('prop("Unit price") * quantity')
    expect(
      eidosFile
        .listFields("orders")
        .some((field) => field.tableColumnName === "quantity_plus_one")
    ).toBe(false)
    expectEidosFileError(
      () =>
        eidosFile.previewFormula("orders", {
          name: "Total",
          columnName: "total",
          formula: "with_tax",
          displayType: "number",
        }),
      "invalid-schema"
    )
    expect(
      eidosFile
        .getRowPage("orders", 0, 20, {
          filter: {
            type: "group",
            conjunction: "and",
            children: [
              {
                type: "rule",
                field: "total",
                operator: "greater-than",
                value: 50,
              },
            ],
          },
          sorts: [{ field: "with_tax", direction: "desc" }],
        })
        .rows.map((row) => row.title)
    ).toEqual(["Keyboard"])

    expect(
      eidosFile.updateRow("orders", String(first._id), { quantity: 3 })
    ).toMatchObject({ total: 150, with_tax: 180 })
    expect(
      eidosFile.updateField("orders", "total", {
        property: {
          formula: "unit_price * quantity * 2",
          displayType: "number",
        },
      })
    ).toMatchObject({ dependsOn: ["unit_price", "quantity"] })
    expect(eidosFile.listRows("orders")[0]).toMatchObject({
      total: 300,
      with_tax: 360,
    })

    expectEidosFileError(
      () =>
        eidosFile.updateField("orders", "total", {
          property: { formula: "with_tax", displayType: "number" },
        }),
      "invalid-schema"
    )
    expectEidosFileError(
      () => eidosFile.deleteField("orders", "unit_price"),
      "formula-in-use"
    )
    expect(eidosFile.deleteField("orders", "with_tax")).toBe(true)
    expect(eidosFile.deleteField("orders", "total")).toBe(true)
    expect(eidosFile.deleteField("orders", "unit_price")).toBe(true)
    eidosFile.close()
  })

  it("only evaluates derived fields required by count predicates and groups", () => {
    const filePath = path.join(root, "count-source.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "records",
        name: "Records",
        fields: [
          { name: "Status", columnName: "status", type: "select" },
          { name: "Points", columnName: "points", type: "number" },
        ],
      },
    })
    eidosFile.addField("records", {
      name: "Total",
      columnName: "total",
      type: "formula",
      property: { formula: "points * 2", displayType: "number" },
    })
    eidosFile.addField("records", {
      name: "Score",
      columnName: "score",
      type: "formula",
      property: { formula: "total + 1", displayType: "number" },
    })
    eidosFile.insertRow("records", {
      title: "First",
      status: "todo",
      points: 2,
    })
    eidosFile.insertRow("records", {
      title: "Second",
      status: "done",
      points: 4,
    })

    const get = vi.spyOn(eidosFile.connection, "get")
    const query = vi.spyOn(eidosFile.connection, "query")
    expect(eidosFile.countRows("records")).toBe(2)
    expect(get.mock.calls.at(-1)?.[0]).not.toContain("formula_layer")

    expect(
      eidosFile.countRows("records", {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "status",
              operator: "equals",
              value: "todo",
            },
          ],
        },
      })
    ).toBe(1)
    expect(get.mock.calls.at(-1)?.[0]).not.toContain("formula_layer")

    expect(eidosFile.countRowsByField("records", "status")).toEqual(
      expect.arrayContaining([
        { value: "todo", total: 1 },
        { value: "done", total: 1 },
      ])
    )
    expect(query.mock.calls.at(-1)?.[0]).not.toContain("formula_layer")

    expect(
      eidosFile.countRows("records", {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "total",
              operator: "greater-than",
              value: 3,
            },
          ],
        },
      })
    ).toBe(2)
    const totalCountSql = String(get.mock.calls.at(-1)?.[0])
    expect(totalCountSql).toContain('AS "total"')
    expect(totalCountSql).not.toContain('AS "score"')

    expect(
      eidosFile.countRows("records", {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "score",
              operator: "greater-than",
              value: 4,
            },
          ],
        },
      })
    ).toBe(2)
    const scoreCountSql = String(get.mock.calls.at(-1)?.[0])
    expect(scoreCountSql).toContain('AS "total"')
    expect(scoreCountSql).toContain('AS "score"')
    eidosFile.close()
  })

  it("reuses compiled formulas until the table schema changes", () => {
    const filePath = path.join(root, "formula-cache.eidos")
    const created = createEidosFile(filePath, {
      defaultTable: {
        id: "records",
        name: "Records",
        fields: [{ name: "Points", columnName: "points", type: "number" }],
      },
    })
    created.addField("records", {
      name: "Total",
      columnName: "total",
      type: "formula",
      property: { formula: "points * 2", displayType: "number" },
    })
    created.insertRow("records", { title: "First", points: 2 })
    created.close()

    const eidosFile = openEidosFile(filePath)
    const compile = vi.spyOn(formulaCompiler, "compileEidosFileFormulaFields")
    try {
      expect(eidosFile.getRowPage("records", 0, 100).rows[0]).toMatchObject({
        total: 4,
      })
      expect(eidosFile.getRowPage("records", 0, 100).rows[0]).toMatchObject({
        total: 4,
      })
      expect(compile).toHaveBeenCalledTimes(1)

      eidosFile.updateField("records", "total", {
        property: { formula: "points * 3", displayType: "number" },
      })
      compile.mockClear()
      expect(eidosFile.getRowPage("records", 0, 100).rows[0]).toMatchObject({
        total: 6,
      })
      expect(eidosFile.getRowPage("records", 0, 100).rows[0]).toMatchObject({
        total: 6,
      })
      expect(compile).toHaveBeenCalledTimes(1)
    } finally {
      eidosFile.close()
      compile.mockRestore()
    }
  })

  it("derives lookup and rollup values through relations without materializing them", () => {
    const filePath = path.join(root, "lookups.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: { id: "projects", name: "Projects" },
    })
    eidosFile.createTable({
      id: "people",
      name: "People",
      fields: [
        { name: "Rate", columnName: "rate", type: "number" },
        {
          name: "Skills",
          columnName: "skills",
          type: "multi-select",
          property: {
            options: [
              { value: "Math" },
              { value: "Logic" },
              { value: "Compilers" },
            ],
          },
        },
      ],
    })
    const ada = eidosFile.insertRow("people", {
      title: "Ada Lovelace",
      rate: 100,
      skills: '["Math","Logic"]',
    })
    const grace = eidosFile.insertRow("people", {
      title: "Grace Hopper",
      rate: 150,
      skills: '["Compilers","Logic"]',
    })
    eidosFile.addField("projects", {
      name: "Owners",
      columnName: "owners",
      type: "link",
      property: {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      },
    })
    eidosFile.addField("projects", {
      name: "Owner names",
      columnName: "owner_names",
      type: "lookup",
      property: {
        relationField: "owners",
        targetField: "title",
        aggregate: "values",
        displayType: "text",
      },
    })
    eidosFile.addField("projects", {
      name: "Owner skills",
      columnName: "owner_skills",
      type: "lookup",
      property: {
        relationField: "owners",
        targetField: "skills",
        aggregate: "values",
        displayType: "text",
      },
    })
    eidosFile.addField("projects", {
      name: "Owner skill count",
      columnName: "owner_skill_count",
      type: "lookup",
      property: {
        relationField: "owners",
        targetField: "skills",
        aggregate: "count",
        displayType: "number",
      },
    })
    eidosFile.addField("projects", {
      name: "First owner skill",
      columnName: "first_owner_skill",
      type: "lookup",
      property: {
        relationField: "owners",
        targetField: "skills",
        aggregate: "first",
        displayType: "text",
      },
    })
    expectEidosFileError(
      () =>
        eidosFile.addField("projects", {
          name: "Invalid skill sum",
          columnName: "invalid_skill_sum",
          type: "lookup",
          property: {
            relationField: "owners",
            targetField: "skills",
            aggregate: "sum",
            displayType: "number",
          },
        }),
      "invalid-schema"
    )
    eidosFile.addField("projects", {
      name: "Owner count",
      columnName: "owner_count",
      type: "lookup",
      property: {
        relationField: "owners",
        targetField: "title",
        aggregate: "count",
        displayType: "number",
      },
    })
    eidosFile.addField("projects", {
      name: "Owner rate",
      columnName: "owner_rate",
      type: "lookup",
      property: {
        relationField: "owners",
        targetField: "rate",
        aggregate: "sum",
        displayType: "number",
      },
    })
    eidosFile.addField("projects", {
      name: "Budget",
      columnName: "budget",
      type: "formula",
      property: { formula: "owner_rate * 2", displayType: "number" },
    })

    const project = eidosFile.insertRow("projects", {
      title: "Compiler",
      owners: JSON.stringify([ada._id, grace._id]),
    })
    expect(project).toMatchObject({
      owner_names: '["Ada Lovelace","Grace Hopper"]',
      owner_skills: '["Math","Logic","Compilers","Logic"]',
      owner_skill_count: 4,
      first_owner_skill: "Math",
      owner_count: 2,
      owner_rate: 250,
      budget: 500,
    })
    const runtimeProject = eidosFile.insertRow("projects", {
      title: "Runtime",
      owners: JSON.stringify([grace._id]),
    })
    eidosFile.createTable({ id: "portfolios", name: "Portfolios" })
    eidosFile.addField("portfolios", {
      name: "Projects",
      columnName: "projects",
      type: "link",
      property: {
        targetTableId: "projects",
        targetField: "title",
        multiple: true,
      },
    })
    eidosFile.addField("portfolios", {
      name: "Skills",
      columnName: "skills",
      type: "lookup",
      property: {
        relationField: "projects",
        targetField: "owner_skills",
        aggregate: "values",
        displayType: "text",
      },
    })
    eidosFile.addField("portfolios", {
      name: "First skill",
      columnName: "first_skill",
      type: "lookup",
      property: {
        relationField: "projects",
        targetField: "owner_skills",
        aggregate: "first",
        displayType: "text",
      },
    })
    eidosFile.addField("portfolios", {
      name: "Skill count",
      columnName: "skill_count",
      type: "lookup",
      property: {
        relationField: "projects",
        targetField: "owner_skills",
        aggregate: "count",
        displayType: "number",
      },
    })
    eidosFile.addField("portfolios", {
      name: "Owner counts",
      columnName: "owner_counts",
      type: "lookup",
      property: {
        relationField: "projects",
        targetField: "owner_count",
        aggregate: "values",
        displayType: "number",
      },
    })
    eidosFile.addField("portfolios", {
      name: "Total owners",
      columnName: "total_owners",
      type: "lookup",
      property: {
        relationField: "projects",
        targetField: "owner_count",
        aggregate: "sum",
        displayType: "number",
      },
    })
    eidosFile.addField("portfolios", {
      name: "Total rate",
      columnName: "total_rate",
      type: "lookup",
      property: {
        relationField: "projects",
        targetField: "owner_rate",
        aggregate: "sum",
        displayType: "number",
      },
    })
    expect(
      eidosFile.insertRow("portfolios", {
        title: "Engineering",
        projects: JSON.stringify([runtimeProject._id, project._id]),
      })
    ).toMatchObject({
      skills: '["Compilers","Logic","Math","Logic","Compilers","Logic"]',
      first_skill: "Compilers",
      skill_count: 6,
      owner_counts: "[1,2]",
      total_owners: 3,
      total_rate: 400,
    })
    expect(
      eidosFile.getRowPage("projects", 0, 20, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "owner_count",
              operator: "greater-than",
              value: 1,
            },
          ],
        },
      }).total
    ).toBe(1)

    expect(
      eidosFile.updateRow("projects", String(project._id), {
        owners: JSON.stringify([grace._id]),
      })
    ).toMatchObject({
      owner_names: '["Grace Hopper"]',
      owner_skills: '["Compilers","Logic"]',
      owner_skill_count: 2,
      first_owner_skill: "Compilers",
      owner_count: 1,
      owner_rate: 150,
      budget: 300,
    })
    expect(
      eidosFile.updateField("projects", "owner_rate", {
        property: {
          relationField: "owners",
          targetField: "rate",
          aggregate: "average",
          displayType: "number",
        },
      })
    ).toMatchObject({ dependsOn: ["owners"] })
    expect(eidosFile.listRows("projects")[0]).toMatchObject({
      owner_rate: 150,
      budget: 300,
    })
    expectEidosFileError(
      () =>
        eidosFile.updateField("projects", "owner_count", {
          property: {
            relationField: "owners",
            targetField: "title",
            aggregate: "first",
            displayType: "text",
          },
        }),
      "invalid-schema"
    )
    expect(
      eidosFile
        .listFields("projects")
        .find((field) => field.tableColumnName === "owner_count")?.property
    ).toMatchObject({ aggregate: "count", displayType: "number" })

    expectEidosFileError(
      () => eidosFile.deleteField("projects", "owners"),
      "lookup-in-use"
    )
    expectEidosFileError(
      () => eidosFile.deleteField("people", "rate"),
      "lookup-in-use"
    )
    expect(eidosFile.deleteTable("portfolios")).toBe(true)
    expect(eidosFile.deleteField("projects", "budget")).toBe(true)
    expect(eidosFile.deleteField("projects", "owner_rate")).toBe(true)
    expect(eidosFile.deleteField("projects", "owner_count")).toBe(true)
    expect(eidosFile.deleteField("projects", "first_owner_skill")).toBe(true)
    expect(eidosFile.deleteField("projects", "owner_skill_count")).toBe(true)
    expect(eidosFile.deleteField("projects", "owner_skills")).toBe(true)
    expect(eidosFile.deleteField("projects", "owner_names")).toBe(true)
    expect(eidosFile.deleteField("projects", "owners")).toBe(true)
    expect(eidosFile.deleteTable("people")).toBe(true)
    eidosFile.close()
  })

  it("rejects circular dependencies across nested lookups", () => {
    const filePath = path.join(root, "lookup-cycles.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: { id: "alpha", name: "Alpha" },
    })
    eidosFile.createTable({ id: "beta", name: "Beta" })
    eidosFile.addField("alpha", {
      name: "Betas",
      columnName: "betas",
      type: "link",
      property: {
        targetTableId: "beta",
        targetField: "title",
        multiple: true,
      },
    })
    eidosFile.addField("beta", {
      name: "Alphas",
      columnName: "alphas",
      type: "link",
      property: {
        targetTableId: "alpha",
        targetField: "title",
        multiple: true,
      },
    })
    eidosFile.addField("beta", {
      name: "Alpha values",
      columnName: "alpha_values",
      type: "lookup",
      property: {
        relationField: "alphas",
        targetField: "title",
        aggregate: "values",
        displayType: "text",
      },
    })
    eidosFile.addField("alpha", {
      name: "Beta values",
      columnName: "beta_values",
      type: "lookup",
      property: {
        relationField: "betas",
        targetField: "alpha_values",
        aggregate: "values",
        displayType: "text",
      },
    })

    expectEidosFileError(
      () =>
        eidosFile.updateField("beta", "alpha_values", {
          property: {
            relationField: "alphas",
            targetField: "beta_values",
            aggregate: "values",
            displayType: "text",
          },
        }),
      "invalid-schema"
    )
    expect(
      eidosFile
        .listFields("beta")
        .find((field) => field.tableColumnName === "alpha_values")?.property
    ).toMatchObject({ targetField: "title" })
    eidosFile.close()
  })

  it("persists the complete Grid view lifecycle independently per view", () => {
    const filePath = path.join(root, "views.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [{ name: "Priority", columnName: "priority", type: "number" }],
      },
    })
    const original = eidosFile.listViews("tasks")[0]
    eidosFile.updateView(original.id, {
      name: "All tasks",
      properties: {
        fieldWidthMap: { title: 280 },
        visibleSystemFields: ["_created_time"],
      },
      hiddenFields: ["priority"],
    })
    const priority = eidosFile.createView("tasks", {
      name: "By priority",
      type: "grid",
      sorts: [{ field: "priority", direction: "desc" }],
      orderMap: { priority: 0, title: 1 },
    })
    const duplicate = eidosFile.duplicateView(priority.id)

    expect(duplicate).toMatchObject({
      name: "By priority copy",
      type: "grid",
      sorts: [{ field: "priority", direction: "desc" }],
      orderMap: { priority: 0, title: 1 },
    })
    expect(
      eidosFile.updateView(duplicate.id, {
        name: "Focus",
        type: "gallery",
        properties: { cardSize: "large" },
      })
    ).toMatchObject({
      name: "Focus",
      type: "gallery",
      properties: { cardSize: "large" },
    })
    expectEidosFileError(
      () => eidosFile.updateView(duplicate.id, { type: "  " }),
      "invalid-identifier"
    )
    expect(
      eidosFile.reorderViews("tasks", [duplicate.id, original.id, priority.id])
    ).toMatchObject([
      { id: duplicate.id, position: 1 },
      { id: original.id, position: 2 },
      { id: priority.id, position: 3 },
    ])
    expectEidosFileError(
      () => eidosFile.reorderViews("tasks", [original.id, priority.id]),
      "invalid-range"
    )
    expect(eidosFile.deleteView(priority.id)).toBe(true)
    expect(eidosFile.deleteView(duplicate.id)).toBe(true)
    expectEidosFileError(
      () => eidosFile.deleteView(original.id),
      "protected-view"
    )
    eidosFile.updateView(original.id, { type: "gallery" })
    eidosFile.close()

    const reopened = openEidosFile(filePath)
    expect(reopened.listViews("tasks")).toMatchObject([
      {
        id: original.id,
        name: "All tasks",
        type: "gallery",
        properties: {
          fieldWidthMap: { title: 280 },
          visibleSystemFields: ["_created_time"],
        },
        hiddenFields: ["priority"],
      },
    ])
    reopened.close()
  })

  it("creates a field and places it in a Grid view atomically", () => {
    const filePath = path.join(root, "field-placement.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [{ name: "Status", columnName: "status", type: "text" }],
      },
    })
    const view = eidosFile.listViews("tasks")[0]
    eidosFile.updateView(view.id, { orderMap: { status: 0, title: 1 } })

    eidosFile.addField(
      "tasks",
      { name: "Priority", columnName: "priority", type: "number" },
      { viewId: view.id, index: 1 }
    )

    expect(eidosFile.listViews("tasks")[0].orderMap).toEqual({
      status: 0,
      priority: 1,
      title: 2,
    })
    expectEidosFileError(
      () =>
        eidosFile.addField(
          "tasks",
          { name: "Owner", columnName: "owner", type: "text" },
          { viewId: "missing", index: 1 }
        ),
      "view-not-found"
    )
    expect(
      eidosFile
        .listFields("tasks")
        .some((field) => field.tableColumnName === "owner")
    ).toBe(false)
    eidosFile.close()
  })

  it("converts mutable field types and values transactionally", () => {
    const filePath = path.join(root, "field-conversion.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          { name: "Score", columnName: "score", type: "text" },
          { name: "Status", columnName: "status", type: "text" },
          { name: "Files", columnName: "files", type: "file" },
          {
            name: "Summary",
            columnName: "summary",
            type: "formula",
            property: { formula: "title", displayType: "text" },
          },
        ],
      },
    })
    eidosFile.insertRow("tasks", {
      title: "First",
      score: "12.5",
      status: "Doing",
      files: '["assets/spec.pdf","assets/cover.png"]',
    })
    eidosFile.insertRow("tasks", {
      title: "Second",
      score: "invalid",
      status: "Done",
      files: null,
    })

    expect(
      eidosFile.updateField("tasks", "score", { type: "number" })
    ).toMatchObject({
      type: "number",
      storageCodec: "scalar",
      property: { format: "number", showAs: "number" },
    })
    expect(eidosFile.listRows("tasks").map((row) => row.score)).toEqual([
      12.5,
      null,
    ])

    const status = eidosFile.updateField("tasks", "status", { type: "select" })
    const options = status.property?.options as Array<{ value: string }>
    expect(options.map((option) => option.value)).toEqual(["Doing", "Done"])
    expect(eidosFile.listRows("tasks").map((row) => row.status)).toEqual([
      "Doing",
      "Done",
    ])
    expect(
      eidosFile.updateField("tasks", "status", { type: "multi-select" })
    ).toMatchObject({ type: "multi-select", storageCodec: "json_array" })
    eidosFile.updateField("tasks", "status", {
      property: { options: [options[1]] },
    })
    expect(eidosFile.listRows("tasks").map((row) => row.status)).toEqual([
      null,
      '["Done"]',
    ])
    eidosFile.updateField("tasks", "status", {
      property: { options: [{ value: "Complete" }] },
      optionValueChanges: [{ from: "Done", to: "Complete" }],
    })
    expect(eidosFile.listRows("tasks").map((row) => row.status)).toEqual([
      null,
      '["Complete"]',
    ])
    eidosFile.updateField("tasks", "status", { name: "Workflow" })
    expect(eidosFile.listRows("tasks").map((row) => row.status)).toEqual([
      null,
      '["Complete"]',
    ])

    expect(
      eidosFile.updateField("tasks", "files", { type: "text" })
    ).toMatchObject({
      type: "text",
      storageCodec: "scalar",
    })
    expect(eidosFile.listRows("tasks").map((row) => row.files)).toEqual([
      "assets/spec.pdf, assets/cover.png",
      null,
    ])

    const conversionView = eidosFile.listViews("tasks")[0]
    eidosFile.updateView(conversionView.id, {
      properties: { columnStats: { score: { type: "sum" } } },
    })
    eidosFile.updateField("tasks", "score", { type: "text" })
    expect(eidosFile.listViews("tasks")[0].properties).toMatchObject({
      columnStats: {},
    })

    eidosFile.updateField("tasks", "summary", {
      property: { formula: "title", displayType: "number" },
    })
    eidosFile.updateView(conversionView.id, {
      properties: { columnStats: { summary: { type: "sum" } } },
    })
    eidosFile.updateField("tasks", "summary", {
      property: { formula: "title", displayType: "text" },
    })
    expect(eidosFile.listViews("tasks")[0].properties).toMatchObject({
      columnStats: {},
    })

    expectEidosFileError(
      () => eidosFile.updateField("tasks", "summary", { type: "text" }),
      "invalid-schema"
    )
    expect(
      eidosFile
        .listFields("tasks")
        .find((field) => field.tableColumnName === "summary")?.type
    ).toBe("formula")
    eidosFile.close()
  })

  it("renames and deletes Eidos File tables and fields transactionally", () => {
    const filePath = path.join(root, "structure.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          {
            name: "Status",
            columnName: "status",
            type: "select",
            property: { options: [{ value: "todo" }] },
          },
          { name: "Notes", columnName: "notes", type: "text" },
        ],
      },
    })
    eidosFile.createTable({ id: "people", name: "People" })

    expect(eidosFile.updateTable("people", { name: "Contacts" })).toMatchObject(
      {
        id: "people",
        name: "Contacts",
      }
    )
    expect(
      eidosFile.updateField("tasks", "status", {
        name: "State",
        property: { options: [{ value: "done" }] },
      })
    ).toMatchObject({
      name: "State",
      tableColumnName: "status",
      property: { options: [{ value: "done" }] },
    })

    const view = eidosFile.listViews("tasks")[0]
    eidosFile.updateView(view.id, {
      properties: {
        fieldWidthMap: { title: 240, status: 160 },
        columnStats: {
          title: { type: "count-values" },
          status: { type: "count-values" },
        },
      },
      orderMap: { title: 0, status: 1, notes: 2 },
      hiddenFields: ["status"],
    })
    expect(eidosFile.deleteField("tasks", "status")).toBe(true)
    expect(eidosFile.listFields("tasks")).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableColumnName: "status" }),
      ])
    )
    expect(eidosFile.listViews("tasks")[0]).toMatchObject({
      properties: {
        fieldWidthMap: { title: 240 },
        columnStats: { title: { type: "count-values" } },
      },
      orderMap: { title: 0, notes: 1 },
      hiddenFields: [],
    })
    expectEidosFileError(
      () => eidosFile.deleteField("tasks", "title"),
      "protected-field"
    )

    expect(eidosFile.deleteTable("tasks")).toBe(true)
    expect(eidosFile.listTables()).toMatchObject([
      { id: "people", name: "Contacts" },
    ])
    expect(eidosFile.info().defaultTableId).toBe("people")
    expectEidosFileError(() => eidosFile.getTable("tasks"), "table-not-found")
    expect(eidosFile.deleteTable("people")).toBe(true)
    expect(eidosFile.listTables()).toEqual([])
    expect(eidosFile.info().defaultTableId).toBeUndefined()
    eidosFile.close()
  })

  it("imports legacy field semantics, views, references, and historical rows", () => {
    const filePath = path.join(root, "imported.eidos")
    const eidosFile = createEidosFile(filePath, { title: "Imported Space" })
    eidosFile.createTable({
      id: "tasks",
      name: "Tasks",
      createDefaultView: false,
    })
    eidosFile.createTable({
      id: "people",
      name: "People",
      createDefaultView: false,
    })
    eidosFile.importField("tasks", {
      name: "Computed label",
      columnName: "computed_label",
      type: "formula",
      property: { formula: "upper(title)" },
      storageCodec: "materialized_text",
      valueKind: "materialized",
      isDerived: true,
      dependsOn: ["title"],
    })
    eidosFile.importField("tasks", {
      name: "Owner",
      columnName: "owner",
      type: "link",
      storageCodec: "relation",
      valueKind: "relation",
    })
    eidosFile.importField("people", {
      name: "Task lookup",
      columnName: "task_lookup",
      type: "lookup",
      valueKind: "materialized",
      isDerived: true,
      sourceTableColumnName: "owner",
    })
    eidosFile.importField("tasks", {
      name: "Task title",
      columnName: "title",
      type: "title",
      property: { migrated: true },
    })
    eidosFile.importField("tasks", {
      name: "Legacy row ID",
      columnName: "_id",
      type: "row-id",
      valueKind: "system",
      isHidden: true,
      property: { migrated: true },
    })
    eidosFile.createView("tasks", {
      id: "legacy_grid",
      name: "All tasks",
      type: "grid",
      query: "SELECT * FROM tb_tasks",
      orderMap: { title: 0, owner: 1, computed_label: 2 },
      hiddenFields: ["computed_label"],
    })
    eidosFile.createReference({
      selfTableId: "people",
      selfColumnName: "task_lookup",
      refTableId: "tasks",
      refColumnName: "title",
      linkTableId: "tasks",
      linkColumnName: "owner",
    })

    expect(
      eidosFile.insertImportedRow("tasks", {
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
    const connection = eidosFile.connection as BetterSqlite3EidosFileConnection
    const prepare = vi.spyOn(connection.database, "prepare")
    expect(
      eidosFile.insertImportedRows("tasks", [
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
    expect(eidosFile.countRows("tasks")).toBe(3)
    expect(eidosFile.listFields("tasks")).toEqual(
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
    expect(eidosFile.listViews("tasks")).toEqual([
      expect.objectContaining({
        id: "legacy_grid",
        orderMap: { title: 0, owner: 1, computed_label: 2 },
        hiddenFields: ["computed_label"],
      }),
    ])
    expect(
      eidosFile.connection.query(
        "SELECT self, ref, link FROM eidos__references"
      )
    ).toEqual([
      {
        self: "tb_people.task_lookup",
        ref: "tb_tasks.title",
        link: "tb_tasks.owner",
      },
    ])
    eidosFile.close()

    expect(inspectEidosFile(filePath)).toMatchObject({
      valid: true,
      errors: [],
    })
  })

  it("imports live derived fields without creating writable physical columns", () => {
    const filePath = path.join(root, "imported-derived.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: { id: "tasks", name: "Tasks" },
    })
    eidosFile.importField("tasks", {
      name: "Upper title",
      columnName: "upper_title",
      type: "formula",
      property: {
        formula: "upper(title)",
        expression: 'upper("title")',
        displayType: "text",
      },
      storageCodec: "scalar",
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["title"],
    })
    eidosFile.insertImportedRow("tasks", { _id: "task-1", title: "Ship" })

    expect(
      eidosFile.connection
        .query<{ name: string }>('PRAGMA table_xinfo("tb_tasks")')
        .map((column) => column.name)
    ).not.toContain("upper_title")
    expect(eidosFile.listRows("tasks")[0]).toMatchObject({
      title: "Ship",
      upper_title: "SHIP",
    })
    eidosFile.close()

    const reopened = openEidosFile(filePath)
    expect(
      reopened.updateRow("tasks", "task-1", { title: "Released" })
    ).toMatchObject({
      title: "Released",
      upper_title: "RELEASED",
    })
    expect(reopened.listRows("tasks")[0].upper_title).toBe("RELEASED")
    reopened.close()
    expect(inspectEidosFile(filePath)).toMatchObject({
      valid: true,
      errors: [],
    })
  })

  it("migrates compatible pre-v1 field metadata without core", () => {
    const filePath = path.join(root, "legacy.eidos")
    createEidosFile(filePath).close()

    const sqlite = new Database(filePath)
    sqlite.exec(`
      DROP TABLE ${EIDOS_FILE_COLUMNS_TABLE};
      CREATE TABLE ${EIDOS_FILE_COLUMNS_TABLE} (
        name TEXT,
        type TEXT,
        table_name TEXT,
        table_column_name TEXT,
        property TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(table_name, table_column_name)
      );
      DELETE FROM ${EIDOS_FILE_META_TABLE} WHERE key = 'schema_version';
    `)
    sqlite.close()

    const before = inspectEidosFile(filePath)
    expect(before.valid).toBe(true)
    expect(before.warnings).toContainEqual(
      expect.objectContaining({ code: "schema-migration-available" })
    )

    openEidosFile(filePath, { migrate: true }).close()

    const migrated = new Database(filePath, { readonly: true })
    const columnNames = migrated
      .prepare(`PRAGMA table_info(${EIDOS_FILE_COLUMNS_TABLE})`)
      .all()
      .map((column) => (column as { name: string }).name)
    const schemaVersion = migrated
      .prepare(
        `SELECT value FROM ${EIDOS_FILE_META_TABLE} WHERE key = 'schema_version'`
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
    expect(schemaVersion).toBe(String(EIDOS_FILE_SCHEMA_VERSION))
  })

  it("reports a registered table whose physical table is missing", () => {
    const filePath = path.join(root, "broken.eidos")
    createEidosFile(filePath, {
      defaultTable: { id: "tasks", name: "Tasks" },
    }).close()
    const sqlite = new Database(filePath)
    sqlite.exec("DROP TABLE tb_tasks")
    sqlite.close()

    expect(inspectEidosFile(filePath)).toMatchObject({
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
    const filePath = path.join(root, "query.eidos")
    const eidosFile = createEidosFile(filePath, {
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
            storageCodec: "json_array",
          },
        ],
      },
    })
    eidosFile.insertRow("tasks", {
      title: "Write release notes",
      priority: 2,
      status: "doing",
      labels: '["docs","urgent"]',
    })
    eidosFile.insertRow("tasks", {
      title: "Fix desktop build",
      priority: 3,
      status: "doing",
      labels: '["bug","urgent"]',
    })
    eidosFile.insertRow("tasks", {
      title: "Archive draft",
      priority: 1,
      status: "done",
      labels: '["docs"]',
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
    expect(eidosFile.getRowPage("tasks", 0, 100, query)).toMatchObject({
      total: 2,
      rows: [
        { title: "Fix desktop build", priority: 3 },
        { title: "Write release notes", priority: 2 },
      ],
    })
    expect(eidosFile.countRowsByField("tasks", "status")).toEqual(
      expect.arrayContaining([
        { value: "doing", total: 2 },
        { value: "done", total: 1 },
      ])
    )
    expect(
      eidosFile.countRowsByField("tasks", "status", { search: "release" })
    ).toEqual([{ value: "doing", total: 1 }])

    const view = eidosFile.listViews("tasks")[0]
    eidosFile.updateView(view.id, { filter, sorts: query.sorts })
    expect(eidosFile.listViews("tasks")[0]).toMatchObject({
      filter,
      sorts: query.sorts,
    })

    expect(
      eidosFile.deleteRowRanges(
        "tasks",
        [{ startIndex: 0, endIndex: 1 }],
        query
      )
    ).toBe(1)
    expect(eidosFile.listRows("tasks", 100, 0).map((row) => row.title)).toEqual(
      ["Write release notes", "Archive draft"]
    )
    eidosFile.close()

    const reopened = openEidosFile(filePath)
    expect(reopened.listViews("tasks")[0]).toMatchObject({
      filter,
      sorts: query.sorts,
    })
    reopened.close()
  })

  it("pages large tables and deletes selected rows without a snapshot cap", () => {
    const filePath = path.join(root, "large.eidos")
    createEidosFile(filePath, {
      defaultTable: {
        id: "records",
        name: "Records",
        fields: [{ name: "Priority", columnName: "priority", type: "number" }],
      },
    }).close()
    const sqlite = new Database(filePath)
    const insert = sqlite.prepare(
      "INSERT INTO tb_records (_id, title, priority) VALUES (?, ?, ?)"
    )
    sqlite.transaction(() => {
      for (let index = 0; index < 10_000; index += 1) {
        insert.run(
          `row_${index}`,
          `Row ${index}`,
          index % 11 === 0 ? null : index % 7
        )
      }
    })()
    sqlite.close()
    const eidosFile = openEidosFile(filePath)

    expect(eidosFile.countRows("records")).toBe(10_000)
    const get = vi.spyOn(eidosFile.connection, "get")
    const countQueryCalls = () =>
      get.mock.calls.filter(([sql]) => sql.includes("COUNT(*) AS count"))
    const lastPage = eidosFile.getRowPage("records", 9_975, 50)
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
    expect(countQueryCalls()).toHaveLength(1)

    const hintedPage = eidosFile.getRowPage("records", 5_000, 50, {}, 10_000)
    expect(hintedPage).toMatchObject({
      offset: 5_000,
      total: 10_000,
    })
    expect(hintedPage.rows).toHaveLength(50)
    expect(countQueryCalls()).toHaveLength(1)

    const firstCursorPage = eidosFile.getRowPage("records", 0, 50, {}, 10_000)
    expect(firstCursorPage.nextCursor).toBe("rowid:50")
    const query = vi.spyOn(eidosFile.connection, "query")
    const nextCursorPage = eidosFile.getRowPage(
      "records",
      50,
      50,
      {},
      10_000,
      firstCursorPage.nextCursor
    )
    expect(nextCursorPage.rows[0]).toMatchObject({
      _id: "row_50",
      title: "Row 50",
    })
    expect(nextCursorPage.nextCursor).toBe("rowid:100")
    const cursorQuery = query.mock.calls.find(([sql]) =>
      sql.includes('"__base_rowid" > ?')
    )
    expect(cursorQuery?.[0]).not.toContain("OFFSET")
    expect(cursorQuery?.[1]).toEqual([50, 50])

    const sortedQuery = {
      sorts: [
        { field: "priority", direction: "desc" as const },
        { field: "title", direction: "asc" as const },
      ],
    }
    const expectedSortedRows = eidosFile.listRows(
      "records",
      10_000,
      0,
      sortedQuery
    )
    const firstSortedPage = eidosFile.getRowPage(
      "records",
      0,
      500,
      sortedQuery,
      10_000
    )
    expect(firstSortedPage.nextCursor).toMatch(/^sort:/)
    const firstSortedCursor = firstSortedPage.nextCursor
    const sortedCursorQueryStart = query.mock.calls.length
    const cursorSortedRows = [...firstSortedPage.rows]
    let sortedCursor = firstSortedCursor
    for (let offset = 500; offset < 10_000; offset += 500) {
      const page = eidosFile.getRowPage(
        "records",
        offset,
        500,
        sortedQuery,
        10_000,
        sortedCursor
      )
      cursorSortedRows.push(...page.rows)
      sortedCursor = page.nextCursor
    }
    expect(cursorSortedRows).toEqual(expectedSortedRows)
    expect(sortedCursor).toMatch(/^sort:/)
    expect(
      query.mock.calls
        .slice(sortedCursorQueryStart)
        .filter(([sql]) => sql.includes("SELECT * FROM"))
        .every(([sql]) => !sql.includes("OFFSET"))
    ).toBe(true)
    expectEidosFileError(
      () =>
        eidosFile.getRowPage(
          "records",
          50,
          50,
          { sorts: [{ field: "title", direction: "asc" }] },
          10_000,
          firstSortedCursor
        ),
      "invalid-query"
    )

    expectEidosFileError(
      () => eidosFile.getRowPage("records", 50, 50, {}, 10_000, "invalid"),
      "invalid-query"
    )

    expect(
      eidosFile.deleteRowRanges("records", [
        { startIndex: 1, endIndex: 3 },
        { startIndex: 5_000, endIndex: 9_000 },
        { startIndex: 8_990, endIndex: 9_010 },
      ])
    ).toBe(4_012)
    expect(eidosFile.countRows("records")).toBe(5_988)
    expectEidosFileError(
      () =>
        eidosFile.deleteRowRanges("records", [{ startIndex: 4, endIndex: 4 }]),
      "invalid-range"
    )

    expect(
      eidosFile.deleteRows("records", ["row_3", "row_3", "row_9010", "missing"])
    ).toEqual(["row_3", "row_9010"])
    expect(eidosFile.countRows("records")).toBe(5_986)
    eidosFile.close()
  })

  it("projects card pages while preserving sorted cursors and full row reads", () => {
    const filePath = path.join(root, "projected-pages.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "records",
        name: "Records",
        fields: [
          { name: "Summary", columnName: "summary", type: "text" },
          { name: "Private notes", columnName: "notes", type: "text" },
          { name: "Priority", columnName: "priority", type: "number" },
        ],
      },
    })
    const inserted = eidosFile.insertRow("records", {
      title: "Release Eidos File",
      summary: "Visible on the card",
      notes: "Only load this in the inspector",
      priority: 3,
    })

    const page = eidosFile.getRowPage(
      "records",
      0,
      10,
      { sorts: [{ field: "priority", direction: "desc" }] },
      1,
      undefined,
      { columns: ["summary"] }
    )

    expect(page.nextCursor).toMatch(/^sort:/)
    expect(page.rows).toEqual([
      {
        _id: inserted._id,
        title: "Release Eidos File",
        summary: "Visible on the card",
      },
    ])
    expect(eidosFile.getRow("records", String(inserted._id))).toMatchObject({
      _id: inserted._id,
      title: "Release Eidos File",
      summary: "Visible on the card",
      notes: "Only load this in the inspector",
      priority: 3,
    })
    eidosFile.close()
  })

  it("bounds sparse projected fields and relation hydration per row", () => {
    const filePath = path.join(root, "bounded-projected-pages.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "projects",
        name: "Projects",
        fields: [
          { name: "Empty", columnName: "empty", type: "text" },
          { name: "Points", columnName: "points", type: "number" },
          { name: "Summary", columnName: "summary", type: "text" },
          { name: "Notes", columnName: "notes", type: "text" },
          { name: "Status", columnName: "status", type: "text" },
        ],
      },
    })
    eidosFile.createTable({ id: "people", name: "People" })
    const ada = eidosFile.insertRow("people", { title: "Ada Lovelace" })
    const grace = eidosFile.insertRow("people", { title: "Grace Hopper" })
    for (const columnName of ["owners", "reviewers"]) {
      eidosFile.addField("projects", {
        name: columnName,
        columnName,
        type: "link",
        property: {
          targetTableId: "people",
          targetField: "title",
          multiple: true,
        },
      })
    }
    const first = eidosFile.insertRow("projects", {
      title: "Compiler",
      empty: "",
      points: 0,
      summary: "Visible summary",
      notes: "Inspector only",
      status: "active",
      owners: JSON.stringify([ada._id]),
    })
    const second = eidosFile.insertRow("projects", {
      title: "Runtime",
      status: "planned",
      reviewers: JSON.stringify([grace._id]),
    })

    const page = eidosFile.getRowPage("projects", 0, 10, {}, 2, undefined, {
      columns: ["empty", "points", "summary", "notes", "owners", "reviewers"],
      preservedColumns: ["status"],
      fieldLimit: 3,
      omitEmptyFields: true,
    })

    expect(page.rows).toEqual([
      {
        _id: first._id,
        title: "Compiler",
        status: "active",
        points: 0,
        summary: "Visible summary",
        notes: "Inspector only",
      },
      {
        _id: second._id,
        title: "Runtime",
        status: "planned",
        reviewers: JSON.stringify([grace._id]),
        reviewers__display: JSON.stringify([
          { id: grace._id, title: "Grace Hopper" },
        ]),
      },
    ])
    expect(page.rows[0]).not.toHaveProperty("owners__display")
    expect(page.rows[1]).not.toHaveProperty("owners__display")
    eidosFile.close()
  })

  it("maintains query indexes for Gallery sorts and Kanban groups", () => {
    const filePath = path.join(root, "indexed-views.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "records",
        name: "Records",
        fields: [
          {
            name: "Status",
            columnName: "status",
            type: "select",
            property: {
              options: [{ value: "todo" }, { value: "done" }],
            },
          },
          { name: "Points", columnName: "points", type: "number" },
        ],
      },
    })
    const gallery = eidosFile.createView("records", {
      id: "view_gallery",
      name: "Gallery",
      type: "gallery",
      sorts: [{ field: "points", direction: "desc" }],
    })
    const kanban = eidosFile.createView("records", {
      id: "view_kanban",
      name: "Kanban",
      type: "kanban",
      properties: { groupByField: "status" },
    })
    const indexes = () =>
      eidosFile.connection.query<{ name: string; sql: string }>(
        `SELECT name, sql FROM sqlite_master
          WHERE type = 'index' AND name GLOB 'eidos__view_query_*'
          ORDER BY name`
      )

    expect(indexes()).toEqual([
      {
        name: "eidos__view_query_view_gallery",
        sql: 'CREATE INDEX "eidos__view_query_view_gallery" ON "tb_records" ("points" DESC)',
      },
      {
        name: "eidos__view_query_view_kanban",
        sql: 'CREATE INDEX "eidos__view_query_view_kanban" ON "tb_records" ("status")',
      },
    ])
    const galleryPlan = eidosFile.connection
      .query<{ detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT * FROM (
           SELECT rowid AS "__base_rowid", * FROM "tb_records"
         ) AS "base_rows"
         ORDER BY "points" DESC, "__base_rowid" ASC
         LIMIT ? OFFSET ?`,
        [100, 10_000]
      )
      .map((step) => step.detail)
      .join("\n")
    expect(galleryPlan).toContain("eidos__view_query_view_gallery")
    eidosFile.updateView(kanban.id, {
      sorts: [{ field: "points", direction: "asc" }],
    })
    expect(
      indexes().find((index) => index.name.endsWith("view_kanban"))?.sql
    ).toContain('("status", "points" ASC)')

    eidosFile.updateView(gallery.id, {
      sorts: [{ field: "title", direction: "asc" }],
    })
    expect(
      indexes().find((index) => index.name.endsWith("view_gallery"))?.sql
    ).toContain('("title" COLLATE NOCASE ASC)')

    eidosFile.updateView(gallery.id, {
      sorts: [{ field: "points", direction: "desc" }],
    })
    expect(eidosFile.deleteField("records", "points")).toBe(true)
    expect(indexes().map((index) => index.name)).toEqual([
      "eidos__view_query_view_kanban",
    ])
    eidosFile.updateView(gallery.id, {
      sorts: [{ field: "title", direction: "asc" }],
    })
    expect(eidosFile.deleteView(kanban.id)).toBe(true)
    expect(indexes().map((index) => index.name)).toEqual([
      "eidos__view_query_view_gallery",
    ])
    eidosFile.close()

    const sqlite = new Database(filePath)
    sqlite.exec('DROP INDEX "eidos__view_query_view_gallery"')
    sqlite.close()
    const unoptimized = openEidosFile(filePath)
    expect(
      unoptimized.connection.get(
        `SELECT 1 FROM sqlite_master
          WHERE type = 'index' AND name = 'eidos__view_query_view_gallery'`
      )
    ).toBeUndefined()
    unoptimized.close()
    const optimized = openEidosFile(filePath, { migrate: true })
    expect(
      optimized.connection.get(
        `SELECT 1 FROM sqlite_master
          WHERE type = 'index' AND name = 'eidos__view_query_view_gallery'`
      )
    ).toBeDefined()
    optimized.close()
  })

  it("calculates filtered column stats in one query and rejects invalid combinations", () => {
    const filePath = path.join(root, "stats.eidos")
    const eidosFile = createEidosFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [
          { name: "Points", columnName: "points", type: "number" },
          { name: "Done", columnName: "done", type: "checkbox" },
          { name: "Due", columnName: "due", type: "date" },
          { name: "Status", columnName: "status", type: "select" },
          {
            name: "Labels",
            columnName: "labels",
            type: "multi-select",
            storageCodec: "json_array",
          },
          { name: "Files", columnName: "files", type: "file" },
        ],
      },
    })
    eidosFile.insertRow("tasks", {
      title: "Ship Eidos File",
      points: 3,
      done: 1,
      due: "2026-07-10",
      status: "active",
      labels: '["docs","urgent"]',
      files: '["assets/spec.md","assets/cover.png"]',
    })
    eidosFile.insertRow("tasks", {
      title: "Write docs",
      points: 5,
      done: 0,
      due: "2026-07-14",
      status: "active",
      labels: '["docs"]',
      files: "[]",
    })
    eidosFile.insertRow("tasks", {
      title: "Archive draft",
      points: null,
      done: 0,
      due: null,
      status: "archived",
    })

    const get = vi.spyOn(eidosFile.connection, "get")
    expect(
      eidosFile.calculateColumnStats(
        "tasks",
        [
          { columnName: "points", type: "sum" },
          { columnName: "points", type: "average" },
          { columnName: "done", type: "percent-checked" },
          { columnName: "due", type: "range" },
          { columnName: "title", type: "count-values" },
          { columnName: "labels", type: "count-values" },
          { columnName: "files", type: "count-empty" },
        ],
        {
          filter: {
            type: "group",
            conjunction: "and",
            children: [
              {
                type: "rule",
                field: "status",
                operator: "equals",
                value: "active",
              },
            ],
          },
        }
      )
    ).toEqual([
      { columnName: "points", type: "sum", value: 8 },
      { columnName: "points", type: "average", value: 4 },
      { columnName: "done", type: "percent-checked", value: 50 },
      { columnName: "due", type: "range", value: 4 },
      { columnName: "title", type: "count-values", value: 2 },
      { columnName: "labels", type: "count-values", value: 3 },
      { columnName: "files", type: "count-empty", value: 1 },
    ])
    expect(
      get.mock.calls.filter(([sql]) => sql.includes("__base_stat_0"))
    ).toHaveLength(1)

    expectEidosFileError(
      () =>
        eidosFile.calculateColumnStats("tasks", [
          { columnName: "title", type: "sum" },
        ]),
      "invalid-query"
    )
    eidosFile.close()
  })
})
