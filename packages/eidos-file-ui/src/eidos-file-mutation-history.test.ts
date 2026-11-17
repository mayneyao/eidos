// @vitest-environment node
import { Runtime } from "@eidos.space/eidos-file"
import { vi } from "vitest"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import { eidosFileMutationHistory } from "./eidos-file-mutation-history"

async function fixture() {
  const port = await createTestWasmConnection()
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () => new Date().toISOString(),
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "Shared history" },
    { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
  )
  const source = new EidosRuntimeEditorDataSource(service, "synthetic.eidos")
  await source.initialize()
  const snapshot = await source.createTable({
    name: "Records",
    fields: [
      { name: "Title", type: "text", isRecordLabel: true },
      { name: "Integer", type: "integer" },
    ],
  })
  const table = snapshot.tables[0]!,
    title = table.fields.find((f) => f.name === "Title")!.id,
    integer = table.fields.find((f) => f.name === "Integer")!.id
  const rows = []
  for (let i = 0; i < 3; i++)
    rows.push(
      (
        await source.insertRow(table.table.id, {
          [title]: `Record ${i}`,
          [integer]: 9223372036854775807n,
        })
      ).row
    )
  return {
    source,
    history: eidosFileMutationHistory(source),
    tableId: table.table.id,
    title,
    integer,
    ids: rows.map((row) => String(row._id)),
    read: () => source.getPage(table.table.id, 0, 100, {}),
    close: () => port.close(),
  }
}

it("uses one session history for edits and an atomic multi-record Runtime deletion, preserving IDs and exact values", async () => {
  const f = await fixture()
  try {
    const h = f.history
    expect(eidosFileMutationHistory(f.source)).toBe(h)
    expect(eidosFileMutationHistory(h.source)).toBe(h)
    await h.source.updateRow(f.tableId, f.ids[0]!, {
      [f.title]: "Edited",
      [f.integer]: -9223372036854775808n,
    })
    // Host-owned deletion callback uses the original source, like Gallery.
    await h.delete(() => f.source.deleteRows(f.tableId, f.ids.slice(0, 2)))
    expect((await f.read()).rows).toHaveLength(1)
    await h.undo()
    const restored = (await f.read()).rows
    expect(restored.map((row) => row._id)).toEqual(f.ids)
    expect(restored[0]![f.title]).toBe("Edited")
    expect(restored[0]![f.integer]).toBe("-9223372036854775808")
    await h.undo()
    expect((await f.read()).rows[0]).toMatchObject({
      [f.title]: "Record 0",
      [f.integer]: "9223372036854775807",
    })
    await h.redo()
    await h.redo()
    expect((await f.read()).rows.map((row) => row._id)).toEqual(f.ids.slice(2))
  } finally {
    f.close()
  }
})

it("keeps independent files/sessions isolated and does not double-register a tracked deletion callback", async () => {
  const a = await fixture(),
    b = await fixture()
  try {
    expect(a.history).not.toBe(b.history)
    await a.history.delete(() =>
      a.history.source.deleteRows(a.tableId, a.ids.slice(0, 2))
    )
    expect(b.history.getSnapshot().canUndo).toBe(false)
    expect(await b.history.undo()).toBe(false)
    await a.history.undo()
    expect((await a.read()).rows).toHaveLength(3)
    expect(await a.history.undo()).toBe(false)
    expect((await b.read()).rows).toHaveLength(3)
  } finally {
    a.close()
    b.close()
  }
})

it("groups multi-cell writes by stable identity, rejects external conflicts, and retains failed undo for retry", async () => {
  const f = await fixture()
  try {
    await f.history.updateRows(
      f.tableId,
      f.ids
        .slice(0, 2)
        .map((rowId) => ({ rowId, fields: { [f.title]: "Edited" } }))
    )
    await f.source.updateRow(f.tableId, f.ids[0]!, { [f.title]: "External" })
    await expect(f.history.undo()).rejects.toThrow("changed since")
    expect(f.history.getSnapshot().canUndo).toBe(true)
    expect((await f.read()).rows.map((row) => row[f.title])).toEqual([
      "External",
      "Edited",
      "Record 2",
    ])
    await f.source.updateRow(f.tableId, f.ids[0]!, { [f.title]: "Edited" })
    const update = f.source.updateRow.bind(f.source)
    vi.spyOn(f.source, "updateRow")
      .mockImplementationOnce(update)
      .mockRejectedValueOnce(new Error("Synthetic failure"))
    await expect(f.history.undo()).rejects.toThrow("Synthetic failure")
    expect((await f.read()).rows.map((row) => row[f.title])).toEqual([
      "Edited",
      "Record 1",
      "Record 2",
    ])
    await f.history.undo()
    expect((await f.read()).rows.map((row) => row[f.title])).toEqual([
      "Record 0",
      "Record 1",
      "Record 2",
    ])
    await f.history.redo()
    expect((await f.read()).rows.map((row) => row[f.title])).toEqual([
      "Edited",
      "Edited",
      "Record 2",
    ])
  } finally {
    f.close()
  }
})

it("keeps failed/cancelled deletes out of history and treats unsupported creation as an explicit boundary", async () => {
  const f = await fixture()
  try {
    await expect(
      f.history.delete(async () => {
        throw new Error("Denied")
      })
    ).rejects.toThrow("Denied")
    await f.history.delete(async () => undefined)
    expect(f.history.getSnapshot()).toMatchObject({
      canUndo: false,
      busy: false,
    })
    await f.history.source.updateRow(f.tableId, f.ids[0]!, {
      [f.title]: "Edited",
    })
    await f.history.undo()
    await f.history.source.updateRow(f.tableId, f.ids[1]!, {
      [f.title]: "Other edit",
    })
    expect(f.history.getSnapshot().canRedo).toBe(false)
    await f.history.source.insertRow(f.tableId, { [f.title]: "Created" })
    expect(f.history.getSnapshot().canUndo).toBe(false)
  } finally {
    f.close()
  }
})
