import { expect, vi } from "vitest"
import type { ConnectionPort } from "./adapter-contract"
import {
  ConnectionPortEidosFileConnection,
  EidosAdapterError,
} from "./connection-port"
import { Runtime } from "./runtime-service"
import type {
  RuntimeEnvironment,
  SchemaChange,
  SchemaPreflightResult,
} from "./runtime-contract"

export async function expectCheckboxConversionConformance(
  port: ConnectionPort
) {
  let now = "2026-11-15T00:00:00.000Z",
    sequence = 0
  const environment: RuntimeEnvironment = {
    clock: { nowInstant: () => now, nowMilliseconds: () => performance.now() },
    entropy: { randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)) },
  }
  const factory = {
    cancellation: { cancelled: () => false, onCancel: () => () => undefined },
  }
  let { service } = await Runtime.create(
    port,
    environment,
    { title: "Checkbox conversion" },
    factory
  )
  const sql = new ConnectionPortEidosFileConnection(port)
  const context = () => ({ requestId: `convert-${++sequence}` })
  let revision = "0"
  const preflight = (change: SchemaChange) =>
    service.preflightSchema({ expectedRevision: revision, change }, context())
  const apply = async (plan: SchemaPreflightResult, confirm = false) => {
    const result = await service.mutateSchema(
      {
        expectedRevision: revision,
        planToken: plan.planToken,
        actionsHash: plan.actionsHash,
        ...(confirm ? { confirmLossy: true as const } : {}),
      },
      context()
    )
    revision = result.revision
    return result
  }
  try {
    const created = await apply(
      await preflight({
        kind: "create-table",
        clientKey: "table",
        name: "Convert",
        position: "0",
        labelFieldClientKey: "title",
        fields: [
          { clientKey: "title", name: "Title", kind: "text", position: "0" },
          { clientKey: "flag", name: "Flag", kind: "text", position: "1" },
          { clientKey: "legacy", name: "Legacy", kind: "text", position: "2" },
        ],
      })
    )
    const id = (key: string) =>
      created.createdObjects.find(
        (o) => "clientKey" in o && o.clientKey === key
      )!.id
    const tableId = id("table"),
      flagId = id("flag"),
      titleId = id("title"),
      legacyId = id("legacy")
    const rows = await service.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: [null, "true", "false"].map((value, index) => ({
          kind: "create" as const,
          clientKey: String(index),
          values: {
            [titleId]: `Keep ${index}`,
            [flagId]: value,
            [legacyId]: value,
          },
        })),
      },
      context()
    )
    revision = rows.revision
    const rowIds = rows.created.map((row) => row.rowId)
    const before = sql.query('SELECT * FROM "Convert"')
    const ddl = sql.query(
      "SELECT sql FROM sqlite_schema WHERE name = 'Convert'"
    )
    const change = {
      kind: "convert-field" as const,
      fieldId: flagId,
      to: "checkbox" as const,
      toNullable: false,
      policies: ["null-to-false" as const],
    }
    const noPolicy = await preflight({ ...change, policies: [] })
    expect(noPolicy.classification).toBe("forbidden")
    const review = await preflight(change)
    expect(review.classification).toBe("explicit-lossy")
    expect(review.valueChanges).toContainEqual({
      code: "null-to-false",
      rows: "1",
      tableId,
      fieldId: flagId,
    })
    expect(review.warnings).toContainEqual(
      expect.objectContaining({
        code: "null-distinction-loss",
        message: "1 empty cells in this column will become unchecked.",
      })
    )
    expect(sql.query('SELECT * FROM "Convert"')).toEqual(before)
    expect(
      sql.query("SELECT sql FROM sqlite_schema WHERE name = 'Convert'")
    ).toEqual(ddl)
    await expect(apply(review)).rejects.toThrow(/confirmLossy/)
    const wrongHash = await preflight(change)
    await expect(
      service.mutateSchema(
        {
          expectedRevision: revision,
          planToken: wrongHash.planToken,
          actionsHash: "0".repeat(64),
          confirmLossy: true,
        },
        context()
      )
    ).rejects.toThrow()
    expect(sql.query('SELECT * FROM "Convert"')).toEqual(before)
    // A concurrent edit makes the retained approval unusable, with no partial DDL.
    const stale = await preflight(change)
    const edited = await service.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: [
          {
            kind: "update",
            rowId: rowIds[0]!,
            values: { [titleId]: "Concurrent" },
          },
        ],
      },
      context()
    )
    revision = edited.revision
    await expect(
      service.mutateSchema(
        {
          expectedRevision: stale.baseRevision,
          planToken: stale.planToken,
          actionsHash: stale.actionsHash,
          confirmLossy: true,
        },
        context()
      )
    ).rejects.toMatchObject({
      code: "stale-revision",
    })
    expect(sql.query('PRAGMA table_xinfo("Convert")')).toContainEqual(
      expect.objectContaining({ name: "Flag", type: "TEXT", notnull: 0 })
    )
    const view = await service.mutateView(
      {
        expectedRevision: revision,
        changes: [
          {
            kind: "create-view",
            clientKey: "view",
            tableId,
            name: "Text filter",
            type: "grid",
            position: "0",
            layout: {},
            query: { filter: { op: "eq", fieldId: flagId, value: "true" } },
          },
        ],
      },
      context()
    )
    revision = view.revision
    const blocked = await preflight(change)
    expect(blocked.classification).toBe("forbidden")
    expect(blocked.dependencies).toContainEqual({
      object: "view",
      id: view.createdViews[0]!.viewId,
    })
    const cleared = await service.mutateView(
      {
        expectedRevision: revision,
        changes: [
          {
            kind: "update-view",
            viewId: view.createdViews[0]!.viewId,
            patch: { query: {} },
          },
        ],
      },
      context()
    )
    revision = cleared.revision
    // Explicit nullable advanced conversion keeps NULL without a null policy.
    await apply(
      await preflight({
        ...change,
        fieldId: legacyId,
        toNullable: true,
        policies: [],
      })
    )
    expect(
      sql
        .query<{ Legacy: number | null }>('SELECT "Legacy" FROM "Convert"')
        .map((row) => row.Legacy)
    ).toEqual([null, 1, 0])
    const rollback = await preflight({
      kind: "batch",
      changes: [
        change,
        {
          kind: "create-field",
          tableId,
          field: {
            clientKey: "bad",
            name: "Required",
            kind: "text",
            position: "4",
            nullable: false,
          },
        },
      ],
    })
    expect(rollback.classification).toBe("forbidden")
    await expect(apply(rollback, true)).rejects.toMatchObject({
      code: "forbidden",
    })
    expect(
      sql
        .query<{ Flag: string | null }>('SELECT "Flag" FROM "Convert"')
        .map((row) => row.Flag)
    ).toEqual([null, "true", "false"])
    now = "2026-11-15T00:01:00.000Z"
    const beforeFailure = sql.query('SELECT * FROM "Convert"')
    const failurePlan = await preflight(change)
    const exec = port.execSchema.bind(port)
    const failure = vi
      .spyOn(port, "execSchema")
      .mockImplementation((statement) => {
        if (statement.startsWith('CREATE TABLE "eidos__rebuild_table__'))
          throw new EidosAdapterError("constraint", "synthetic rebuild failure")
        exec(statement)
      })
    try {
      await expect(apply(failurePlan, true)).rejects.toThrow()
    } finally {
      failure.mockRestore()
    }
    expect(sql.query('SELECT * FROM "Convert"')).toEqual(beforeFailure)
    expect(sql.query('PRAGMA table_xinfo("Convert")')).toContainEqual(
      expect.objectContaining({ name: "Flag", type: "TEXT", notnull: 0 })
    )
    await apply(await preflight(change), true)
    expect(
      sql.query(
        'SELECT "Flag", "Legacy", "Title", "_updated_at" FROM "Convert"'
      )
    ).toEqual([
      { Flag: 0, Legacy: null, Title: "Concurrent", _updated_at: now },
      { Flag: 1, Legacy: 1, Title: "Keep 1", _updated_at: now },
      { Flag: 0, Legacy: 0, Title: "Keep 2", _updated_at: now },
    ])
    expect(sql.query('PRAGMA table_xinfo("Convert")')).toContainEqual(
      expect.objectContaining({
        name: "Flag",
        type: "INTEGER",
        notnull: 1,
        dflt_value: "0",
      })
    )
    expect(
      sql.query(
        "SELECT id FROM eidos__fields WHERE table_id = ? AND name = 'Flag'",
        [tableId]
      )
    ).toEqual([{ id: flagId }])
    // Same-kind advanced conversion uses the same policy, without a second repair path.
    await apply(await preflight({ ...change, fieldId: legacyId }), true)
    expect(
      sql
        .query<{ Legacy: number | null }>('SELECT "Legacy" FROM "Convert"')
        .map((row) => row.Legacy)
    ).toEqual([0, 1, 0])
    await service.close(context())
    ;({ service } = await Runtime.open(port, environment, "readwrite", factory))
    const reopened = await service.getRowsById(
      {
        tableId,
        rowIds,
        projection: { fields: [flagId, legacyId], resolveRelations: [] },
      },
      context()
    )
    expect(reopened.rows.map((row) => row.values)).toEqual([
      [false, false],
      [true, true],
      [false, false],
    ])
    const nonnull = await apply(
      await preflight({
        kind: "create-table",
        clientKey: "no-null",
        name: "NoNulls",
        position: "1",
        labelFieldClientKey: "flag",
        fields: [
          { clientKey: "flag", name: "Flag", kind: "text", position: "0" },
        ],
      })
    )
    const nonnullTable = nonnull.createdObjects.find(
      (object) => object.object === "table"
    )!.id
    const nonnullField = nonnull.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === "flag"
    )!.id
    const nonnullRows = await service.mutateRows(
      {
        tableId: nonnullTable,
        expectedRevision: revision,
        changes: ["true", "false"].map((value, index) => ({
          kind: "create" as const,
          clientKey: String(index),
          values: { [nonnullField]: value },
        })),
      },
      context()
    )
    revision = nonnullRows.revision
    const noLoss = await preflight({ ...change, fieldId: nonnullField })
    expect(noLoss.classification).toBe("lossless-rewrite")
    expect(
      noLoss.valueChanges.some((change) => change.code === "null-to-false")
    ).toBe(false)
    await apply(noLoss)
    expect(sql.query('PRAGMA table_xinfo("NoNulls")')).toContainEqual(
      expect.objectContaining({ name: "Flag", notnull: 1, dflt_value: "0" })
    )
    const bad = await apply(
      await preflight({
        kind: "create-field",
        tableId: nonnullTable,
        field: {
          clientKey: "bad",
          name: "Invalid",
          kind: "text",
          position: "1",
        },
      })
    )
    const badId = bad.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === "bad"
    )!.id
    const invalidRow = await service.mutateRows(
      {
        tableId: nonnullTable,
        expectedRevision: revision,
        changes: [
          {
            kind: "update",
            rowId: nonnullRows.created[0]!.rowId,
            values: { [badId]: "maybe" },
          },
        ],
      },
      context()
    )
    revision = invalidRow.revision
    expect(
      (await preflight({ ...change, fieldId: badId })).classification
    ).toBe("forbidden")
    expect(
      sql
        .query<{ Invalid: string | null }>('SELECT "Invalid" FROM "NoNulls"')
        .map((row) => row.Invalid)
    ).toEqual(["maybe", null])
  } finally {
    await service.close(context())
  }
}
