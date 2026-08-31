import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { expectConnectionPortConformance } from "./connection-port.conformance"
import { quoteIdentifier } from "./identifiers"
import { Runtime } from "./runtime-service"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import type { RequestContext, RuntimeEnvironment } from "./runtime-contract"

const context = (requestId: string): RequestContext => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

const environment = (): RuntimeEnvironment => {
  let monotonic = 0
  let entropy = 0
  return {
    clock: {
      nowInstant: () => "2026-07-22T00:00:00.000Z",
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

describe("Eidos Runtime 1.0 WASM conformance paths", () => {
  it("groups every selected row and continues groups and rows by bound cursors", async () => {
    Object.defineProperty(globalThis, "self", {
      configurable: true,
      value: globalThis,
    })
    const { default: sqlite3InitModule } =
      await import("@sqlite.org/sqlite-wasm")
    const packageJson = createRequire(import.meta.url).resolve(
      "@sqlite.org/sqlite-wasm/package.json"
    )
    const wasmBinary = await readFile(
      join(dirname(packageJson), "sqlite-wasm/jswasm/sqlite3.wasm")
    )
    const sqlite = await sqlite3InitModule({
      print: () => undefined,
      printErr: () => undefined,
      wasmBinary,
    } as Parameters<typeof sqlite3InitModule>[0] & { wasmBinary: Uint8Array })
    const database = new sqlite.oo1.DB(":memory:", "c")
    const connection = new SQLiteWasmConnectionPort(database, sqlite)
    const binding = await Runtime.create(
      connection,
      environment(),
      { title: "Groups" },
      {
        cancellation: {
          cancelled: () => false,
          onCancel: () => () => undefined,
        },
      }
    )
    const runtime = binding.service
    try {
      const negotiation = await runtime.negotiate(
        { protocol: "eidos-runtime", versions: ["1.0"] },
        context("negotiate")
      )
      expect(negotiation.limits.formulaBytesMax).toBe(4_096)
      expect(negotiation.capabilities.formulaPreview).toBe(true)
      await expectConnectionPortConformance(connection)
      expect(() =>
        connection.transaction("read", () =>
          connection.query(
            "INSERT INTO eidos__features(name, version, required, config_json) " +
              "VALUES ('x.test', '1.0', 0, '{}') RETURNING name"
          )
        )
      ).toThrow(/read transaction/)
      const formulaSemantics = connection.get(`SELECT
        eidos_formula_int_add(9223372036854775807, 1) AS overflow,
        eidos_formula_numeric_gt(9007199254740993, 9007199254740992.0) AS mixed,
        substr('😀ab', 2, 2) AS substring,
        length('a' || char(0) || '😀') AS scalarLength,
        date('2024-02-28', '+1 day') AS leapDay,
        strftime('%Y-%m-%dT%H:%M:%fZ',
          datetime('2026-12-31T23:00:00.000Z', '+1 hour')
        ) AS instant,
        format('%d小时%d分钟',
          floor(eidos_formula_num_div(309299, 3600)),
          round(eidos_formula_num_div(eidos_formula_int_mod(309299, 3600), 60))
        ) AS formatted,
        concat(85, '小时', 55, '分钟') AS concatenated,
        floor(1.5) AS rounded`)
      expect(formulaSemantics.row).toEqual([
        { tag: "null" },
        { tag: "integer", value: "1" },
        { tag: "text", value: "ab" },
        { tag: "integer", value: "1" },
        { tag: "text", value: "2024-02-29" },
        { tag: "text", value: "2027-01-01T00:00:00.000Z" },
        { tag: "text", value: "85小时55分钟" },
        { tag: "text", value: "85小时55分钟" },
        { tag: "real", value: 1 },
      ])
      expect(formulaSemantics.columns).toEqual([
        { name: "overflow" },
        { name: "mixed" },
        { name: "substring" },
        { name: "scalarLength" },
        { name: "leapDay" },
        { name: "instant" },
        { name: "formatted" },
        { name: "concatenated" },
        { name: "rounded" },
      ])

      const preflight = await runtime.preflightSchema(
        {
          expectedRevision: "0",
          change: {
            kind: "create-table",
            clientKey: "table",
            name: "Items",
            position: "0",
            fields: [
              {
                clientKey: "group",
                name: "Group",
                kind: "text",
                position: "0",
              },
              {
                clientKey: "amount",
                name: "Amount",
                kind: "integer",
                position: "1",
              },
              {
                clientKey: "overflow",
                name: "Overflow",
                kind: "formula",
                position: "2",
                definition: {
                  sourceText: '"Amount" + 9223372036854775807',
                  resultType: "integer",
                },
              },
              {
                clientKey: "substring",
                name: "Substring",
                kind: "formula",
                position: "3",
                definition: {
                  sourceText: "SUBSTR('😀ab', 2, 2)",
                  resultType: "text",
                },
              },
              {
                clientKey: "mixed",
                name: "Mixed numeric",
                kind: "formula",
                position: "4",
                definition: {
                  sourceText: '"Amount" = 1.0',
                  resultType: "checkbox",
                },
              },
              {
                clientKey: "files",
                name: "Files",
                kind: "file",
                position: "5",
              },
            ],
            labelFieldClientKey: "group",
          },
        },
        context("preflight")
      )
      const schema = await runtime.mutateSchema(
        {
          expectedRevision: "0",
          planToken: preflight.planToken,
          actionsHash: preflight.actionsHash,
        },
        context("schema")
      )
      const tableId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "table"
      )!.id
      const groupFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "group"
      )!.id
      const amountFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "amount"
      )!.id
      const overflowFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "overflow"
      )!.id
      const substringFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "substring"
      )!.id
      const mixedFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "mixed"
      )!.id
      const fileFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "files"
      )!.id
      const formulaPreview = await runtime.previewFormula(
        {
          tableId,
          candidateName: "Preview doubled",
          sourceText: '"Amount" * 2',
          declaredResultType: "integer",
        },
        context("formula-preview")
      )
      expect(formulaPreview).toMatchObject({
        valid: true,
        dependencies: [amountFieldId],
        rows: [],
      })
      const invalidFormula = await runtime.preflightSchema(
        {
          expectedRevision: schema.revision,
          change: {
            kind: "set-formula",
            fieldId: substringFieldId,
            definition: {
              sourceText: "SUBSTR('a', 1.5)",
              resultType: "text",
            },
          },
        },
        context("invalid-formula")
      )
      expect(invalidFormula.classification).toBe("forbidden")
      expect(invalidFormula.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "formula-type-invalid",
            severity: "error",
          }),
        ])
      )
      const rename = await runtime.preflightSchema(
        {
          expectedRevision: schema.revision,
          change: {
            kind: "rename-field",
            fieldId: amountFieldId,
            name: "Quantity",
          },
        },
        context("rename-formula-reference")
      )
      expect(rename.classification).toBe("lossless-rewrite")
      const changes = Array.from({ length: 1_002 }, (_, index) => ({
        kind: "create" as const,
        clientKey: `row-${index}`,
        values: {
          [groupFieldId]: index < 501 ? "A" : "B",
          [amountFieldId]: index < 501 ? "1" : "2",
        },
      }))
      let revision = schema.revision
      let firstItemId = ""
      for (let offset = 0; offset < changes.length; offset += 500) {
        const mutation = await runtime.mutateRows(
          {
            tableId,
            expectedRevision: revision,
            changes: changes.slice(offset, offset + 500),
          },
          context(`rows-${offset}`)
        )
        revision = mutation.revision
        if (offset === 0) {
          firstItemId = mutation.created.find(
            (entry) => entry.clientKey === "row-0"
          )!.rowId
        }
      }
      const request = {
        tableId,
        query: {
          sort: [{ fieldId: amountFieldId, direction: "asc" as const }],
        },
        groupBy: [groupFieldId],
        aggregates: [
          { key: "count", op: "count-all" as const },
          { key: "sum", op: "sum" as const, fieldId: amountFieldId },
        ],
        projection: {
          fields: [
            groupFieldId,
            amountFieldId,
            overflowFieldId,
            substringFieldId,
            mixedFieldId,
          ],
          resolveRelations: [],
        },
        groupLimit: 1,
        rowsPerGroup: 1,
      }
      const first = await runtime.groupRows(request, context("group-1"))
      expect(first.groups[0]).toMatchObject({
        key: ["A"],
        count: "501",
        aggregates: [
          { key: "count", value: "501" },
          { key: "sum", value: "501" },
        ],
      })
      expect(first.groups[0]!.rows).toHaveLength(1)
      expect(first.groups[0]!.rows[0]!.values).toEqual([
        "A",
        "1",
        null,
        "ab",
        true,
      ])
      expect(first.groups[0]!.nextRowCursor).not.toBeNull()
      expect(first.nextCursor).not.toBeNull()

      const continuedRows = await runtime.queryGroupRows(
        { cursor: first.groups[0]!.nextRowCursor!, limit: 1_000 },
        context("group-rows")
      )
      expect(continuedRows.groupKey).toEqual(["A"])
      expect(continuedRows.rows).toHaveLength(500)
      expect(continuedRows.nextCursor).toBeNull()
      expect(continuedRows.previousCursor).not.toBeNull()

      const second = await runtime.groupRows(
        { ...request, cursor: first.nextCursor! },
        context("group-2")
      )
      expect(second.groups[0]).toMatchObject({
        key: ["B"],
        count: "501",
        aggregates: [
          { key: "count", value: "501" },
          { key: "sum", value: "1002" },
        ],
      })
      expect(second.nextCursor).toBeNull()
      expect(second.previousCursor).not.toBeNull()

      const targetPlan = await runtime.preflightSchema(
        {
          expectedRevision: revision,
          change: {
            kind: "create-table",
            clientKey: "target-table",
            name: "Targets",
            position: "1",
            fields: [
              {
                clientKey: "target-label",
                name: "Label",
                kind: "text",
                position: "0",
              },
              {
                clientKey: "target-value",
                name: "Value",
                kind: "integer",
                position: "1",
              },
            ],
            labelFieldClientKey: "target-label",
          },
        },
        context("target-plan")
      )
      const targetSchema = await runtime.mutateSchema(
        {
          expectedRevision: revision,
          planToken: targetPlan.planToken,
          actionsHash: targetPlan.actionsHash,
        },
        context("target-schema")
      )
      revision = targetSchema.revision
      const targetTableId = targetSchema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "target-table"
      )!.id
      const targetLabelId = targetSchema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "target-label"
      )!.id
      const targetValueId = targetSchema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "target-value"
      )!.id
      const targetRows = await runtime.mutateRows(
        {
          tableId: targetTableId,
          expectedRevision: revision,
          changes: [
            {
              kind: "create",
              clientKey: "maximum",
              values: {
                [targetLabelId]: "Maximum",
                [targetValueId]: "9223372036854775807",
              },
            },
            {
              kind: "create",
              clientKey: "null",
              values: { [targetLabelId]: "Null", [targetValueId]: null },
            },
            {
              kind: "create",
              clientKey: "one",
              values: { [targetLabelId]: "One", [targetValueId]: "1" },
            },
          ],
        },
        context("target-rows")
      )
      revision = targetRows.revision
      const targetRowIds = ["maximum", "null", "one"].map(
        (key) =>
          targetRows.created.find((entry) => entry.clientKey === key)!.rowId
      )
      const relationPlan = await runtime.preflightSchema(
        {
          expectedRevision: revision,
          change: {
            kind: "create-field",
            tableId,
            field: {
              clientKey: "targets-relation",
              name: "Targets",
              kind: "relation",
              position: "5",
              definition: {
                direction: "forward",
                targetTableId,
                cardinality: "many",
                onDelete: "detach",
              },
            },
          },
        },
        context("relation-plan")
      )
      const relationSchema = await runtime.mutateSchema(
        {
          expectedRevision: revision,
          planToken: relationPlan.planToken,
          actionsHash: relationPlan.actionsHash,
        },
        context("relation-schema")
      )
      revision = relationSchema.revision
      const relationFieldId = relationSchema.createdObjects.find(
        (entry) =>
          "clientKey" in entry && entry.clientKey === "targets-relation"
      )!.id
      const lookupPlan = await runtime.preflightSchema(
        {
          expectedRevision: revision,
          change: {
            kind: "batch",
            changes: [
              {
                kind: "create-field",
                tableId,
                field: {
                  clientKey: "lookup-values",
                  name: "Lookup values",
                  kind: "lookup",
                  position: "6",
                  definition: {
                    relationFieldId,
                    targetFieldId: targetValueId,
                    aggregate: "values",
                    distinctValues: false,
                  },
                },
              },
              {
                kind: "create-field",
                tableId,
                field: {
                  clientKey: "lookup-sum",
                  name: "Lookup sum",
                  kind: "lookup",
                  position: "7",
                  definition: {
                    relationFieldId,
                    targetFieldId: targetValueId,
                    aggregate: "sum",
                    distinctValues: false,
                  },
                },
              },
            ],
          },
        },
        context("lookup-plan")
      )
      expect(lookupPlan.classification).toBe("metadata-only")
      const lookupSchema = await runtime.mutateSchema(
        {
          expectedRevision: revision,
          planToken: lookupPlan.planToken,
          actionsHash: lookupPlan.actionsHash,
        },
        context("lookup-schema")
      )
      revision = lookupSchema.revision
      const lookupValuesId = lookupSchema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "lookup-values"
      )!.id
      const lookupSumId = lookupSchema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "lookup-sum"
      )!.id
      const related = await runtime.mutateRows(
        {
          tableId,
          expectedRevision: revision,
          changes: [
            {
              kind: "update",
              rowId: firstItemId,
              values: { [relationFieldId]: targetRowIds },
            },
          ],
        },
        context("related-row")
      )
      const lookupPage = await runtime.queryRows(
        {
          tableId,
          query: {
            sort: [{ fieldId: groupFieldId, direction: "asc" }],
          },
          projection: {
            fields: [lookupValuesId, lookupSumId],
            resolveRelations: [],
          },
          limit: 1,
          direction: "forward",
        },
        context("lookup-query")
      )
      expect(lookupPage.columns.map((column) => column.valueType)).toEqual([
        { kind: "list", element: "integer" },
        "integer",
      ])
      expect(lookupPage.rows[0]!.values).toEqual([
        ["9223372036854775807", null, "1"],
        null,
      ])

      const createdView = await runtime.mutateView(
        {
          expectedRevision: related.revision,
          changes: [
            {
              kind: "create-view",
              clientKey: "view",
              tableId,
              name: "Board",
              type: "kanban",
              query: {},
              layout: {
                fieldOrder: [groupFieldId, amountFieldId],
                groupField: groupFieldId,
                hiddenFields: [],
              },
              position: "0",
            },
          ],
        },
        context("create-view")
      )
      const viewId = createdView.createdViews[0]!.viewId
      const updatedView = await runtime.mutateView(
        {
          expectedRevision: createdView.revision,
          changes: [
            {
              kind: "update-view",
              viewId,
              patch: {
                layout: {
                  fieldOrder: [amountFieldId, groupFieldId],
                  groupField: groupFieldId,
                  hiddenFields: [overflowFieldId],
                },
              },
            },
          ],
        },
        context("update-view")
      )
      const schemaPage = await runtime.getSchemaPage(
        { revision: updatedView.revision, limit: 1_000 },
        context("view-schema")
      )
      expect(
        schemaPage.objects.find(
          (object) => object.object === "view" && object.id === viewId
        )
      ).toMatchObject({
        layout: {
          fieldOrder: [amountFieldId, groupFieldId],
          groupField: groupFieldId,
          hiddenFields: [overflowFieldId],
        },
      })

      const payload = `${"AAAA".repeat(349_525)}AA==`
      const inlineEntry = await binding.hostBridge.allocateFileEntry(
        {
          name: "boundary.png",
          mediaType: "image/png",
          size: "1048576",
          uri: `data:image/png;base64,${payload}`,
        },
        context("allocate-inline-boundary")
      )
      const beforeFileMutation = await runtime.getSnapshot(
        {},
        context("snapshot-before-file")
      )
      const fileMutation = await runtime.mutateRows(
        {
          tableId,
          expectedRevision: beforeFileMutation.revision,
          changes: [
            {
              kind: "update",
              rowId: firstItemId,
              values: { [fileFieldId]: [inlineEntry] },
            },
          ],
        },
        context("mutate-inline-boundary")
      )
      const fileRows = await runtime.getRowsById(
        {
          tableId,
          rowIds: [firstItemId],
          projection: { fields: [fileFieldId], resolveRelations: [] },
        },
        context("read-inline-boundary")
      )
      expect(fileRows.revision).toBe(fileMutation.revision)
      expect(fileRows.rows[0]?.values[0]).toEqual([inlineEntry])

      const tablePhysicalName = "Items"
      const fieldPhysicalName = "Files"
      connection.transaction("write", () =>
        connection.query(
          `UPDATE ${quoteIdentifier(tablePhysicalName)} SET ${quoteIdentifier(fieldPhysicalName)} = ?1 WHERE "_id" = ?2 RETURNING "_id"`,
          [
            { tag: "text", value: "[] " },
            { tag: "text", value: firstItemId },
          ]
        )
      )
      await expect(
        runtime.getRowsById(
          {
            tableId,
            rowIds: [firstItemId],
            projection: { fields: [fileFieldId], resolveRelations: [] },
          },
          context("read-corrupt-file-value")
        )
      ).rejects.toMatchObject({ code: "corrupt-file" })
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  }, 60_000)
})
