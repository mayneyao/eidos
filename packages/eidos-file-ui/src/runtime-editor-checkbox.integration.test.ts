// @vitest-environment node
import { expect, it, vi } from "vitest"
import {
  Runtime,
  ConnectionPortEidosFileConnection,
} from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"

it("reviews actual NULL counts and rejects stale Checkbox conversion confirmation", async () => {
  const port = await createTestWasmConnection()
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () => "2026-11-15T00:00:00.000Z",
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "Conversion source" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const source = new EidosRuntimeEditorDataSource(service, "conversion.eidos"),
    sql = new ConnectionPortEidosFileConnection(port)
  try {
    await source.initialize()
    let snapshot = await source.createTable({
      name: "Convert",
      fields: [
        { name: "Title", type: "text" },
        { name: "Flag", type: "text" },
      ],
    })
    const table = snapshot.tables[0]!,
      flag = table.fields.find((field) => field.name === "Flag")!
    for (const value of [null, "true", "false"])
      await source.insertRow(table.table.id, { [flag.id]: value })
    const before = sql.query('SELECT * FROM "Convert"')
    await expect(
      source.updateField(table.table.id, flag.id, { type: "checkbox" })
    ).rejects.toMatchObject({
      code: "schema-impact-confirmation-required",
      impact: {
        classification: "explicit-lossy",
        valueChanges: expect.arrayContaining([
          expect.objectContaining({ code: "null-to-false", rows: "1" }),
        ]),
      },
    })
    expect(sql.query('SELECT * FROM "Convert"')).toEqual(before)
    await source.insertRow(table.table.id, {})
    await expect(
      source.updateField(table.table.id, flag.id, {
        type: "checkbox",
        confirmLossy: true,
      })
    ).rejects.toMatchObject({
      code: "schema-impact-confirmation-required",
      impact: {
        valueChanges: expect.arrayContaining([
          expect.objectContaining({ code: "null-to-false", rows: "2" }),
        ]),
      },
    })
    expect(sql.query('PRAGMA table_xinfo("Convert")')).toContainEqual(
      expect.objectContaining({ name: "Flag", type: "TEXT", notnull: 0 })
    )
    snapshot = await source.updateField(table.table.id, flag.id, {
      type: "checkbox",
      confirmLossy: true,
    })
    expect(
      snapshot.tables[0]!.fields.find((field) => field.id === flag.id)
    ).toMatchObject({ type: "checkbox", nullable: false })
    expect(
      sql
        .query<{ Flag: number }>('SELECT "Flag" FROM "Convert"')
        .map((row) => row.Flag)
    ).toEqual([0, 1, 0, 0])
    expect(sql.query('PRAGMA table_xinfo("Convert")')).toContainEqual(
      expect.objectContaining({ name: "Flag", notnull: 1, dflt_value: "0" })
    )
    const created = await source.createTable({
      name: "NoNull",
      fields: [{ name: "Flag", type: "text" }],
    })
    const nonnull = created.tables.find(
        (table) => table.table.name === "NoNull"
      )!,
      nonnullFlag = nonnull.fields.find((field) => field.name === "Flag")!
    await source.insertRow(nonnull.table.id, { [nonnullFlag.id]: "true" })
    await expect(
      source.updateField(nonnull.table.id, nonnullFlag.id, { type: "checkbox" })
    ).resolves.toBeDefined()
  } finally {
    await service.close({ requestId: "close" })
    port.close()
  }
})

it("keeps new Checkbox fields binary through the real shared source and CSV Runtime path", async () => {
  const port = await createTestWasmConnection()
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () => "2026-11-15T00:00:00.000Z",
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "Checkbox source" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const source = new EidosRuntimeEditorDataSource(service, "synthetic.eidos")
  const sql = new ConnectionPortEidosFileConnection(port)
  try {
    await source.initialize()
    let snapshot = await source.createTable({
      name: "Checks",
      fields: [
        { name: "Title", type: "text" },
        { name: "Flag", type: "checkbox" },
      ],
    })
    let table = snapshot.tables[0]!
    const title = table.fields.find((field) => field.name === "Title")!
    const flag = table.fields.find((field) => field.name === "Flag")!
    expect(flag.nullable).toBe(false)
    const row = await source.insertRow(table.table.id, {
      [title.id!]: "omitted",
    })
    expect(row.row[flag.id!]).toBe(false)
    snapshot = await source.addField(table.table.id, {
      name: "Added",
      type: "checkbox",
    })
    table = snapshot.tables[0]!
    expect(table.fields.find((field) => field.name === "Added")?.nullable).toBe(
      false
    )
    await source.updateRow(table.table.id, String(row.row._id), {
      [flag.id!]: 1,
    })
    await source.updateRow(table.table.id, String(row.row._id), {
      [flag.id!]: 0,
    })
    const before = await source.getSnapshot()
    await expect(
      source.updateRow(table.table.id, String(row.row._id), {
        [flag.id!]: null,
      })
    ).rejects.toMatchObject({ code: "constraint" })
    expect((await source.getSnapshot()).metadata.revision).toBe(
      before.metadata.revision
    )
    expect(sql.query('SELECT "Flag", "Added" FROM "Checks"')).toEqual([
      { Flag: 0, Added: 0 },
    ])
    const original = new TextEncoder().encode(
      'Name,Flag,Note\n"comma, quote ""x""",true,"two\nlines"\nblank,," "\nfalse,false,\n'
    )
    const unchanged = original.slice()
    const preview = await source.previewCsv("Imported.csv", original.buffer)
    expect(preview.sampleRows.map((record) => record[1])).toEqual([
      "true",
      "false",
      "false",
    ])
    const runtimeImport = vi.spyOn(service, "importCsv")
    const imported = await source.importCsv("Imported.csv", original.buffer)
    expect(original).toEqual(unchanged)
    expect(
      new TextDecoder().decode(runtimeImport.mock.calls[0]![0].csv)
    ).toContain("blank,false, ")
    expect(imported.result.importedRowCount).toBe(3)
    expect(sql.query('SELECT "Name", "Flag", "Note" FROM "Imported"')).toEqual([
      { Name: 'comma, quote "x"', Flag: 1, Note: "two\nlines" },
      { Name: "blank", Flag: 0, Note: null },
      { Name: "false", Flag: 0, Note: null },
    ])
    expect(sql.query('PRAGMA table_xinfo("Imported")')).toContainEqual(
      expect.objectContaining({ name: "Flag", notnull: 1, dflt_value: "0" })
    )
    const after = await source.getSnapshot()
    await expect(
      source.importCsv(
        "Invalid.csv",
        new TextEncoder().encode("Name,Flag\nbad,null\n").buffer,
        { columns: [{ sourceIndex: 1, type: "checkbox" }] }
      )
    ).rejects.toThrow(/not true or false/)
    expect((await source.getSnapshot()).metadata.revision).toBe(
      after.metadata.revision
    )
  } finally {
    await service.close({ requestId: "close" })
    port.close()
  }
})
