import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BetterSqlite3ConnectionPort,
  createEidosFile,
  type BetterSqlite3ConnectionPortOptions,
} from "./better-sqlite3"
import type {
  RequestContext,
  RuntimeClient,
  RuntimeEnvironment,
  SchemaChange,
} from "./runtime-contract"
import { Runtime } from "./runtime-service"

const context = (requestId: string): RequestContext => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

function environment(): RuntimeEnvironment {
  let monotonic = 0
  let entropy = 0
  return {
    clock: {
      nowInstant: () => "2026-07-26T00:00:00.000Z",
      nowMilliseconds: () => ++monotonic,
    },
    entropy: {
      randomBytes(length) {
        const bytes = new Uint8Array(length)
        for (let index = 0; index < length; index += 1) {
          bytes[index] = entropy++ & 0xff
        }
        return bytes
      },
    },
  }
}

async function createRuntime(
  title = "Data safety",
  connectionOptions: BetterSqlite3ConnectionPortOptions = {}
) {
  const database = new Database(":memory:")
  const connection = new BetterSqlite3ConnectionPort(
    database,
    connectionOptions
  )
  const binding = await Runtime.create(
    connection,
    environment(),
    { title },
    {
      cancellation: {
        cancelled: () => false,
        onCancel: () => () => undefined,
      },
    }
  )
  return { runtime: binding.service, connection }
}

async function preflight(runtime: RuntimeClient, change: SchemaChange) {
  const snapshot = await runtime.getSnapshot({}, context("snapshot"))
  return runtime.preflightSchema(
    { change, expectedRevision: snapshot.revision },
    context("schema-preflight")
  )
}

async function applySchema(
  runtime: RuntimeClient,
  change: SchemaChange,
  confirmLossy = false
) {
  const plan = await preflight(runtime, change)
  expect(plan.classification).not.toBe("forbidden")
  const result = await runtime.mutateSchema(
    {
      planToken: plan.planToken,
      expectedRevision: plan.baseRevision,
      actionsHash: plan.actionsHash,
      ...(confirmLossy ? { confirmLossy: true as const } : {}),
    },
    context("schema-mutate")
  )
  return { plan, result }
}

function createdId(
  result: Awaited<ReturnType<typeof applySchema>>["result"],
  clientKey: string
) {
  return result.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === clientKey
  )!.id
}

async function createTable(
  runtime: RuntimeClient,
  clientKey: string,
  name: string,
  fields: Array<{
    clientKey: string
    name: string
    kind: "text" | "select" | "multi-select" | "url"
  }>
) {
  const applied = await applySchema(runtime, {
    kind: "create-table",
    clientKey,
    name,
    position: "0",
    fields: fields.map((field, position) => ({
      ...field,
      position: String(position),
    })),
    labelFieldClientKey: fields[0]!.clientKey,
  })
  return {
    tableId: createdId(applied.result, clientKey),
    fieldIds: Object.fromEntries(
      fields.map((field) => [
        field.clientKey,
        createdId(applied.result, field.clientKey),
      ])
    ),
    revision: applied.result.revision,
  }
}

