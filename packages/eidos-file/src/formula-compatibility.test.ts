import { readFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import Database from "better-sqlite3"
import { expect, it } from "vitest"
import { BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { NodeSqliteConnectionPort } from "./node-sqlite"
import { Runtime } from "./runtime-service"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import { validateEidosFile } from "./validation"
import type { RowQuery } from "./runtime-contract"

const factory = {
  cancellation: { cancelled: () => false, onCancel: () => () => {} },
}
const probe = new DatabaseSync(":memory:")
const supportsNodeSqlite = "serialize" in probe && "limits" in probe
probe.close()

async function wasmPort(bytes: Uint8Array): Promise<SQLiteWasmConnectionPort> {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: globalThis,
  })
  const { default: initialize } = await import("@sqlite.org/sqlite-wasm")
  const manifest = createRequire(import.meta.url).resolve(
    "@sqlite.org/sqlite-wasm/package.json"
  )
  const wasmBinary = await readFile(
    join(dirname(manifest), "sqlite-wasm/jswasm/sqlite3.wasm")
  )
  const sqlite = await initialize({
    print: () => {},
    printErr: () => {},
    wasmBinary,
  } as Parameters<typeof initialize>[0] & { wasmBinary: Uint8Array })
  const path = `/formula-${randomBytes(8).toString("hex")}.eidos`
  sqlite.capi.sqlite3_js_posix_create_file(path, new Uint8Array(bytes))
  return new SQLiteWasmConnectionPort(new sqlite.oo1.DB(path, "w"), sqlite)
}

