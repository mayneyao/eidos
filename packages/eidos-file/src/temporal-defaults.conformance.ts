import { expect } from "vitest"
import type { ConnectionPort } from "./adapter-contract"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { EidosFileRuntime } from "./runtime"
import { Runtime } from "./runtime-service"
import type {
  LogicalValue,
  RuntimeEnvironment,
  SchemaChange,
} from "./runtime-contract"
import { validateEidosFile } from "./validation"

/** Run independently through each adapter and the canonical Runtime service. */
export async function expectTemporalDefaultsConformance(
  connection: ConnectionPort
): Promise<void> {
  let now = "2026-11-16T15:59:59.987Z"
  let sequence = 0
  let clockDrift = 0
  let advancingClock = false
  const context = () => ({
    requestId: `temporal-${++sequence}`,
    deadlineMilliseconds: 30_000,
  })
  const environment: RuntimeEnvironment = {
    clock: {
      nowInstant: () =>
        advancingClock
          ? new Date(Date.parse(now) + clockDrift++).toISOString()
          : now,
      nowMilliseconds: () => performance.now(),
    },
    entropy: {
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    },
  }
  const cancellation = {
    cancelled: () => false,
    onCancel: () => () => undefined,
  }
  let { service } = await Runtime.create(
    connection,
    environment,
    { title: "Date defaults" },
    { cancellation }
  )
  const sql = new ConnectionPortEidosFileConnection(connection)
  const core = new EidosFileRuntime(sql, false, { nowInstant: () => now })
  expect(() =>
    core.createTable({
      name: "Rejected",
      fields: [
        {
          name: "Day",
          type: "date",
          property: { defaultValue: "now", readOnly: true },
        },
      ],
    })
  ).toThrow()
  expect(core.listTables()).toHaveLength(0)
  expect(
    sql.get<{ count: number }>(
      "SELECT count(*) AS count FROM eidos__features WHERE name='eidos:temporal-defaults'"
    )!.count
  ).toBe(0)
  let revision = "0"
  const schema = async (change: SchemaChange) => {
    const plan = await service.preflightSchema(
      { expectedRevision: revision, change },
      context()
    )
    expect(plan.classification).not.toBe("forbidden")
    const result = await service.mutateSchema(
      {
        expectedRevision: revision,
        planToken: plan.planToken,
        actionsHash: plan.actionsHash,
      },
      context()
    )
    revision = result.revision
    return result
  }
  const created = await schema({
    kind: "create-table",
    clientKey: "table",
    name: "Dates",
    position: "0",
    labelFieldClientKey: "title",
    fields: [
      { clientKey: "title", name: "Title", kind: "text", position: "0" },
      {
        clientKey: "date",
        name: "Day",
        kind: "date",
        nullable: true,
        position: "1",
      },
      {
        clientKey: "instant",
        name: "Instant",
        kind: "datetime",
        nullable: true,
        position: "2",
        settings: { defaultValue: "now" },
      },
      {
        clientKey: "plain",
        name: "Plain",
        kind: "date",
        nullable: true,
        position: "3",
      },
    ],
  })
  const id = (key: string) =>
    created.createdObjects.find(
      (object) => "clientKey" in object && object.clientKey === key
    )!.id
  const tableId = id("table"),
    dateId = id("date"),
    instantId = id("instant"),
    plainId = id("plain"),
    titleId = id("title")
  const projection = {
    fields: [dateId, instantId, plainId],
    resolveRelations: [],
  }
  const zone = (timeZone: string) => ({ timeZone, timeZoneData: "2026f" })
  const create = async (
    values: Array<Record<string, LogicalValue>>,
    timeZone?: string
  ) => {
    const result = await service.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        returning: projection,
        changes: values.map((value, index) => ({
          kind: "create",
          clientKey: `row-${index}`,
          values: value,
        })),
        ...(timeZone ? { creationContext: zone(timeZone) } : {}),
      },
      context()
    )
    revision = result.revision
    return result
  }
  const old = await create([{}], "Asia/Shanghai")
  expect(old.returnedRows!.rows[0]!.values).toEqual([null, now, null])
  await schema({
    kind: "set-field-settings",
    fieldId: dateId,
    settings: { defaultValue: "now" },
  })
  expect(
    sql.get<{ count: number }>(
      "SELECT count(*) AS count FROM eidos__features WHERE name='eidos:temporal-defaults' AND version='1' AND required=1 AND config_json='{}'"
    )!.count
  ).toBe(1)
  expect(core.getRow(tableId, old.created[0]!.rowId)!["Day"]).toBe(null)

  const vectors = [
    ["2026-11-16T15:59:59.987Z", "Asia/Shanghai", "2026-11-16"],
    ["2026-11-16T16:00:00.001Z", "Asia/Shanghai", "2026-11-17"],
    ["2026-11-16T16:00:00.001Z", "America/Los_Angeles", "2026-11-16"],
    ["2026-03-08T06:59:59.999Z", "America/New_York", "2026-03-08"],
    ["2026-03-08T07:00:00.000Z", "America/New_York", "2026-03-08"],
    ["2026-11-01T05:30:00.123Z", "America/New_York", "2026-11-01"],
    ["2026-11-01T06:30:00.123Z", "America/New_York", "2026-11-01"],
  ]
  for (const [instant, timeZone, day] of vectors) {
    now = instant!
    clockDrift = 0
    advancingClock = true
    const result = await create([{}, {}], timeZone)
    advancingClock = false
    expect(result.returnedRows!.rows.map((row) => row.values)).toEqual([
      [day, instant, null],
      [day, instant, null],
    ])
  }
  const noUi = await create([{}])
  expect(noUi.returnedRows!.rows[0]!.values).toEqual([
    now.slice(0, 10),
    now,
    null,
  ])
  const explicit = await create(
    [
      { [dateId]: "2000-02-29", [instantId]: "2000-02-29T12:34:56.789Z" },
      { [dateId]: null, [instantId]: null },
    ],
    "Asia/Shanghai"
  )
  expect(explicit.returnedRows!.rows.map((row) => row.values)).toEqual([
    ["2000-02-29", "2000-02-29T12:34:56.789Z", null],
    [null, null, null],
  ])
  const updated = await service.mutateRows(
    {
      tableId,
      expectedRevision: revision,
      returning: projection,
      changes: [
        {
          kind: "update",
          rowId: explicit.created[1]!.rowId,
          values: { [titleId]: "still null" },
        },
      ],
    },
    context()
  )
  revision = updated.revision
  expect(updated.returnedRows!.rows[0]!.values).toEqual([null, null, null])
  const cleared = await service.mutateRows(
    {
      tableId,
      expectedRevision: revision,
      returning: projection,
      changes: [
        {
          kind: "update",
          rowId: explicit.created[0]!.rowId,
          values: { [dateId]: null, [instantId]: null },
        },
      ],
    },
    context()
  )
  revision = cleared.revision
  expect(cleared.returnedRows!.rows[0]!.values).toEqual([null, null, null])

  // Imported omissions/null are historical values, never ordinary creates.
  const imported = core.insertImportedRows(tableId, [
    {},
    { Day: null, Instant: null },
    { Day: "1999-12-31", Instant: "1999-12-31T23:59:59.001Z" },
  ])
  expect(imported.map((row) => [row.Day, row.Instant])).toEqual([
    [null, null],
    [null, null],
    ["1999-12-31", "1999-12-31T23:59:59.001Z"],
  ])
  revision = String(core.info().revision)
  // Direct core creates use the same evaluator, including context and explicit null.
  const direct = core.insertRow(tableId, {}, zone("Asia/Shanghai"))
  expect([direct.Day, direct.Instant]).toEqual(["2026-11-01", now])
  const directNull = core.insertRow(tableId, { Day: null, Instant: null })
  expect([directNull.Day, directNull.Instant]).toEqual([null, null])
  const removal = core.deleteRowsReversible(tableId, [
    String(direct._id),
    String(directNull._id),
  ])
  now = "2026-11-10T00:00:00.000Z"
  core.revertRowMutation(removal.undoToken!)
  expect(core.getRow(tableId, String(direct._id))).toEqual({
    ...direct,
    _updated_at: now,
  })
  expect(core.getRow(tableId, String(directNull._id))).toEqual({
    ...directNull,
    _updated_at: now,
  })
  revision = String(core.info().revision)

  // Force a physical NOT NULL failure after the first insert to prove rollback.
  const rollback = await schema({
    kind: "create-table",
    clientKey: "rollback",
    name: "Rollback",
    position: "1",
    labelFieldClientKey: "required",
    fields: [
      {
        clientKey: "required",
        name: "Required",
        kind: "date",
        nullable: false,
        position: "0",
        settings: { defaultValue: "now" },
      },
    ],
  })
  const rollbackId = rollback.createdObjects.find(
    (object) => "clientKey" in object && object.clientKey === "rollback"
  )!.id
  expect(() =>
    core.mutateRows({
      tableId: rollbackId,
      insert: [{ fields: {} }, { fields: { Required: null } }],
      creationContext: zone("Asia/Shanghai"),
    })
  ).toThrow()
  expect(core.countRows(rollbackId)).toBe(0)
  expect(String(core.info().revision)).toBe(revision)

  // Invalid settings and unsupported profiles never partially install or write.
  const before = String(core.info().revision)
  expect(() =>
    core.updateField(tableId, titleId, { property: { defaultValue: "now" } })
  ).toThrow()
  expect(() =>
    core.updateField(tableId, dateId, {
      property: { defaultValue: "tomorrow" },
    })
  ).toThrow()
  expect(() =>
    core.insertRow(tableId, {}, { timeZone: "UTC", timeZoneData: "future" })
  ).toThrow()
  const system = core
    .listFields(tableId)
    .find((field) => field.systemRole === "created-time")!
  expect(() =>
    core.updateField(tableId, system.id!, { property: { defaultValue: "now" } })
  ).toThrow()
  expect(() => core.insertRow(tableId, { [system.id!]: now })).toThrow()
  expect(String(core.info().revision)).toBe(before)

  const negotiation = await service.negotiate(
    { protocol: "eidos-runtime", versions: ["1.0"] },
    context()
  )
  expect(negotiation.capabilities.temporalDefaultsVersion).toBe(1)
  service = (
    await Runtime.open(connection, environment, "readwrite", { cancellation })
  ).service
  now = "2026-11-18T01:02:03.456Z"
  const reopened = await create([{}], "Asia/Shanghai")
  expect(reopened.returnedRows!.rows[0]!.values).toEqual([
    "2026-11-18",
    now,
    null,
  ])
  sql.run("DELETE FROM eidos__features WHERE name='eidos:temporal-defaults'")
  expect(validateEidosFile(sql, { level: "semantic" }).valid).toBe(false)
  sql.run(
    "INSERT INTO eidos__features VALUES ('eidos:temporal-defaults','1',1,'{}')"
  )
  await schema({
    kind: "set-field-settings",
    fieldId: dateId,
    settings: { defaultValue: null },
  })
  await schema({
    kind: "set-field-settings",
    fieldId: instantId,
    settings: { defaultValue: null },
  })
  service = (
    await Runtime.open(connection, environment, "readwrite", { cancellation })
  ).service
  expect((await create([{}])).returnedRows!.rows[0]!.values).toEqual([
    null,
    null,
    null,
  ])
  expect(core.getRow(tableId, reopened.created[0]!.rowId)!.Instant).toBe(
    "2026-11-18T01:02:03.456Z"
  )
  expect(validateEidosFile(sql, { level: "semantic" }).valid).toBe(true)

  // A missing/malformed feature is invalid; an unknown required version fails open.
  sql.run(
    "UPDATE eidos__features SET version='99' WHERE name='eidos:temporal-defaults'"
  )
  await expect(
    Runtime.open(connection, environment, "readwrite", { cancellation })
  ).rejects.toThrow(/temporal defaults feature/)
  sql.run(
    "UPDATE eidos__features SET version='1' WHERE name='eidos:temporal-defaults'"
  )
}
