import { readFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import Database from "better-sqlite3"
import { expect, it } from "vitest"
import { BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { Runtime } from "./runtime-service"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import { validateEidosFile } from "./validation"

const factory = {
  cancellation: { cancelled: () => false, onCancel: () => () => {} },
}

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

it.each(["FUTURE_DATE()", "TODAY()", "DATE(ToDaY(), '+1 day')"])(
  "opens %s read-only and preserves dependent fields and saved queries",
  async (source) => {
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
  }
)

it("rejects nested and mixed-case TODAY formulas through the canonical write path", async () => {
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
  const ctx = () => ({ requestId: `formula-write-${++sequence}` })
  const writer = (
    await Runtime.create(port, environment, { title: "Formula" }, factory)
  ).service
  try {
    const initial = await writer.getSnapshot({}, ctx())
    const planTable = (sourceText: string) =>
      writer.preflightSchema(
        {
          expectedRevision: initial.revision,
          change: {
            kind: "create-table",
            clientKey: "records",
            name: "Records",
            position: "1",
            labelFieldClientKey: "title",
            fields: [
              {
                clientKey: "title",
                name: "Title",
                kind: "text",
                position: "0",
              },
              {
                clientKey: "date",
                name: "Date",
                kind: "formula",
                position: "1",
                definition: { sourceText, resultType: "date" },
              },
            ],
          },
        },
        ctx()
      )
    const before = database.serialize()
    for (const sourceText of ["TODAY()", "DATE(ToDaY(), '+1 day')"]) {
      const plan = await planTable(sourceText)
      expect(plan.classification).toBe("forbidden")
      await expect(
        writer.mutateSchema(
          {
            expectedRevision: initial.revision,
            planToken: plan.planToken,
            actionsHash: plan.actionsHash,
          },
          ctx()
        )
      ).rejects.toMatchObject({ code: "forbidden" })
    }
    expect(database.serialize()).toEqual(before)
    const supported = await planTable("DATE('2026-11-19')")
    await expect(
      writer.mutateSchema(
        {
          expectedRevision: initial.revision,
          planToken: supported.planToken,
          actionsHash: supported.actionsHash,
        },
        ctx()
      )
    ).resolves.toMatchObject({ changed: true })
  } finally {
    await writer.close(ctx())
    port.close()
  }
})
