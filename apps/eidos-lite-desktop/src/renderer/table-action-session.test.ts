import { DatabaseSync } from "node:sqlite"
import { describe, it, expect } from "vitest"
import type { EidosFileDataSource } from "@eidos.space/eidos-file"
import { NodeSqliteConnectionPort } from "@eidos.space/eidos-file/node-sqlite"
import {
  ConnectionPortEidosFileConnection,
  EidosFileRuntime,
  initializeEidosFileSchema,
  Runtime,
} from "@eidos.space/eidos-file"
import { EidosRuntimeEditorDataSource } from "../../../../packages/eidos-file-ui/src/runtime-editor-data-source"
import { TableActionSession } from "./table-action-session"

async function fixture(count = 4) {
  const connection = new NodeSqliteConnectionPort(new DatabaseSync(":memory:"))
  const legacy = new ConnectionPortEidosFileConnection(connection)
  initializeEidosFileSchema(legacy, {})
  const core = new EidosFileRuntime(legacy, false)
  const table = core.createTable({
    name: "Requests",
    fields: [
      { name: "Message", type: "text", isRecordLabel: true },
      { name: "Category", type: "text" },
      { name: "Score", type: "number" },
    ],
  })
  for (let offset = 0; offset < count; offset += 500)
    core.mutateRows({
      tableId: table.id,
      insert: Array.from({ length: Math.min(500, count - offset) }, (_, i) => ({
        fields: { Message: `Request ${offset + i}`, Category: "", Score: 0 },
      })),
    })
  core.close()
  const { service } = await Runtime.open(
    connection,
    {
      clock: {
        nowInstant: () => new Date().toISOString(),
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    "readwrite",
    { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
  )
  const source = new EidosRuntimeEditorDataSource(service, "actions.eidos")
  const snapshot = await source.initialize()
  const fields = snapshot.tables[0]!.fields
  const message = fields.find((f) => f.name === "Message")!.id!
  const category = fields.find((f) => f.name === "Category")!.id!
  const score = fields.find((f) => f.name === "Score")!.id!
  return {
    source,
    tableId: table.id,
    message,
    category,
    score,
    close: () =>
      service.close({ requestId: "close", deadlineMilliseconds: 5000 }),
  }
}
describe("table action authority with native Runtime", () => {
  it("does not write or retain receipts when the result is unchanged", async () => {
    const f = await fixture(1)
    try {
      const session = new TableActionSession(f.source, f.tableId)
      await session.capture({}, null)
      const [row] = await session.read(0, 1, [f.category])
      const output = { readToken: row!.readToken, values: { [f.category]: "" } }
      session.approve([output])
      const before = await f.source.getSnapshot()
      await session.update(output.readToken, output.values)
      expect(session.undo).toEqual([])
      expect(session.unchanged).toBe(1)
      expect(await f.source.getSnapshot()).toEqual(before)
    } finally {
      await f.close()
    }
  })
  it("settles a dispatched write before releasing its receipt on cancellation", async () => {
    let finish!: (value: { undoToken: string }) => void
    const released: string[] = []
    const source = {
      captureTableActionTarget: async () => ["row"],
      readTableActionRows: async () => [
        { id: "row", values: { field: "before" }, version: "v1" },
      ],
      writeTableActionRow: () =>
        new Promise<{ undoToken: string }>((resolve) => {
          finish = resolve
        }),
      releaseTableActionUndo: (tokens: string[]) => {
        released.push(...tokens)
      },
    } as unknown as EidosFileDataSource
    const session = new TableActionSession(source, "table")
    await session.capture({}, null)
    const [row] = await session.read(0, 1, ["field"])
    const output = { readToken: row!.readToken, values: { field: "after" } }
    session.approve([output])
    const write = session.update(output.readToken, output.values)
    session.dispose()
    expect(released).toEqual([])
    finish({ undoToken: "undo" })
    await write
    await session.settled()
    await Promise.resolve()
    expect(released).toEqual(["undo"])
  })
  it("persists and rereads table plugin configuration through the native runtime", async () => {
    const f = await fixture()
    try {
      const initial = await f.source.readTablePluginConfig(
        f.tableId,
        "eidos.smart-actions"
      )
      const value = { version: 1, actions: [{ id: "test" }] }
      await f.source.writeTablePluginConfig(f.tableId, "eidos.smart-actions", {
        value,
        expectedVersion: initial.version,
      })
      expect(
        (await f.source.readTablePluginConfig(f.tableId, "eidos.smart-actions"))
          .value
      ).toEqual(value)
    } finally {
      await f.close()
    }
  })
  it("captures unloaded records, uses exclusive range ends and freezes identity", async () => {
    const f = await fixture(1105)
    try {
      const all = new TableActionSession(f.source, f.tableId)
      await all.capture({}, null)
      expect(all.ids).toHaveLength(1105)
      const selected = new TableActionSession(f.source, f.tableId)
      await selected.capture({}, [{ startIndex: 999, endIndex: 1002 }])
      expect(selected.ids).toEqual(all.ids.slice(999, 1002))
      await f.source.insertRow(f.tableId, { [f.message]: "Added later" })
      expect(all.ids).toHaveLength(1105)
      const filtered = new TableActionSession(f.source, f.tableId)
      await filtered.capture({ search: "Added later" }, null)
      expect(filtered.ids).toHaveLength(1)
    } finally {
      await f.close()
    }
  })
  it("writes multiple fields atomically, allows later rows and undoes a whole run", async () => {
    const f = await fixture()
    try {
      const session = new TableActionSession(f.source, f.tableId)
      await session.capture({}, null)
      const rows = await session.read(0, 2, [f.message, f.category, f.score])
      const values = { [f.category]: "billing", [f.score]: 0.9 }
      await expect(session.update(rows[0]!.readToken, values)).rejects.toThrow(
        "preview"
      )
      session.approve(rows.map((row) => ({ readToken: row.readToken, values })))
      for (const row of rows) await session.update(row.readToken, values)
      expect(session.undo).toHaveLength(2)
      const updated = await f.source.readTableActionRows(
        f.tableId,
        session.ids.slice(0, 2),
        [f.category, f.score]
      )
      expect(
        updated.every(
          (row) =>
            row.values[f.category] === "billing" && row.values[f.score] === 0.9
        )
      ).toBe(true)
      await session.revert()
      expect(
        (
          await f.source.readTableActionRows(
            f.tableId,
            session.ids.slice(0, 2),
            [f.category]
          )
        ).every((row) => row.values[f.category] === "")
      ).toBe(true)
      expect(session.redo).toHaveLength(2)
      await session.revert("redo")
      expect(session.redo).toHaveLength(0)
      expect(session.undo).toHaveLength(2)
      expect(
        (
          await f.source.readTableActionRows(
            f.tableId,
            session.ids.slice(0, 2),
            [f.category, f.score]
          )
        ).every(
          (row) =>
            row.values[f.category] === "billing" && row.values[f.score] === 0.9
        )
      ).toBe(true)
      await session.revert()
      await f.source.updateRow(f.tableId, session.ids[0]!, {
        [f.category]: "Manual edit",
      })
      await expect(session.revert("redo")).rejects.toThrow("changed")
      expect(session.redo).toHaveLength(2)
    } finally {
      await f.close()
    }
  })
  it("rejects invalid output, scope escape, stale data, cancelled writes and unsafe undo", async () => {
    const f = await fixture()
    try {
      const session = new TableActionSession(f.source, f.tableId)
      await session.capture({}, [{ startIndex: 0, endIndex: 1 }])
      const [row] = await session.read(0, 1, [f.message, f.category, f.score])
      const output = { [f.category]: "billing", [f.score]: 1 }
      session.approve([{ readToken: row!.readToken, values: output }])
      await expect(session.update("forged", output)).rejects.toThrow("token")
      await expect(
        session.update(row!.readToken, { [f.message]: "escape" })
      ).rejects.toThrow("approved")
      await expect(
        session.update(row!.readToken, { ...output, [f.score]: "invalid" })
      ).rejects.toThrow()
      await expect(
        f.source.writeTableActionRow(
          f.tableId,
          session.records.get(row!.readToken)!,
          { ...output, [f.score]: "invalid" }
        )
      ).rejects.toThrow()
      expect(
        (
          await f.source.readTableActionRows(f.tableId, session.ids, [
            f.category,
          ])
        )[0]!.values[f.category]
      ).toBe("")
      await f.source.updateRow(f.tableId, row!.id, {
        [f.message]: "Edited while inference runs",
      })
      await expect(session.update(row!.readToken, output)).rejects.toThrow(
        "changed"
      )
      const [fresh] = await session.read(0, 1, [f.message, f.category, f.score])
      await session.update(fresh!.readToken, output)
      await f.source.updateRow(f.tableId, row!.id, {
        [f.category]: "User change",
      })
      await expect(session.revert()).rejects.toThrow("changed")
      session.cancel()
      await expect(session.update(fresh!.readToken, output)).rejects.toThrow()
    } finally {
      await f.close()
    }
  })
})
