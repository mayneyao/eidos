import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import { createNodeSqliteHostBridge } from "./node-host"
import type { RuntimeClient } from "../runtime-contract"

it("carries null-to-false plans and confirmation through the QuickJS JSON facade", async () => {
  const database = new DatabaseSync(":memory:", {
    readBigInts: true,
    enableForeignKeyConstraints: true,
  })
  globalThis.__eidos_host = createNodeSqliteHostBridge(database)
  await import("../quickjs-entry")
  const wire = globalThis.__eidos_runtime
  let sequence = 0
  async function call<
    K extends "preflightSchema" | "mutateSchema" | "mutateRows" | "queryRows",
  >(
    method: K,
    request: Parameters<RuntimeClient[K]>[0]
  ): Promise<Awaited<ReturnType<RuntimeClient[K]>>> {
    const response = JSON.parse(
      await wire.call(
        method,
        JSON.stringify(request),
        JSON.stringify({ requestId: `wire-${++sequence}` })
      )
    ) as { ok: boolean; value: Awaited<ReturnType<RuntimeClient[K]>> }
    expect(response.ok).toBe(true)
    return response.value
  }
  try {
    expect(
      JSON.parse(
        await wire.open(
          JSON.stringify({ mode: "create", title: "Checkbox wire" })
        )
      )
    ).toMatchObject({ ok: true })
    const plan = await call("preflightSchema", {
      expectedRevision: "0",
      change: {
        kind: "create-table",
        clientKey: "table",
        name: "Wire",
        position: "0",
        labelFieldClientKey: "flag",
        fields: [
          { clientKey: "flag", name: "Flag", kind: "text", position: "0" },
        ],
      },
    })
    const created = await call("mutateSchema", {
      expectedRevision: "0",
      planToken: plan.planToken,
      actionsHash: plan.actionsHash,
    })
    const tableId = created.createdObjects.find(
      (object) => object.object === "table"
    )!.id
    const fieldId = created.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === "flag"
    )!.id
    const rows = await call("mutateRows", {
      tableId,
      expectedRevision: created.revision,
      changes: [
        { kind: "create", clientKey: "empty", values: { [fieldId]: null } },
      ],
    })
    const review = await call("preflightSchema", {
      expectedRevision: rows.revision,
      change: {
        kind: "convert-field",
        fieldId,
        to: "checkbox",
        toNullable: false,
        policies: ["null-to-false"],
      },
    })
    expect(review.classification).toBe("explicit-lossy")
    expect(review.valueChanges).toContainEqual(
      expect.objectContaining({ code: "null-to-false", rows: "1" })
    )
    expect(
      JSON.parse(
        await wire.call(
          "mutateSchema",
          JSON.stringify({
            expectedRevision: rows.revision,
            planToken: review.planToken,
            actionsHash: review.actionsHash,
          }),
          JSON.stringify({ requestId: "unconfirmed" })
        )
      )
    ).toMatchObject({
      ok: false,
      error: { code: "lossy-confirmation-required" },
    })
    await call("mutateSchema", {
      expectedRevision: rows.revision,
      planToken: review.planToken,
      actionsHash: review.actionsHash,
      confirmLossy: true,
    })
    const selected = await call("queryRows", {
      tableId,
      query: {},
      projection: { fields: [fieldId], resolveRelations: [] },
      limit: 10,
    })
    expect(selected.rows.map((row) => row.values)).toEqual([[false]])
  } finally {
    await wire.close()
    database.close()
  }
})