it("opens an unknown Formula read-only and preserves dependent fields and saved queries", async () => {
  const database = new Database(":memory:")
  const port = new BetterSqlite3ConnectionPort(database)
  const environment = {
    clock: {
      nowInstant: () => "2026-11-19T00:00:00.000Z",
      nowMilliseconds: () => performance.now(),
    },
    entropy: { randomBytes },
  }
  let sequence = 0
  const ctx = () => ({ requestId: `formula-compat-${++sequence}` })
  const writer = (
    await Runtime.create(port, environment, { title: "Formula" }, factory)
  ).service
  const initial = await writer.getSnapshot({}, ctx())
  const plan = await writer.preflightSchema(
    {
      expectedRevision: initial.revision,
      change: {
        kind: "create-table",
        clientKey: "records",
        name: "Records",
        position: "1",
        labelFieldClientKey: "title",
        fields: [
          { clientKey: "title", name: "Title", kind: "text", position: "0" },
          {
            clientKey: "today",
            name: "Today",
            kind: "formula",
            position: "1",
            definition: {
              sourceText: "DATE('2026-11-19')",
              resultType: "date",
            },
          },
          {
            clientKey: "tomorrow",
            name: "Tomorrow",
            kind: "formula",
            position: "2",
            definition: {
              sourceText: "DATE(\"Today\", '+1 day')",
              resultType: "date",
            },
          },
        ],
      },
    },
    ctx()
  )
  const created = await writer.mutateSchema(
    {
      expectedRevision: initial.revision,
      planToken: plan.planToken,
      actionsHash: plan.actionsHash,
    },
    ctx()
  )
  const id = (key: string) =>
    created.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === key
    )!.id
  const tableId = id("records")
  const today = id("today")
  const tomorrow = id("tomorrow")
  const title = id("title")
  const rows = await writer.mutateRows(
    {
      tableId,
      expectedRevision: created.revision,
      changes: [
        {
          kind: "create",
          clientKey: "first",
          values: { [title]: "Original row" },
        },
      ],
    },
    ctx()
  )
  const query = { sort: [{ fieldId: tomorrow, direction: "asc" as const }] }
  const saved = await writer.mutateView(
    {
      expectedRevision: rows.revision,
      changes: [
        {
          kind: "create-view",
          clientKey: "sorted",
          tableId,
          name: "Sorted",
          type: "grid",
          position: "1",
          layout: {},
          query,
        },
      ],
    },
    ctx()
  )
  // A fixture for bytes written by a newer client. No current writer may create it.
  const source = "FUTURE_DATE()"
  database.transaction(() => {
    database
      .prepare(
        "UPDATE eidos__formula_fields SET source_text = ? WHERE field_id = ?"
      )
      .run(source, today)
    database.prepare("UPDATE eidos__meta SET revision = revision + 1").run()
  })()
  const before = database.serialize()
  const futureRevision = (BigInt(saved.revision) + 1n).toString()
  // A writable binding may survive a newer writer committing its Schema.
  // Reject even a no-op request at that new revision, inside the write transaction.
  await expect(
    writer.mutateRows(
      {
        tableId,
        expectedRevision: futureRevision,
        changes: [
          {
            kind: "update",
            rowId: rows.created[0]!.rowId,
            values: { [title]: "Original row" },
          },
        ],
      },
      ctx()
    )
  ).rejects.toMatchObject({ code: "unsupported" })
  expect(database.serialize()).toEqual(before)
  expect((await writer.getSnapshot({}, ctx())).revision).toBe(futureRevision)
  await writer.close(ctx())

  const connection = new ConnectionPortEidosFileConnection(port)
  expect(validateEidosFile(connection).valid).toBe(false)
  expect(
    validateEidosFile(connection, { allowUnsupportedFormulaFunctions: true })
  ).toMatchObject({
    valid: true,
    warnings: expect.arrayContaining([
      expect.objectContaining({ code: "unsupported-formula" }),
    ]),
  })

  const reader = (await Runtime.open(port, environment, "readwrite", factory))
    .service
  try {
    const schema = await reader.getSchemaPage(
      { revision: futureRevision, limit: 100 },
      ctx()
    )
    expect(
      schema.objects.find(
        (object) => object.object === "view" && object.tableId === tableId
      )
    ).toMatchObject({
      queryStatus: "unsupported",
      queryUnavailableReason: "unsupported-formula",
      query,
    })
    const request = {
      tableId,
      query: {},
      projection: { fields: [title, today, tomorrow], resolveRelations: [] },
      limit: 10,
    }
    const page = await reader.queryRows(request, ctx())
    expect(
      page.columns.map((column) => [column.valueStatus, column.writable])
    ).toEqual([
      [undefined, false],
      ["unsupported-formula", false],
      ["unsupported-formula", false],
    ])
    expect(page.rows.map((row) => row.values)).toEqual([
      ["Original row", null, null],
    ])
    await expect(
      reader.queryRows(
        {
          ...request,
          query: { sort: [{ fieldId: tomorrow, direction: "asc" }] },
        },
        ctx()
      )
    ).rejects.toMatchObject({ code: "unsupported" })
    await expect(
      reader.mutateRows(
        {
          tableId,
          expectedRevision: futureRevision,
          changes: [],
        },
        ctx()
      )
    ).rejects.toMatchObject({ code: "unsupported" })
    expect(database.serialize()).toEqual(before)
    const wasm = await wasmPort(before)
    const wasmReader = (
      await Runtime.open(wasm, environment, "readwrite", factory)
    ).service
    try {
      expect(
        validateEidosFile(new ConnectionPortEidosFileConnection(wasm), {
          allowUnsupportedFormulaFunctions: true,
        }).valid
      ).toBe(true)
      expect(await wasmReader.queryRows(request, ctx())).toMatchObject({
        rows: [{ values: ["Original row", null, null] }],
      })
    } finally {
      await wasmReader.close(ctx())
      wasm.close()
    }
  } finally {
    await reader.close(ctx())
    port.close()
  }
})