describe("Eidos Runtime P0 data safety regressions", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("removes known layout references in the same transaction as Field deletion", async () => {
    const { runtime, connection } = await createRuntime()
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "status", name: "Status", kind: "text" },
      ])
      const titleId = table.fieldIds.title!
      const statusId = table.fieldIds.status!
      const view = await runtime.mutateView(
        {
          expectedRevision: table.revision,
          changes: [
            {
              kind: "create-view",
              clientKey: "board",
              tableId: table.tableId,
              name: "Board",
              type: "kanban",
              query: {},
              layout: {
                cardFields: [statusId, titleId],
                coverField: statusId,
                dateField: statusId,
                fieldOrder: [titleId, statusId],
                fieldWidths: { [titleId]: 180, [statusId]: 120 },
                groupField: statusId,
                hiddenFields: [statusId],
                extension: { fieldHint: statusId },
              },
              position: "0",
            },
          ],
        },
        context("create-view")
      )
      const viewId = view.createdViews[0]!.viewId
      const plan = await runtime.preflightSchema(
        {
          expectedRevision: view.revision,
          change: { kind: "delete-field", fieldId: statusId },
        },
        context("delete-field-preflight")
      )

      expect(plan.classification).toBe("explicit-lossy")
      expect(plan.dependencies).toContainEqual({ object: "view", id: viewId })
      const deleted = await runtime.mutateSchema(
        {
          planToken: plan.planToken,
          expectedRevision: plan.baseRevision,
          actionsHash: plan.actionsHash,
          confirmLossy: true,
        },
        context("delete-field")
      )
      const page = await runtime.getSchemaPage(
        { revision: deleted.revision, limit: 100 },
        context("schema-after-delete")
      )
      const descriptor = page.objects.find(
        (object) => object.object === "view" && object.id === viewId
      )
      expect(descriptor).toMatchObject({
        layout: {
          cardFields: [titleId],
          coverField: null,
          dateField: null,
          fieldOrder: [titleId],
          fieldWidths: { [titleId]: 180 },
          groupField: null,
          hiddenFields: [],
          extension: { fieldHint: statusId },
        },
      })
      await expect(
        runtime.validate(
          { level: "full", diagnosticsLimit: 100 },
          context("validate")
        )
      ).resolves.toMatchObject({ valid: true })
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("forbids Field deletion during preflight when a saved query still depends on it", async () => {
    const { runtime, connection } = await createRuntime()
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "status", name: "Status", kind: "text" },
      ])
      const statusId = table.fieldIds.status!
      const view = await runtime.mutateView(
        {
          expectedRevision: table.revision,
          changes: [
            {
              kind: "create-view",
              clientKey: "filtered",
              tableId: table.tableId,
              name: "Filtered",
              type: "grid",
              query: {
                sort: [{ fieldId: statusId, direction: "asc" }],
              },
              layout: { fieldOrder: [statusId] },
              position: "0",
            },
          ],
        },
        context("create-filtered-view")
      )
      const plan = await runtime.preflightSchema(
        {
          expectedRevision: view.revision,
          change: { kind: "delete-field", fieldId: statusId },
        },
        context("blocked-delete-preflight")
      )

      expect(plan.classification).toBe("forbidden")
      expect(plan.dependencies).toContainEqual({
        object: "view",
        id: view.createdViews[0]!.viewId,
      })
      expect(plan.warnings).toContainEqual(
        expect.objectContaining({
          code: "dependency-blocked",
          severity: "error",
          fieldId: statusId,
        })
      )
      expect((await runtime.getSnapshot({}, context("after"))).revision).toBe(
        view.revision
      )
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("persists new Select catalogs before accepting their row values", async () => {
    const { runtime, connection } = await createRuntime()
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "status", name: "Status", kind: "select" },
        { clientKey: "tags", name: "Tags", kind: "multi-select" },
      ])
      const statusId = table.fieldIds.status!
      const tagsId = table.fieldIds.tags!
      const catalog = await applySchema(runtime, {
        kind: "batch",
        changes: [
          {
            kind: "set-field-settings",
            fieldId: statusId,
            settings: {
              options: [{ name: "Blocked", color: "gray" }],
            },
          },
          {
            kind: "set-field-settings",
            fieldId: tagsId,
            settings: {
              options: [{ name: "Fresh", color: "green" }],
            },
          },
        ],
      })
      expect(catalog.plan.classification).toBe("metadata-only")

      const rows = await runtime.mutateRows(
        {
          tableId: table.tableId,
          expectedRevision: catalog.result.revision,
          changes: [
            {
              kind: "create",
              clientKey: "created",
              values: { [statusId]: "Blocked", [tagsId]: ["Fresh"] },
            },
          ],
        },
        context("write-new-option-values")
      )
      const schema = await runtime.getSchemaPage(
        { revision: rows.revision, limit: 100 },
        context("option-schema")
      )
      expect(
        schema.objects.find(
          (object) => object.object === "field" && object.id === statusId
        )
      ).toMatchObject({
        settings: { options: [{ name: "Blocked", color: "gray" }] },
      })
      expect(
        schema.objects.find(
          (object) => object.object === "field" && object.id === tagsId
        )
      ).toMatchObject({
        settings: { options: [{ name: "Fresh", color: "green" }] },
      })
      const stored = await runtime.getRowsById(
        {
          tableId: table.tableId,
          rowIds: [rows.created[0]!.rowId],
          projection: { fields: [statusId, tagsId], resolveRelations: [] },
        },
        context("option-values")
      )
      expect(stored.rows[0]!.values).toEqual(["Blocked", ["Fresh"]])
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("converts empty and singleton Multi-select values to nullable Select losslessly", async () => {
    const { runtime, connection } = await createRuntime()
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "tags", name: "Tags", kind: "multi-select" },
      ])
      const titleId = table.fieldIds.title!
      const tagsId = table.fieldIds.tags!
      const rows = await runtime.mutateRows(
        {
          tableId: table.tableId,
          expectedRevision: table.revision,
          changes: [
            {
              kind: "create",
              clientKey: "empty",
              values: { [titleId]: "Empty", [tagsId]: [] },
            },
            {
              kind: "create",
              clientKey: "one",
              values: { [titleId]: "One", [tagsId]: ["A"] },
            },
          ],
        },
        context("create-rows")
      )
      const plan = await runtime.preflightSchema(
        {
          expectedRevision: rows.revision,
          change: {
            kind: "convert-field",
            fieldId: tagsId,
            to: "select",
            toNullable: true,
            policies: ["first"],
          },
        },
        context("convert-preflight")
      )

      expect(plan.classification).toBe("lossless-rewrite")
      expect(plan.valueChanges).toContainEqual(
        expect.objectContaining({
          code: "list-empty-to-null",
          fieldId: tagsId,
          rows: "1",
        })
      )
      const converted = await runtime.mutateSchema(
        {
          planToken: plan.planToken,
          expectedRevision: plan.baseRevision,
          actionsHash: plan.actionsHash,
        },
        context("convert")
      )
      const result = await runtime.queryRows(
        {
          tableId: table.tableId,
          query: { sort: [{ fieldId: titleId, direction: "asc" }] },
          projection: { fields: [titleId, tagsId], resolveRelations: [] },
          limit: 10,
          direction: "forward",
        },
        context("converted-values")
      )
      expect(result.revision).toBe(converted.revision)
      expect(result.rows.map((row) => row.values)).toEqual([
        ["Empty", null],
        ["One", "A"],
      ])
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("wraps plain Text values as one Multi-select choice", async () => {
    const { runtime, connection } = await createRuntime()
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "tags", name: "Tags", kind: "text" },
      ])
      const titleId = table.fieldIds.title!
      const tagsId = table.fieldIds.tags!
      const rows = await runtime.mutateRows(
        {
          tableId: table.tableId,
          expectedRevision: table.revision,
          changes: [
            {
              kind: "create",
              clientKey: "alpha",
              values: { [titleId]: "First", [tagsId]: "Alpha" },
            },
          ],
        },
        context("create-text-choice")
      )
      const converted = await applySchema(runtime, {
        kind: "convert-field",
        fieldId: tagsId,
        to: "multi-select",
      })
      const result = await runtime.getRowsById(
        {
          tableId: table.tableId,
          rowIds: [rows.created[0]!.rowId],
          projection: { fields: [titleId, tagsId], resolveRelations: [] },
        },
        context("converted-text-choice")
      )

      expect(converted.plan.classification).toBe("lossless-rewrite")
      expect(result.rows[0]!.values).toEqual(["First", ["Alpha"]])
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("reuses the physical TEXT column for Text, URL, and Select metadata conversions", async () => {
    const { runtime, connection } = await createRuntime()
    try {
      const table = await createTable(runtime, "links", "Links", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "website", name: "Website", kind: "text" },
      ])
      const titleId = table.fieldIds.title!
      const websiteId = table.fieldIds.website!
      const rows = await runtime.mutateRows(
        {
          tableId: table.tableId,
          expectedRevision: table.revision,
          changes: [
            {
              kind: "create",
              clientKey: "eidos",
              values: {
                [titleId]: "Eidos",
                [websiteId]: "https://eidos.space/docs",
              },
            },
          ],
        },
        context("create-link")
      )
      const execSchema = vi.spyOn(connection, "execSchema")

      const asUrl = await applySchema(runtime, {
        kind: "convert-field",
        fieldId: websiteId,
        to: "url",
        toNullable: true,
      })
      expect(asUrl.plan.classification).toBe("metadata-only")
      expect(execSchema).not.toHaveBeenCalled()

      const asSelect = await applySchema(runtime, {
        kind: "convert-field",
        fieldId: websiteId,
        to: "select",
        toNullable: true,
      })
      expect(asSelect.plan.classification).toBe("metadata-only")
      expect(execSchema).not.toHaveBeenCalled()

      const asText = await applySchema(runtime, {
        kind: "convert-field",
        fieldId: websiteId,
        to: "text",
        toNullable: true,
      })
      expect(asText.plan.classification).toBe("metadata-only")
      expect(execSchema).not.toHaveBeenCalled()

      const schema = await runtime.getSchemaPage(
        { revision: asText.result.revision, limit: 100 },
        context("converted-link-schema")
      )
      expect(
        schema.objects.find(
          (object) => object.object === "field" && object.id === websiteId
        )
      ).toMatchObject({ kind: "text" })
      const stored = await runtime.getRowsById(
        {
          tableId: table.tableId,
          rowIds: [rows.created[0]!.rowId],
          projection: { fields: [titleId, websiteId], resolveRelations: [] },
        },
        context("converted-link-value")
      )
      expect(stored.rows[0]!.values).toEqual([
        "Eidos",
        "https://eidos.space/docs",
      ])
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("converts wide tables without exceeding adapter result budgets", async () => {
    const { runtime, connection } = await createRuntime("Paged conversion", {
      maxResultBytes: 32_768,
    })
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "category", name: "Category", kind: "text" },
        { clientKey: "notes", name: "Notes", kind: "text" },
      ])
      const titleId = table.fieldIds.title!
      const categoryId = table.fieldIds.category!
      const notesId = table.fieldIds.notes!
      let revision = table.revision
      for (let offset = 0; offset < 80; offset += 8) {
        const inserted = await runtime.mutateRows(
          {
            tableId: table.tableId,
            expectedRevision: revision,
            changes: Array.from({ length: 8 }, (_, index) => {
              const rowIndex = offset + index
              return {
                kind: "create" as const,
                clientKey: String(rowIndex),
                values: {
                  [titleId]: `Record ${rowIndex}`,
                  [categoryId]: `Category ${rowIndex % 5} ${"c".repeat(384)}`,
                  [notesId]: `Notes ${rowIndex} ${"n".repeat(512)}`,
                },
              }
            }),
          },
          context(`create-wide-rows-${offset}`)
        )
        revision = inserted.revision
      }
      connection.execSchema(`
        CREATE TRIGGER "items_conversion_guard"
        AFTER UPDATE ON "Items"
        BEGIN
          SELECT 1;
        END
      `)
      const converted = await applySchema(runtime, {
        kind: "convert-field",
        fieldId: categoryId,
        to: "select",
        toNullable: true,
      })
      const schema = await runtime.getSchemaPage(
        { revision: converted.result.revision, limit: 100 },
        context("converted-wide-schema")
      )

      expect(converted.plan.classification).toBe("metadata-only")
      expect(
        connection.get(
          "SELECT name FROM sqlite_schema WHERE type='trigger' AND name='items_conversion_guard'"
        ).row
      ).not.toBeNull()
      expect(
        schema.objects.find(
          (candidate) =>
            candidate.object === "field" && candidate.id === categoryId
        )
      ).toMatchObject({
        kind: "select",
        tableId: table.tableId,
      })
      expect(BigInt(converted.result.revision)).toBeGreaterThan(
        BigInt(revision)
      )
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("counts large tables without materializing every row in the adapter", async () => {
    const { runtime, connection } = await createRuntime("Bounded count", {
      maxResultBytes: 16_384,
    })
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
      ])
      const titleId = table.fieldIds.title!
      let revision = table.revision
      for (let offset = 0; offset < 400; offset += 20) {
        const inserted = await runtime.mutateRows(
          {
            tableId: table.tableId,
            expectedRevision: revision,
            changes: Array.from({ length: 20 }, (_, index) => ({
              kind: "create" as const,
              clientKey: String(offset + index),
              values: { [titleId]: `Record ${offset + index}` },
            })),
          },
          context(`create-count-rows-${offset}`)
        )
        revision = inserted.revision
      }

      await expect(
        runtime.aggregate(
          {
            tableId: table.tableId,
            query: {},
            items: [{ key: "count", op: "count-all" }],
          },
          context("bounded-count")
        )
      ).resolves.toMatchObject({
        results: [{ key: "count", value: "400" }],
      })
      await expect(
        runtime.aggregate(
          {
            tableId: table.tableId,
            query: {},
            items: [
              {
                key: "values",
                op: "distinct-values",
                fieldId: titleId,
                limit: 5,
              },
            ],
          },
          context("bounded-distinct-values")
        )
      ).resolves.toMatchObject({
        results: [
          {
            key: "values",
            values: [
              "Record 0",
              "Record 1",
              "Record 10",
              "Record 100",
              "Record 101",
            ],
            truncated: true,
          },
        ],
      })

      const offsetPage = await runtime.queryRows(
        {
          tableId: table.tableId,
          query: {
            sort: [{ fieldId: titleId, direction: "asc" }],
          },
          projection: {
            fields: [titleId],
            resolveRelations: [],
          },
          limit: 5,
          offset: 390,
        },
        context("bounded-offset-page")
      )
      const expectedTitles = Array.from(
        { length: 400 },
        (_, index) => `Record ${index}`
      )
        .sort()
        .slice(390, 395)

      expect(offsetPage.rows.map((row) => row.values[0])).toEqual(
        expectedTitles
      )
      expect(offsetPage.previousCursor).not.toBeNull()
      await expect(
        runtime.queryRows(
          {
            tableId: table.tableId,
            query: {},
            projection: {
              fields: [titleId],
              resolveRelations: [],
            },
            limit: 5,
            offset: 1,
            cursor: offsetPage.previousCursor!,
          },
          context("invalid-offset-cursor")
        )
      ).rejects.toMatchObject({ code: "invalid-request" })
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("rejects an empty Multi-select for non-nullable Select without changing data or revision", async () => {
    const { runtime, connection } = await createRuntime()
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "tags", name: "Tags", kind: "multi-select" },
      ])
      const tagsId = table.fieldIds.tags!
      const rows = await runtime.mutateRows(
        {
          tableId: table.tableId,
          expectedRevision: table.revision,
          changes: [
            {
              kind: "create",
              clientKey: "empty",
              values: { [tagsId]: [] },
            },
          ],
        },
        context("create-empty-row")
      )
      const plan = await runtime.preflightSchema(
        {
          expectedRevision: rows.revision,
          change: {
            kind: "convert-field",
            fieldId: tagsId,
            to: "select",
            toNullable: false,
            policies: ["first"],
          },
        },
        context("non-nullable-convert-preflight")
      )

      expect(plan.classification).toBe("forbidden")
      expect(plan.warnings).toContainEqual(
        expect.objectContaining({
          code: "conversion-domain-invalid",
          severity: "error",
          fieldId: tagsId,
        })
      )
      expect((await runtime.getSnapshot({}, context("after"))).revision).toBe(
        rows.revision
      )
      const unchanged = await runtime.getRowsById(
        {
          tableId: table.tableId,
          rowIds: [rows.created[0]!.rowId],
          projection: { fields: [tagsId], resolveRelations: [] },
        },
        context("unchanged-empty-row")
      )
      expect(unchanged.rows[0]!.values).toEqual([[]])
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it("requires explicit confirmation before dropping a Multi-select tail and leaves data unchanged", async () => {
    const { runtime, connection } = await createRuntime()
    try {
      const table = await createTable(runtime, "items", "Items", [
        { clientKey: "title", name: "Title", kind: "text" },
        { clientKey: "tags", name: "Tags", kind: "multi-select" },
      ])
      const titleId = table.fieldIds.title!
      const tagsId = table.fieldIds.tags!
      const rows = await runtime.mutateRows(
        {
          tableId: table.tableId,
          expectedRevision: table.revision,
          changes: [
            {
              kind: "create",
              clientKey: "many",
              values: { [titleId]: "Many", [tagsId]: ["A", "B"] },
            },
          ],
        },
        context("create-row")
      )
      const plan = await runtime.preflightSchema(
        {
          expectedRevision: rows.revision,
          change: {
            kind: "convert-field",
            fieldId: tagsId,
            to: "select",
            toNullable: true,
            policies: ["first"],
          },
        },
        context("lossy-preflight")
      )

      expect(plan.classification).toBe("explicit-lossy")
      expect(plan.valueChanges).toContainEqual(
        expect.objectContaining({
          code: "list-tail-dropped",
          fieldId: tagsId,
          rows: "1",
        })
      )
      await expect(
        runtime.mutateSchema(
          {
            planToken: plan.planToken,
            expectedRevision: plan.baseRevision,
            actionsHash: plan.actionsHash,
          },
          context("unconfirmed-lossy-convert")
        )
      ).rejects.toMatchObject({ code: "lossy-confirmation-required" })
      expect((await runtime.getSnapshot({}, context("after"))).revision).toBe(
        rows.revision
      )
      const unchanged = await runtime.getRowsById(
        {
          tableId: table.tableId,
          rowIds: [rows.created[0]!.rowId],
          projection: { fields: [tagsId], resolveRelations: [] },
        },
        context("unchanged-row")
      )
      expect(unchanged.rows[0]!.values).toEqual([["A", "B"]])
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })

  it.each(["restrict", "detach", "preserve"] as const)(
    "applies Relation %s policy to a complete batch atomically",
    async (policy) => {
      const { runtime, connection } = await createRuntime(policy)
      try {
        const targets = await createTable(runtime, "targets", "Targets", [
          { clientKey: "target-name", name: "Name", kind: "text" },
        ])
        const sources = await createTable(runtime, "sources", "Sources", [
          { clientKey: "source-name", name: "Name", kind: "text" },
        ])
        const relation = await applySchema(runtime, {
          kind: "create-field",
          tableId: sources.tableId,
          field: {
            clientKey: "targets-relation",
            name: "Targets",
            kind: "relation",
            position: "1",
            definition: {
              direction: "forward",
              targetTableId: targets.tableId,
              cardinality: "many",
              onDelete: policy,
            },
          },
        })
        const relationId = createdId(relation.result, "targets-relation")
        const targetRows = await runtime.mutateRows(
          {
            tableId: targets.tableId,
            expectedRevision: relation.result.revision,
            changes: ["A", "B", "C"].map((name) => ({
              kind: "create" as const,
              clientKey: name,
              values: { [targets.fieldIds["target-name"]!]: name },
            })),
          },
          context("target-rows")
        )
        const ids = targetRows.created.map((entry) => entry.rowId)
        const sourceRows = await runtime.mutateRows(
          {
            tableId: sources.tableId,
            expectedRevision: targetRows.revision,
            changes: [
              {
                kind: "create",
                clientKey: "source",
                values: {
                  [sources.fieldIds["source-name"]!]: "Source",
                  [relationId]: ids,
                },
              },
            ],
          },
          context("source-row")
        )
        const beforeRevision = sourceRows.revision
        const deletion = runtime.mutateRows(
          {
            tableId: targets.tableId,
            expectedRevision: beforeRevision,
            changes: ids.slice(0, 2).map((rowId) => ({
              kind: "delete" as const,
              rowId,
            })),
          },
          context("delete-targets")
        )

        if (policy === "restrict") {
          await expect(deletion).rejects.toMatchObject({ code: "constraint" })
          expect(
            (await runtime.getSnapshot({}, context("after-restrict"))).revision
          ).toBe(beforeRevision)
        } else {
          const result = await deletion
          expect(result.affectedRows).toEqual(
            policy === "detach"
              ? [
                  { tableId: targets.tableId, rowId: ids[0] },
                  { tableId: targets.tableId, rowId: ids[1] },
                  {
                    tableId: sources.tableId,
                    rowId: sourceRows.created[0]!.rowId,
                  },
                ].sort((left, right) =>
                  left.tableId === right.tableId
                    ? left.rowId!.localeCompare(right.rowId!)
                    : left.tableId.localeCompare(right.tableId)
                )
              : ids.slice(0, 2).map((rowId) => ({
                  tableId: targets.tableId,
                  rowId,
                }))
          )
        }

        const source = await runtime.getRowsById(
          {
            tableId: sources.tableId,
            rowIds: [sourceRows.created[0]!.rowId],
            projection: { fields: [relationId], resolveRelations: [] },
          },
          context("source-after-delete")
        )
        expect(source.rows[0]!.values[0]).toEqual(
          policy === "detach" ? [ids[2]] : ids
        )
        const remaining = await runtime.queryRows(
          {
            tableId: targets.tableId,
            query: {},
            projection: {
              fields: [targets.fieldIds["target-name"]!],
              resolveRelations: [],
            },
            limit: 10,
            direction: "forward",
          },
          context("remaining-targets")
        )
        expect(remaining.rows).toHaveLength(policy === "restrict" ? 3 : 1)
      } finally {
        await runtime.close(context("close"))
        connection.close()
      }
    }
  )

  it("uses complete delete-set semantics in the compatibility deleteRows API", () => {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-delete-safety-"))
    roots.push(root)
    const runtime = createEidosFile(path.join(root, "nodes.eidos"))
    try {
      const table = runtime.createTable({
        name: "Nodes",
        fields: [{ name: "Name", type: "text", isRecordLabel: true }],
      })
      const relation = runtime.addField(table.id, {
        name: "Links",
        type: "relation",
        property: {
          targetTableId: table.id,
          direction: "forward",
          cardinality: "many",
          onDelete: "restrict",
        },
      })
      const first = runtime.insertRow(table.id, { Name: "First" })
      const second = runtime.insertRow(table.id, { Name: "Second" })
      const firstId = String(first._id)
      const secondId = String(second._id)
      runtime.updateRows(table.id, [
        { rowId: firstId, changes: { [relation.id!]: `["${secondId}"]` } },
        { rowId: secondId, changes: { [relation.id!]: `["${firstId}"]` } },
      ])

      expect(runtime.deleteRows(table.id, [firstId, secondId])).toEqual([
        firstId,
        secondId,
      ])
      expect(runtime.countRows(table.id)).toBe(0)
      expect(runtime.validate({ level: "full" })).toMatchObject({ valid: true })
    } finally {
      runtime.close()
    }
  })
})
