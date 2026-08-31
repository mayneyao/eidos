import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { Runtime } from "./runtime-service"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import type { RequestContext, RuntimeEnvironment } from "./runtime-contract"

const context = (requestId: string): RequestContext => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

function environment(): RuntimeEnvironment {
  let monotonic = 0
  let entropy = 0
  return {
    clock: {
      nowInstant: () => "2026-07-23T00:00:00.000Z",
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

describe("Runtime list-filter regression", () => {
  it("applies has-any to the public multi-select TypeRef alias", async () => {
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
      { title: "List filters" },
      {
        cancellation: {
          cancelled: () => false,
          onCancel: () => () => undefined,
        },
      }
    )
    const runtime = binding.service

    try {
      const preflight = await runtime.preflightSchema(
        {
          expectedRevision: "0",
          change: {
            kind: "create-table",
            clientKey: "records",
            name: "Records",
            position: "0",
            fields: [
              {
                clientKey: "title",
                name: "Title",
                kind: "text",
                position: "0",
              },
              {
                clientKey: "signals",
                name: "Signals",
                kind: "multi-select",
                position: "1",
              },
              {
                clientKey: "day",
                name: "Day",
                kind: "date",
                position: "2",
              },
              {
                clientKey: "files",
                name: "Files",
                kind: "file",
                position: "3",
              },
            ],
            labelFieldClientKey: "title",
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
        (entry) => "clientKey" in entry && entry.clientKey === "records"
      )!.id
      const titleFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "title"
      )!.id
      const signalsFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "signals"
      )!.id
      const dayFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "day"
      )!.id
      const filesFieldId = schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "files"
      )!.id
      const validContent = await runtime.preflightSchema(
        {
          expectedRevision: schema.revision,
          change: {
            kind: "set-table-settings",
            tableId,
            settings: { contentFieldId: titleFieldId },
          },
        },
        context("valid-content-field")
      )
      expect(validContent.classification).toBe("metadata-only")
      const contentSchema = await runtime.mutateSchema(
        {
          expectedRevision: schema.revision,
          planToken: validContent.planToken,
          actionsHash: validContent.actionsHash,
        },
        context("commit-content-field")
      )
      const contentSchemaPage = await runtime.getSchemaPage(
        { revision: contentSchema.revision, limit: 100 },
        context("content-field-schema")
      )
      expect(
        contentSchemaPage.objects.find(
          (object) => object.object === "table" && object.id === tableId
        )
      ).toMatchObject({ settings: { contentFieldId: titleFieldId } })
      const invalidContent = await runtime.preflightSchema(
        {
          expectedRevision: contentSchema.revision,
          change: {
            kind: "set-table-settings",
            tableId,
            settings: { contentFieldId: signalsFieldId },
          },
        },
        context("invalid-content-field")
      )
      expect(invalidContent).toMatchObject({
        classification: "forbidden",
        warnings: [
          expect.objectContaining({
            code: "dependency-blocked",
            fieldId: signalsFieldId,
          }),
        ],
      })
      const roadmapFile = await binding.hostBridge.allocateFileEntry(
        {
          name: "Roadmap.PDF",
          mediaType: "application/pdf",
          size: "4",
          uri: "assets/roadmap.pdf",
        },
        context("roadmap-file")
      )
      const budgetFile = await binding.hostBridge.allocateFileEntry(
        {
          name: "Budget.xlsx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: "4",
          uri: "https://example.com/budget.xlsx",
        },
        context("budget-file")
      )
      const inlineFile = await binding.hostBridge.allocateFileEntry(
        {
          name: "Inline.png",
          mediaType: "image/png",
          size: "4",
          uri: "data:image/png;base64,dGVzdA==",
        },
        context("inline-file")
      )

      const rows = await runtime.mutateRows(
        {
          tableId,
          expectedRevision: contentSchema.revision,
          changes: [
            {
              kind: "create",
              clientKey: "quality",
              values: {
                [titleFieldId]: "Alpha",
                [signalsFieldId]: ["Quality", "Speed"],
                [dayFieldId]: "2026-07-20",
                [filesFieldId]: [roadmapFile, inlineFile],
              },
            },
            {
              kind: "create",
              clientKey: "cost",
              values: {
                [titleFieldId]: "Beta",
                [signalsFieldId]: ["Cost"],
                [dayFieldId]: "2026-07-10",
                [filesFieldId]: [budgetFile],
              },
            },
          ],
        },
        context("rows")
      )
      const result = await runtime.queryRows(
        {
          tableId,
          query: {
            filter: {
              op: "has-any",
              fieldId: signalsFieldId,
              values: ["Quality"],
            },
          },
          projection: {
            fields: [titleFieldId, signalsFieldId],
            resolveRelations: [],
          },
          limit: 25,
          direction: "forward",
        },
        context("query")
      )

      expect(result.revision).toBe(rows.revision)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]?.values).toEqual(["Alpha", ["Quality", "Speed"]])

      const wholeList = await runtime.queryRows(
        {
          tableId,
          query: {
            filter: {
              op: "in",
              fieldId: signalsFieldId,
              values: [["Quality", "Speed"]],
            },
          },
          projection: {
            fields: [titleFieldId, signalsFieldId],
            resolveRelations: [],
          },
          limit: 25,
          direction: "forward",
        },
        context("whole-list-query")
      )

      expect(wholeList.rows).toHaveLength(1)
      expect(wholeList.rows[0]?.values).toEqual(["Alpha", ["Quality", "Speed"]])

      const searchedSignals = await runtime.queryRows(
        {
          tableId,
          query: {
            search: { text: "qual", fields: [signalsFieldId] },
          },
          projection: {
            fields: [titleFieldId, signalsFieldId],
            resolveRelations: [],
          },
          limit: 25,
          direction: "forward",
        },
        context("multi-select-search")
      )
      expect(searchedSignals.rows.map((row) => row.values)).toEqual([
        ["Alpha", ["Quality", "Speed"]],
      ])

      const searchedFiles = await runtime.queryRows(
        {
          tableId,
          query: {
            search: { text: "ROADMAP", fields: [filesFieldId] },
          },
          projection: {
            fields: [titleFieldId, filesFieldId],
            resolveRelations: [],
          },
          limit: 25,
          direction: "forward",
        },
        context("file-name-search")
      )
      expect(searchedFiles.rows).toHaveLength(1)
      expect(searchedFiles.rows[0]?.values).toEqual([
        "Alpha",
        [roadmapFile, inlineFile],
      ])

      const searchedFileMediaType = await runtime.queryRows(
        {
          tableId,
          query: {
            search: { text: "spreadsheetml", fields: [filesFieldId] },
          },
          projection: { fields: [titleFieldId], resolveRelations: [] },
          limit: 25,
          direction: "forward",
        },
        context("file-media-type-search")
      )
      expect(searchedFileMediaType.rows.map((row) => row.values)).toEqual([
        ["Beta"],
      ])

      const searchedFileUri = await runtime.queryRows(
        {
          tableId,
          query: {
            search: { text: "assets/roadmap", fields: [filesFieldId] },
          },
          projection: { fields: [titleFieldId], resolveRelations: [] },
          limit: 25,
          direction: "forward",
        },
        context("file-uri-search")
      )
      expect(searchedFileUri.rows.map((row) => row.values)).toEqual([["Alpha"]])

      const excludedInlinePayload = await runtime.queryRows(
        {
          tableId,
          query: {
            search: { text: "dGVzdA", fields: [filesFieldId] },
          },
          projection: { fields: [titleFieldId], resolveRelations: [] },
          limit: 25,
          direction: "forward",
        },
        context("file-inline-payload-search")
      )
      expect(excludedInlinePayload.rows).toEqual([])

      const recent = await runtime.queryRows(
        {
          tableId,
          query: {
            filter: {
              op: "relative-date",
              fieldId: dayFieldId,
              direction: "this",
              unit: "week",
            },
          },
          projection: {
            fields: [titleFieldId, dayFieldId],
            resolveRelations: [],
          },
          limit: 25,
          direction: "forward",
        },
        context("relative-date-query")
      )

      expect(recent.rows).toHaveLength(1)
      expect(recent.rows[0]?.values).toEqual(["Alpha", "2026-07-20"])

      const numberLabelPlan = await runtime.preflightSchema(
        {
          expectedRevision: rows.revision,
          change: {
            kind: "create-table",
            clientKey: "number-labels",
            name: "Number Labels",
            position: "1",
            fields: [
              {
                clientKey: "amount-label",
                name: "Amount",
                kind: "number",
                position: "0",
              },
            ],
            labelFieldClientKey: "amount-label",
          },
        },
        context("number-label-plan")
      )
      const numberLabelSchema = await runtime.mutateSchema(
        {
          expectedRevision: rows.revision,
          planToken: numberLabelPlan.planToken,
          actionsHash: numberLabelPlan.actionsHash,
        },
        context("number-label-schema")
      )
      const numberLabelTableId = numberLabelSchema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "number-labels"
      )!.id
      const amountLabelId = numberLabelSchema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === "amount-label"
      )!.id
      const numberLabelRow = await runtime.mutateRows(
        {
          tableId: numberLabelTableId,
          expectedRevision: numberLabelSchema.revision,
          changes: [
            {
              kind: "create",
              clientKey: "large-number",
              values: { [amountLabelId]: 1e30 },
            },
          ],
        },
        context("number-label-row")
      )
      const searchedNumberLabel = await runtime.queryRows(
        {
          tableId: numberLabelTableId,
          query: {
            search: { text: "1e+30", fields: [amountLabelId] },
          },
          projection: { fields: [amountLabelId], resolveRelations: [] },
          limit: 25,
          direction: "forward",
        },
        context("number-label-search")
      )
      expect(searchedNumberLabel.revision).toBe(numberLabelRow.revision)
      expect(searchedNumberLabel.rows.map((row) => row.values)).toEqual([
        [1e30],
      ])
    } finally {
      await runtime.close(context("close"))
      connection.close()
    }
  })
})