it.each(
  supportsNodeSqlite
    ? ["better-sqlite3", "wasm", "node:sqlite"]
    : ["better-sqlite3", "wasm"]
)(
  "keeps TODAY formulas, counts, sorting and cursor keys on the original local date (%s)",
  async (adapter) => {
    const database =
      adapter === "node:sqlite" ? undefined : new Database(":memory:")
    const writerPort = database
      ? new BetterSqlite3ConnectionPort(database)
      : new NodeSqliteConnectionPort(new DatabaseSync(":memory:"))
    const beforeMidnight = "2026-11-19T15:59:59.000Z"
    const afterMidnight = "2026-11-19T16:00:01.000Z"
    let now = beforeMidnight
    let sequence = 0
    const ctx = () => ({ requestId: `formula-today-${++sequence}` })
    const calendar = {
      timeZone: "Asia/Shanghai",
      timeZoneData: "2026f",
      weekStartsOn: 1 as const,
    }
    const environment = {
      clock: {
        nowInstant: () => now,
        nowMilliseconds: () => performance.now(),
      },
      entropy: { randomBytes },
    }
    const writer = (
      await Runtime.create(writerPort, environment, { title: "Today" }, factory)
    ).service
    const initial = await writer.getSnapshot({}, ctx())
    const plan = await writer.preflightSchema(
      {
        expectedRevision: initial.revision,
        change: {
          kind: "create-table",
          clientKey: "tasks",
          name: "Tasks",
          position: "1",
          labelFieldClientKey: "title",
          fields: [
            { clientKey: "title", name: "Title", kind: "text", position: "0" },
            { clientKey: "due", name: "Due", kind: "date", position: "1" },
            {
              clientKey: "today",
              name: "Today",
              kind: "formula",
              position: "2",
              definition: { sourceText: "TODAY()", resultType: "date" },
            },
            {
              clientKey: "status",
              name: "Status",
              kind: "formula",
              position: "3",
              definition: {
                sourceText: `CASE WHEN "Due" = "Today" THEN 'Today' WHEN "Due" = DATE(TODAY(), '+1 day') THEN 'Tomorrow' ELSE 'Other' END`,
                resultType: "text",
              },
            },
          ],
        },
      },
      ctx()
    )
    const created = await writer.mutateSchema(
      {
        expectedRevision: initial.revision,
        planToken: plan.planToken,
        actionsHash: plan.actionsHash,
      },
      ctx()
    )
    const id = (key: string) =>
      created.createdObjects.find(
        (object) => "clientKey" in object && object.clientKey === key
      )!.id
    const tableId = id("tasks")
    await writer.mutateRows(
      {
        tableId,
        expectedRevision: created.revision,
        changes: [
          ["First", "2026-11-19"],
          ["Second", "2026-11-19"],
          ["Third", "2026-11-20"],
        ].map(([title, due]) => ({
          clientKey: title!,
          kind: "create" as const,
          values: { [id("title")]: title!, [id("due")]: due! },
        })),
      },
      ctx()
    )
    await writer.close(ctx())
    const port =
      adapter === "wasm" ? await wasmPort(database!.serialize()) : writerPort
    const reader = (await Runtime.open(port, environment, "read", factory))
      .service
    try {
      const query: RowQuery = {
        filter: { op: "eq", fieldId: id("status"), value: "Today" },
        sort: [
          { fieldId: id("today"), direction: "asc" },
          { fieldId: id("title"), direction: "asc" },
        ],
      }
      const request = {
        tableId,
        calendar,
        query,
        limit: 1,
        projection: {
          fields: [id("title"), id("today"), id("status")],
          resolveRelations: [],
        },
      }
      const root = await reader.queryRows(request, ctx())
      expect(root.rows[0]?.values).toEqual(["First", "2026-11-19", "Today"])
      expect(root.total).toBe("2")
      expect(root.referenceInstant).toBe(beforeMidnight)
      expect(root.nextCursor).not.toBeNull()
      now = afterMidnight
      const next = await reader.queryRows(
        { ...request, cursor: root.nextCursor! },
        ctx()
      )
      expect(next.rows[0]?.values).toEqual(["Second", "2026-11-19", "Today"])
      expect(next.total).toBe("2")
      expect(next.referenceInstant).toBe(root.referenceInstant)
      await expect(
        reader.queryRows(
          {
            ...request,
            cursor: root.nextCursor!,
            referenceInstant: afterMidnight,
          },
          ctx()
        )
      ).rejects.toMatchObject({ code: "invalid-query" })
      const fresh = await reader.queryRows(request, ctx())
      expect(fresh.rows[0]?.values).toEqual(["Third", "2026-11-20", "Today"])
      expect(fresh.total).toBe("1")
      const preview = {
        tableId,
        candidateName: "Preview",
        rowIds: [root.rows[0]!.id],
        sourceText: "DATE(TODAY(), '+1 day')",
        declaredResultType: "date" as const,
        calendar,
        referenceInstant: beforeMidnight,
      }
      expect(await reader.previewFormula(preview, ctx())).toMatchObject({
        valid: true,
        rows: [{ value: "2026-11-20" }],
      })
      expect(
        await reader.previewFormula(
          { ...preview, sourceText: "TODAY(1)" },
          ctx()
        )
      ).toMatchObject({ valid: false })
      expect(
        await reader.getRowsById(
          {
            tableId,
            calendar,
            referenceInstant: beforeMidnight,
            rowIds: [root.rows[0]!.id],
            projection: request.projection,
          },
          ctx()
        )
      ).toMatchObject({ rows: [{ values: ["First", "2026-11-19", "Today"] }] })
    } finally {
      await reader.close(ctx())
      port.close()
      if (port !== writerPort) writerPort.close()
    }
  }
)
