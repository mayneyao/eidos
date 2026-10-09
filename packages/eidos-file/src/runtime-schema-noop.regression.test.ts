import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { expect, it } from "vitest"
import { Runtime } from "./runtime-service"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import type { SchemaLeafChange } from "./runtime-contract"

it("keeps repeated schema assignments from producing metadata-only revisions", async () => {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: globalThis,
  })
  const { default: sqlite3InitModule } = await import("@sqlite.org/sqlite-wasm")
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
  let tick = 0
  let entropy = 0
  const binding = await Runtime.create(
    connection,
    {
      clock: {
        nowInstant: () => new Date(Date.UTC(2026, 9, 8) + tick++).toISOString(),
        nowMilliseconds: () => tick++,
      },
      entropy: {
        randomBytes: (length) =>
          Uint8Array.from({ length }, () => entropy++ & 255),
      },
    },
    { title: "Sync fixture" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const runtime = binding.service
  const context = () => ({
    requestId: `schema-${tick++}`,
    deadlineMilliseconds: 30_000,
  })
  const apply = async (change: SchemaLeafChange) => {
    const snapshot = await runtime.getSnapshot({}, context())
    const plan = await runtime.preflightSchema(
      { expectedRevision: snapshot.revision, change },
      context()
    )
    return runtime.mutateSchema(
      {
        expectedRevision: snapshot.revision,
        planToken: plan.planToken,
        actionsHash: plan.actionsHash,
      },
      context()
    )
  }
  try {
    const created = await apply({
      kind: "create-table",
      clientKey: "table",
      name: "Tasks",
      position: "0",
      fields: [
        { clientKey: "title", name: "Title", kind: "text", position: "0" },
      ],
    })
    const tableId = created.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === "table"
    )!.id
    const fieldId = created.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === "title"
    )!.id
    const assignments: SchemaLeafChange[] = [
      { kind: "set-file-title", title: "Sync fixture" },
      { kind: "set-default-table", tableId: null },
      { kind: "set-table-settings", tableId, settings: {} },
      { kind: "set-table-position", tableId, position: "0" },
      { kind: "set-field-settings", fieldId, settings: {} },
      { kind: "set-field-position", fieldId, position: "0" },
    ]
    for (const change of assignments) {
      const before = connection.query("SELECT * FROM eidos__meta")
      const result = await apply(change)
      expect(result.changed, change.kind).toBe(false)
      expect(
        connection.query("SELECT * FROM eidos__meta"),
        change.kind
      ).toEqual(before)
    }
    // Real edits still advance exactly once; retrying them is a no-op.
    const edits: SchemaLeafChange[] = [
      { kind: "set-file-title", title: "Changed" },
      { kind: "set-default-table", tableId },
      { kind: "set-table-settings", tableId, settings: { accent: "blue" } },
      { kind: "set-table-position", tableId, position: "2" },
      {
        kind: "set-field-settings",
        fieldId,
        settings: { description: "Details" },
      },
      { kind: "set-field-position", fieldId, position: "3" },
    ]
    for (const change of edits) {
      const before = await runtime.getSnapshot({}, context())
      const changed = await apply(change)
      expect(changed.changed).toBe(true)
      expect(BigInt(changed.revision)).toBe(BigInt(before.revision) + 1n)
      const metadata = connection.query("SELECT * FROM eidos__meta")
      expect((await apply(change)).changed, change.kind).toBe(false)
      expect(connection.query("SELECT * FROM eidos__meta")).toEqual(metadata)
    }
  } finally {
    await runtime.close(context())
  }
})
