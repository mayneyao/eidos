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
  BASE_VIEWS_TABLE,
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

    const second = base.insertRow("tasks", {
      title: "Document release",
      status: "todo",
    })
    expect(
      base.updateRows("tasks", [
        {
          rowId: String(inserted._id),
          changes: { title: "Ship Base", status: "todo" },
        },
        {
          rowId: String(second._id),
          changes: { title: "Publish docs", status: "done" },
        },
      ])
    ).toMatchObject([
      { title: "Ship Base", status: "todo" },
      { title: "Publish docs", status: "done" },
    ])

    expectBaseError(
      () =>
        base.updateRows("tasks", [
          {
            rowId: String(inserted._id),
            changes: { title: "Must roll back" },
          },
          { rowId: "missing-row", changes: { title: "Missing" } },
        ]),
      "row-not-found"
    )
    expect(base.listRows("tasks")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: inserted._id,
          title: "Ship Base",
        }),
      ])
    )
    base.connection.run(
      `UPDATE ${BASE_META_TABLE} SET value = ? WHERE key = 'updated_at'`,
      ["2000-01-01T00:00:00.000Z"]
    )
    const metadataBeforeMissingUpdate = base.info().updatedAt
    expectBaseError(
      () => base.updateRow("tasks", "missing-row", { status: "todo" }),
      "row-not-found"
    )
    expect(base.info().updatedAt).toBe(metadataBeforeMissingUpdate)
    expect(base.listRows("tasks")).toHaveLength(2)
    expect(base.deleteRow("tasks", String(inserted._id))).toBe(true)
    expect(base.deleteRow("tasks", String(second._id))).toBe(true)
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

  it("rejects malformed field, view, and formula metadata before opening", () => {
    const filePath = path.join(root, "untrusted.base")
    const base = createBaseFile(filePath, {
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
    base.close()

    const sqlite = new Database(filePath)
    sqlite
      .prepare(
        `UPDATE ${BASE_COLUMNS_TABLE} SET type = 'unknown-type'
          WHERE table_column_name = 'estimate'`
      )
      .run()
    sqlite
      .prepare(
        `UPDATE ${BASE_COLUMNS_TABLE} SET property = ?
          WHERE table_column_name = 'computed'`
      )
      .run(
        JSON.stringify({
          formula: "randomblob(1000000000)",
          displayType: "number",
          expression: "estimate * 2",
        })
      )
    sqlite.prepare(`UPDATE ${BASE_VIEWS_TABLE} SET hidden_fields = '{}'`).run()
    sqlite.close()

    const inspection = inspectBaseFile(filePath)
    expect(inspection.valid).toBe(false)
    expect(inspection.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid-field-type",
        "invalid-formula-definition",
        "invalid-view-hidden-fields",
      ])
    )
    expectBaseError(() => openBaseFile(filePath), "not-base")
  })

  it("creates portable relations and hydrates linked record titles", () => {
    const filePath = path.join(root, "relations.base")
    const base = createBaseFile(filePath, {
      defaultTable: { id: "projects", name: "Projects" },
    })
    base.createTable({ id: "people", name: "People" })
    const ada = base.insertRow("people", { title: "Ada Lovelace" })
    const grace = base.insertRow("people", { title: "Grace Hopper" })

    expect(
      base.addField("projects", {
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
    base.importField("projects", {
      name: "Legacy owner",
      columnName: "legacy_owner",
      type: "link",
      property: {
        linkTableName: "tb_people",
        linkColumnName: "title",
      },
      storageCodec: "relation",
      valueKind: "relation",
    })

    const project = base.insertRow("projects", {
      title: "Compiler",
      owners: `${ada._id},${grace._id}`,
    })
    expect(project.owners).toBe(JSON.stringify([ada._id, grace._id]))
    expect(JSON.parse(String(project.owners__display))).toEqual([
      { id: ada._id, title: "Ada Lovelace" },
      { id: grace._id, title: "Grace Hopper" },
    ])
    expect(
      base.updateRow("projects", String(project._id), {
        legacy_owner: String(ada._id),
      }).legacy_owner__display
    ).toBe(JSON.stringify([{ id: ada._id, title: "Ada Lovelace" }]))

    const updated = base.updateRow("projects", String(project._id), {
      owners: JSON.stringify([grace._id]),
    })
    expect(updated.owners).toBe(JSON.stringify([grace._id]))
    expect(JSON.parse(String(updated.owners__display))).toEqual([
      { id: grace._id, title: "Grace Hopper" },
    ])

    base.deleteRow("people", String(grace._id))
    expect(
      JSON.parse(String(base.listRows("projects")[0].owners__display))
    ).toEqual([{ id: grace._id, title: "Missing record" }])
    expectBaseError(() => base.deleteTable("people"), "relation-in-use")
    base.close()
  })

  it("calculates chained formulas across edits, queries, and field lifecycle", () => {
    const filePath = path.join(root, "formulas.base")
    const base = createBaseFile(filePath, {
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
      base.addField("orders", {
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
    base.addField("orders", {
      name: "With tax",
      columnName: "with_tax",
      type: "formula",
      property: { formula: "total * 1.2", displayType: "number" },
    })

    const first = base.insertRow("orders", {
      title: "Keyboard",
      unit_price: 50,
      quantity: 2,
    })
    const second = base.insertRow("orders", {
      title: "Mouse",
      unit_price: 25,
      quantity: 1,
    })
    expect(first).toMatchObject({ total: 100, with_tax: 120 })
    expect(second).toMatchObject({ total: 25, with_tax: 30 })
    const preview = base.previewFormula("orders", {
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
      base.previewFormula("orders", {
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
      base
        .listFields("orders")
        .find((field) => field.tableColumnName === "total")?.property?.formula
    ).toBe('prop("Unit price") * quantity')
    expect(
      base
        .listFields("orders")
        .some((field) => field.tableColumnName === "quantity_plus_one")
    ).toBe(false)
    expectBaseError(
      () =>
        base.previewFormula("orders", {
          name: "Total",
          columnName: "total",
          formula: "with_tax",
          displayType: "number",
        }),
      "invalid-schema"
    )
    expect(
      base
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
      base.updateRow("orders", String(first._id), { quantity: 3 })
    ).toMatchObject({ total: 150, with_tax: 180 })
    expect(
      base.updateField("orders", "total", {
        property: {
          formula: "unit_price * quantity * 2",
          displayType: "number",
        },
      })
    ).toMatchObject({ dependsOn: ["unit_price", "quantity"] })
    expect(base.listRows("orders")[0]).toMatchObject({
      total: 300,
      with_tax: 360,
    })

    expectBaseError(
      () =>
        base.updateField("orders", "total", {
          property: { formula: "with_tax", displayType: "number" },
        }),
      "invalid-schema"
    )
    expectBaseError(
      () => base.deleteField("orders", "unit_price"),
      "formula-in-use"
    )
    expect(base.deleteField("orders", "with_tax")).toBe(true)
    expect(base.deleteField("orders", "total")).toBe(true)
    expect(base.deleteField("orders", "unit_price")).toBe(true)
    base.close()
  })

  it("derives lookup and rollup values through relations without materializing them", () => {
    const filePath = path.join(root, "lookups.base")
    const base = createBaseFile(filePath, {
      defaultTable: { id: "projects", name: "Projects" },
    })
    base.createTable({
      id: "people",
      name: "People",
      fields: [{ name: "Rate", columnName: "rate", type: "number" }],
    })
    const ada = base.insertRow("people", {
      title: "Ada Lovelace",
      rate: 100,
    })
    const grace = base.insertRow("people", {
      title: "Grace Hopper",
      rate: 150,
    })
    base.addField("projects", {
      name: "Owners",
      columnName: "owners",
      type: "link",
      property: {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      },
    })
    base.addField("projects", {
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
    base.addField("projects", {
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
    base.addField("projects", {
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
    base.addField("projects", {
      name: "Budget",
      columnName: "budget",
      type: "formula",
      property: { formula: "owner_rate * 2", displayType: "number" },
    })

    const project = base.insertRow("projects", {
      title: "Compiler",
      owners: JSON.stringify([ada._id, grace._id]),
    })
    expect(project).toMatchObject({
      owner_names: "Ada Lovelace, Grace Hopper",
      owner_count: 2,
      owner_rate: 250,
      budget: 500,
    })
    expect(
      base.getRowPage("projects", 0, 20, {
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
      base.updateRow("projects", String(project._id), {
        owners: JSON.stringify([grace._id]),
      })
    ).toMatchObject({
      owner_names: "Grace Hopper",
      owner_count: 1,
      owner_rate: 150,
      budget: 300,
    })
    expect(
      base.updateField("projects", "owner_rate", {
        property: {
          relationField: "owners",
          targetField: "rate",
          aggregate: "average",
          displayType: "number",
        },
      })
    ).toMatchObject({ dependsOn: ["owners"] })
    expect(base.listRows("projects")[0]).toMatchObject({
      owner_rate: 150,
      budget: 300,
    })

    expectBaseError(
      () => base.deleteField("projects", "owners"),
      "lookup-in-use"
    )
    expectBaseError(() => base.deleteField("people", "rate"), "lookup-in-use")
    expect(base.deleteField("projects", "budget")).toBe(true)
    expect(base.deleteField("projects", "owner_rate")).toBe(true)
    expect(base.deleteField("projects", "owner_count")).toBe(true)
    expect(base.deleteField("projects", "owner_names")).toBe(true)
    expect(base.deleteField("projects", "owners")).toBe(true)
    expect(base.deleteTable("people")).toBe(true)
    base.close()
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

  it("creates a field and places it in a Grid view atomically", () => {
    const filePath = path.join(root, "field-placement.base")
    const base = createBaseFile(filePath, {
      defaultTable: {
        id: "tasks",
        name: "Tasks",
        fields: [{ name: "Status", columnName: "status", type: "text" }],
      },
    })
    const view = base.listViews("tasks")[0]
    base.updateView(view.id, { orderMap: { status: 0, title: 1 } })

    base.addField(
      "tasks",
      { name: "Priority", columnName: "priority", type: "number" },
      { viewId: view.id, index: 1 }
    )

    expect(base.listViews("tasks")[0].orderMap).toEqual({
      status: 0,
      priority: 1,
      title: 2,
    })
    expectBaseError(
      () =>
        base.addField(
          "tasks",
          { name: "Owner", columnName: "owner", type: "text" },
          { viewId: "missing", index: 1 }
        ),
      "view-not-found"
    )
    expect(
      base
        .listFields("tasks")
        .some((field) => field.tableColumnName === "owner")
    ).toBe(false)
    base.close()
  })

  it("converts mutable field types and values transactionally", () => {
    const filePath = path.join(root, "field-conversion.base")
    const base = createBaseFile(filePath, {
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
    base.insertRow("tasks", {
      title: "First",
      score: "12.5",
      status: "Doing",
      files: '["assets/spec.pdf","assets/cover.png"]',
    })
    base.insertRow("tasks", {
      title: "Second",
      score: "invalid",
      status: "Done",
      files: null,
    })

    expect(
      base.updateField("tasks", "score", { type: "number" })
    ).toMatchObject({
      type: "number",
      storageCodec: "scalar",
      property: { format: "number", showAs: "number" },
    })
    expect(base.listRows("tasks").map((row) => row.score)).toEqual([12.5, null])

    const status = base.updateField("tasks", "status", { type: "select" })
    const options = status.property?.options as Array<{
      id: string
      name: string
    }>
    expect(options.map((option) => option.name)).toEqual(["Doing", "Done"])
    expect(base.listRows("tasks").map((row) => row.status)).toEqual(
      options.map((option) => option.id)
    )
    expect(
      base.updateField("tasks", "status", { type: "multi-select" })
    ).toMatchObject({ type: "multi-select", storageCodec: "csv_ids" })
    base.updateField("tasks", "status", {
      property: { options: [options[1]] },
    })
    expect(base.listRows("tasks").map((row) => row.status)).toEqual([
      null,
      options[1].id,
    ])

    expect(base.updateField("tasks", "files", { type: "text" })).toMatchObject({
      type: "text",
      storageCodec: "scalar",
    })
    expect(base.listRows("tasks").map((row) => row.files)).toEqual([
      "assets/spec.pdf, assets/cover.png",
      null,
    ])

    const conversionView = base.listViews("tasks")[0]
    base.updateView(conversionView.id, {
      properties: { columnStats: { score: { type: "sum" } } },
    })
    base.updateField("tasks", "score", { type: "text" })
    expect(base.listViews("tasks")[0].properties).toMatchObject({
      columnStats: {},
    })

    base.updateField("tasks", "summary", {
      property: { formula: "title", displayType: "number" },
    })
    base.updateView(conversionView.id, {
      properties: { columnStats: { summary: { type: "sum" } } },
    })
    base.updateField("tasks", "summary", {
      property: { formula: "title", displayType: "text" },
    })
    expect(base.listViews("tasks")[0].properties).toMatchObject({
      columnStats: {},
    })

    expectBaseError(
      () => base.updateField("tasks", "summary", { type: "text" }),
      "invalid-schema"
    )
    expect(
      base
        .listFields("tasks")
        .find((field) => field.tableColumnName === "summary")?.type
    ).toBe("formula")
    base.close()
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
    expect(base.deleteField("tasks", "status")).toBe(true)
    expect(base.listFields("tasks")).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableColumnName: "status" }),
      ])
    )
    expect(base.listViews("tasks")[0]).toMatchObject({
      properties: {
        fieldWidthMap: { title: 240 },
        columnStats: { title: { type: "count-values" } },
      },
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
    expect(base.countRowsByField("tasks", "status")).toEqual(
      expect.arrayContaining([
        { value: "doing", total: 2 },
        { value: "done", total: 1 },
      ])
    )
    expect(
      base.countRowsByField("tasks", "status", { search: "release" })
    ).toEqual([{ value: "doing", total: 1 }])

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
    const get = vi.spyOn(base.connection, "get")
    const countQueryCalls = () =>
      get.mock.calls.filter(([sql]) => sql.includes("COUNT(*) AS count"))
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
    expect(countQueryCalls()).toHaveLength(1)

    const hintedPage = base.getRowPage("records", 5_000, 50, {}, 10_000)
    expect(hintedPage).toMatchObject({
      offset: 5_000,
      total: 10_000,
    })
    expect(hintedPage.rows).toHaveLength(50)
    expect(countQueryCalls()).toHaveLength(1)

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

  it("calculates filtered column stats in one query and rejects invalid combinations", () => {
    const filePath = path.join(root, "stats.base")
    const base = createBaseFile(filePath, {
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
            storageCodec: "csv_ids",
          },
          { name: "Files", columnName: "files", type: "file" },
        ],
      },
    })
    base.insertRow("tasks", {
      title: "Ship Base",
      points: 3,
      done: 1,
      due: "2026-07-10",
      status: "active",
      labels: "docs,urgent",
      files: '["assets/spec.md","assets/cover.png"]',
    })
    base.insertRow("tasks", {
      title: "Write docs",
      points: 5,
      done: 0,
      due: "2026-07-14",
      status: "active",
      labels: "docs",
      files: "[]",
    })
    base.insertRow("tasks", {
      title: "Archive draft",
      points: null,
      done: 0,
      due: null,
      status: "archived",
    })

    const get = vi.spyOn(base.connection, "get")
    expect(
      base.calculateColumnStats(
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

    expectBaseError(
      () =>
        base.calculateColumnStats("tasks", [
          { columnName: "title", type: "sum" },
        ]),
      "invalid-query"
    )
    base.close()
  })
})
