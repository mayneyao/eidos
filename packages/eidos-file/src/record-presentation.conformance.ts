import { expect } from "vitest"
import type { ConnectionPort } from "./adapter-contract"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { Runtime } from "./runtime-service"
import type { SchemaLeafChange } from "./runtime-contract"
import { validateEidosFile } from "./validation"

export async function expectRecordPresentationConformance(
  port: ConnectionPort
) {
  let request = 0
  const context = () => ({
    requestId: "record-presentation-" + ++request,
    deadlineMilliseconds: 30_000,
  })
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () =>
          new Date(Date.UTC(2026, 10, 18) + request).toISOString(),
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      },
    },
    { title: "Record presentation" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const connection = new ConnectionPortEidosFileConnection(port)
  const plan = async (change: SchemaLeafChange) => {
    const snapshot = await service.getSnapshot({}, context())
    return service.preflightSchema(
      { expectedRevision: snapshot.revision, change },
      context()
    )
  }
  const apply = async (change: SchemaLeafChange) => {
    const result = await plan(change)
    expect(result.classification).not.toBe("forbidden")
    return service.mutateSchema(
      {
        expectedRevision: result.baseRevision,
        planToken: result.planToken,
        actionsHash: result.actionsHash,
      },
      context()
    )
  }
  try {
    const created = await apply({
      kind: "create-table",
      clientKey: "tasks",
      name: "Tasks",
      position: "0",
      fields: [
        { clientKey: "title", name: "Title", kind: "text", position: "0" },
      ],
    })
    const tableId = created.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === "tasks"
    )!.id
    const read = () =>
      JSON.parse(
        connection.get<{ settings_json: string }>(
          "SELECT settings_json FROM eidos__tables WHERE id = ?",
          [tableId]
        )!.settings_json
      ) as Record<string, unknown>
    const before = await service.getSnapshot({}, context())
    const views = connection.query("SELECT * FROM eidos__views")
    const rows = connection.query('SELECT * FROM "Tasks"')
    expect(read()).not.toHaveProperty("hideSystemFieldsInRecords")
    for (const value of [true, false]) {
      await apply({
        kind: "set-table-settings",
        tableId,
        settings: {
          vendorSetting: { keep: "yes" },
          hideSystemFieldsInRecords: value,
        },
      })
      expect(read()).toEqual({
        vendorSetting: { keep: "yes" },
        hideSystemFieldsInRecords: value,
      })
      expect(validateEidosFile(connection).valid).toBe(true)
    }
    await apply({
      kind: "set-table-settings",
      tableId,
      settings: { vendorSetting: { keep: "yes" } },
    })
    expect(read()).toEqual({ vendorSetting: { keep: "yes" } })
    expect(connection.query("SELECT * FROM eidos__views")).toEqual(views)
    expect(connection.query('SELECT * FROM "Tasks"')).toEqual(rows)
    expect(
      (await service.getSnapshot({}, context())).schemaCounts.features
    ).toBe(before.schemaCounts.features)
    // Legacy presentation keys are now opaque application metadata.
    connection.run("UPDATE eidos__tables SET settings_json = ? WHERE id = ?", [
      '{"hideSystemFieldsInRecords":null}',
      tableId,
    ])
    expect(validateEidosFile(connection).valid).toBe(true)
  } finally {
    await service.close(context())
  }
}
