// @vitest-environment node
import { expect, it, vi } from "vitest"
import {
  Runtime,
  ConnectionPortEidosFileConnection,
  EidosFileRuntime,
} from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"

it("uses canonical defaults through the shared editor creation/settings boundary", async () => {
  const port = await createTestWasmConnection()
  let now = "2026-11-16T16:00:00.123Z"
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () => now,
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "Editor defaults" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const source = new EidosRuntimeEditorDataSource(service, "synthetic.eidos")
  try {
    await source.initialize()
    const snapshot = await source.createTable({
      name: "Events",
      fields: [
        { name: "Title", type: "text" },
        { name: "Day", type: "date", property: { defaultValue: "now" } },
        { name: "When", type: "datetime", property: { defaultValue: "now" } },
      ],
    })
    const table = snapshot.tables[0]!,
      day = table.fields.find((field) => field.name === "Day")!,
      instant = table.fields.find((field) => field.name === "When")!
    expect(table.temporalDefaultsVersion).toBe(1)
    const context = { timeZone: "Asia/Shanghai", timeZoneData: "2026f" }
    const row = await source.insertRow(table.table.id, {}, context)
    expect([row.row[day.id!], row.row[instant.id!]]).toEqual([
      "2026-11-17",
      now,
    ])
    const explicit = await source.insertRow(
      table.table.id,
      { [day.id!]: "2000-01-02", [instant.id!]: null },
      context
    )
    expect([explicit.row[day.id!], explicit.row[instant.id!]]).toEqual([
      "2000-01-02",
      null,
    ])
    const cleared = await source.updateRow(
      table.table.id,
      String(row.row._id),
      { [day.id!]: null, [instant.id!]: null }
    )
    expect([cleared.row[day.id!], cleared.row[instant.id!]]).toEqual([
      null,
      null,
    ])
    await source.updateField(table.table.id, day.id!, {
      property: { defaultValue: null },
    })
    now = "2026-11-17T16:00:00.456Z"
    const later = await source.insertRow(table.table.id, {}, context)
    expect([later.row[day.id!], later.row[instant.id!]]).toEqual([null, now])

    // Same schema transport against an old service must not silently save now.
    const negotiate = service.negotiate.bind(service)
    const old = vi
      .spyOn(service, "negotiate")
      .mockImplementation(async (...args) => {
        const result = await negotiate(...args)
        delete result.capabilities.temporalDefaultsVersion
        return result
      })
    const oldSource = new EidosRuntimeEditorDataSource(
      service,
      "synthetic.eidos"
    )
    await oldSource.initialize()
    await expect(
      oldSource.updateField(table.table.id, day.id!, {
        property: { defaultValue: "now" },
      })
    ).rejects.toThrow(/does not support date defaults/)
    old.mockRestore()

    // Converting away preserves raw values/null and clears temporal-only settings.
    await source.updateField(table.table.id, instant.id!, { type: "text" })
    const core = new EidosFileRuntime(
      new ConnectionPortEidosFileConnection(port)
    )
    expect(
      core.listFields(table.table.id).find((field) => field.id === instant.id)!
        .settings?.defaultValue ?? null
    ).toBeNull()
    expect(
      (await source.getRow(table.table.id, String(later.row._id)))![instant.id!]
    ).toBe(now)
  } finally {
    await service.close({ requestId: "close" })
  }
})
