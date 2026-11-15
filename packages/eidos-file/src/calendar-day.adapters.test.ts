import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import { Runtime } from "./runtime-service"
import { expectCalendarDayQueryConformance } from "./calendar-day.conformance"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import { NodeSqliteConnectionPort } from "./node-sqlite"
import type {
  RowQuery,
  QueryRowsRequest,
  RequestContext,
  RuntimeEnvironment,
} from "./runtime-contract"
import type { ConnectionPort } from "./adapter-contract"

const context = (requestId: string) => ({
  requestId,
  deadlineMilliseconds: 30_000,
})
const probe = new DatabaseSync(":memory:")
const supportsNodeSqlite =
  "serialize" in probe &&
  "limits" in probe &&
  typeof probe.setAuthorizer === "function"
probe.close()
async function run(adapter: string) {
  let port: ConnectionPort
  if (adapter === "wasm") {
    Object.defineProperty(globalThis, "self", {
      configurable: true,
      value: globalThis,
    })
    const { default: initialize } = await import("@sqlite.org/sqlite-wasm")
    const packageJson = createRequire(
      new URL("../package.json", import.meta.url)
    ).resolve("@sqlite.org/sqlite-wasm/package.json")
    const wasmBinary = await readFile(
      join(dirname(packageJson), "sqlite-wasm/jswasm/sqlite3.wasm")
    )
    const sqlite = await initialize({
      print: () => {},
      printErr: () => {},
      wasmBinary,
    } as Parameters<typeof initialize>[0] & { wasmBinary: Uint8Array })
    port = new SQLiteWasmConnectionPort(
      new sqlite.oo1.DB(":memory:", "c"),
      sqlite
    )
  } else {
    const { DatabaseSync } = await import("node:sqlite")
    const database = new DatabaseSync(":memory:")
    port = new NodeSqliteConnectionPort(database)
  }
  let entropy = 0
  let tick = 0
  let reference = "2026-11-12T12:30:00.000Z"
  let advanceDuringRoot = false
  let rootClockCalls = 0
  const environment: RuntimeEnvironment = {
    clock: {
      nowInstant: () =>
        advanceDuringRoot
          ? rootClockCalls++ === 0
            ? "2026-11-12T12:30:00.000Z"
            : "2026-11-13T12:30:00.000Z"
          : reference,
      nowMilliseconds: () => ++tick,
    },
    entropy: {
      randomBytes: (length) =>
        Uint8Array.from({ length }, () => entropy++ & 255),
    },
  }
  const binding = await Runtime.create(
    port,
    environment,
    { title: "t08 synthetic baseline" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => {} },
    }
  )
  let runtime = binding.service
  const execution = {
    timeZone: "Asia/Shanghai",
    timeZoneData: "2026f",
    weekStartsOn: 1 as const,
  }
  const queryRows = (request: QueryRowsRequest, ctx: RequestContext) =>
    runtime.queryRows({ calendar: execution, ...request }, ctx)
  try {
    const plan = await runtime.preflightSchema(
      {
        expectedRevision: "0",
        change: {
          kind: "create-table",
          clientKey: "records",
          name: "Records",
          position: "0",
          labelFieldClientKey: "title",
          fields: [
            { clientKey: "title", name: "Title", kind: "text", position: "0" },
            { clientKey: "day", name: "Day", kind: "date", position: "1" },
            {
              clientKey: "instant",
              name: "Instant",
              kind: "datetime",
              position: "2",
            },
            {
              clientKey: "formula-day",
              name: "Formula Day",
              kind: "formula",
              position: "3",
              definition: { sourceText: '"Day"', resultType: "date" },
            },
          ],
        },
      },
      context("preflight")
    )
    const schema = await runtime.mutateSchema(
      {
        expectedRevision: "0",
        planToken: plan.planToken,
        actionsHash: plan.actionsHash,
      },
      context("schema")
    )
    const id = (key: string) =>
      schema.createdObjects.find(
        (x) => "clientKey" in x && x.clientKey === key
      )!.id
    const tableId = id("records")
    const title = id("title")
    const day = id("day")
    const instant = id("instant")
    await runtime.mutateRows(
      {
        tableId,
        expectedRevision: schema.revision,
        changes: [
          {
            kind: "create",
            clientKey: "today",
            values: {
              [title]: "today-midnight",
              [day]: "2026-11-12",
              [instant]: "2026-11-11T16:00:00.000Z",
            },
          },
          {
            kind: "create",
            clientKey: "tomorrow",
            values: {
              [title]: "tomorrow-0200",
              [day]: "2026-11-13",
              [instant]: "2026-11-12T18:00:00.000Z",
            },
          },
        ],
      },
      context("rows")
    )
    const results: Record<string, unknown> = {}
    for (const [kind, fieldId] of [
      ["date", day],
      ["datetime", instant],
    ]) {
      const page = await queryRows(
        {
          tableId,
          query: {
            filter: {
              op: "calendar-period",
              fieldId,
              unit: "day",
              offset: 0,
            },
          },
          projection: { fields: [title, day, instant], resolveRelations: [] },
          limit: 20,
        },
        context(kind)
      )
      results[kind] = page.rows.map((row) => row.values)
    }
    expect(results.date).toEqual([
      ["today-midnight", "2026-11-12", "2026-11-11T16:00:00.000Z"],
    ])
    expect(results.datetime).toEqual([
      ["today-midnight", "2026-11-12", "2026-11-11T16:00:00.000Z"],
    ])
    const calendar = {
      op: "calendar-period" as const,
      fieldId: instant,
      unit: "day" as const,
      offset: 0 as const,
    }
    const query = {
      filter: calendar,
      sort: [{ fieldId: title, direction: "asc" as const }],
    }
    const projection = { fields: [title, day, instant], resolveRelations: [] }
    const revision = (await runtime.getSnapshot({}, context("before-extra")))
      .revision
    await runtime.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: [
          {
            kind: "create",
            clientKey: "midday",
            values: {
              [title]: "midday",
              [day]: "2026-11-12",
              [instant]: "2026-11-12T04:00:00.123Z",
            },
          },
          {
            kind: "create",
            clientKey: "end",
            values: {
              [title]: "at-end",
              [day]: "2026-11-12",
              [instant]: "2026-11-12T15:59:59.999Z",
            },
          },
          {
            kind: "create",
            clientKey: "upper",
            values: {
              [title]: "at-upper",
              [day]: "2026-11-13",
              [instant]: "2026-11-12T16:00:00.000Z",
            },
          },
          {
            kind: "create",
            clientKey: "before",
            values: {
              [title]: "before",
              [day]: "2026-11-11",
              [instant]: "2026-11-11T15:59:59.999Z",
            },
          },
          {
            kind: "create",
            clientKey: "range",
            values: {
              [title]: "outside-profile",
              [day]: "1800-01-01",
              [instant]: "1800-01-01T00:00:00.000Z",
            },
          },
          { kind: "create", clientKey: "null", values: { [title]: "null" } },
        ],
      },
      context("extra-rows")
    )
    const all = await queryRows(
      { tableId, query, projection, limit: 20 },
      context("boundaries")
    )
    expect(all.rows.map((row) => row.values[0])).toEqual([
      "at-end",
      "midday",
      "today-midnight",
    ])
    advanceDuringRoot = true
    rootClockCalls = 0
    const oneRoot = await queryRows(
      {
        tableId,
        query: {
          filter: {
            op: "and",
            args: [calendar, { ...calendar, fieldId: day }],
          },
        },
        projection,
        limit: 20,
      },
      context("one-reference")
    )
    expect(oneRoot.rows).toHaveLength(3)
    expect(rootClockCalls).toBe(1)
    rootClockCalls = 0
    const batch = await runtime.queryRowPages!(
      {
        tableId,
        calendar: execution,
        queries: [query, { filter: { ...calendar, fieldId: day } }],
        projection,
        limit: 20,
      },
      context("batch-root")
    )
    expect(
      batch.map((page) => [page.total, page.referenceInstant, page.rows.length])
    ).toEqual([
      ["3", "2026-11-12T12:30:00.000Z", 3],
      ["3", "2026-11-12T12:30:00.000Z", 3],
    ])
    expect(rootClockCalls).toBe(1)
    advanceDuringRoot = false
    const first = await queryRows(
      { tableId, query, projection, limit: 1 },
      context("first")
    )
    expect(first.nextCursor).toBeTruthy()
    expect(first.referenceInstant).toBe("2026-11-12T12:30:00.000Z")
    reference = "2026-11-13T12:30:00.000Z"
    const rootCount = await runtime.aggregate(
      {
        tableId,
        query,
        calendar: execution,
        referenceInstant: first.referenceInstant,
        items: [{ key: "count", op: "count-all" }],
      },
      context("same-root-count")
    )
    expect(rootCount).toMatchObject({
      referenceInstant: first.referenceInstant,
      results: [{ key: "count", value: "3" }],
    })
    const rootNeighbors = await runtime.getRecordNeighbors(
      {
        tableId,
        query,
        rowId: all.rows[1]!.id,
        calendar: execution,
        referenceInstant: first.referenceInstant,
      },
      context("same-root-neighbors")
    )
    expect(rootNeighbors).toEqual({
      found: true,
      previousId: all.rows[0]!.id,
      nextId: all.rows[2]!.id,
    })
    await expect(
      queryRows(
        {
          tableId,
          query,
          projection,
          limit: 1,
          cursor: first.nextCursor!,
          referenceInstant: reference,
        },
        context("changed-reference")
      )
    ).rejects.toMatchObject({ code: "invalid-query" })
    const next = await queryRows(
      { tableId, query, projection, limit: 1, cursor: first.nextCursor! },
      context("next")
    )
    expect(next.rows[0]!.values[0]).toBe("midday")
    expect(first.total).toBe("3")
    expect(next.total).toBe("3")
    const third = await queryRows(
      { tableId, query, projection, limit: 1, cursor: next.nextCursor! },
      context("third")
    )
    expect(third.rows[0]!.values[0]).toBe("today-midnight")
    expect(third.total).toBe("3")
    for (const [filter, calendarContext] of [
      [{ ...calendar, offset: 1 as const }, execution],
      [calendar, { ...execution, timeZone: "UTC" }],
      [calendar, { ...execution, weekStartsOn: 0 as const }],
    ] as const) {
      await expect(
        queryRows(
          {
            tableId,
            query: { ...query, filter },
            calendar: calendarContext,
            projection,
            limit: 1,
            cursor: first.nextCursor!,
          },
          context("changed-context")
        )
      ).rejects.toMatchObject({ code: "invalid-query" })
    }
    await expect(
      runtime.queryRows(
        { tableId, query, projection, limit: 1 },
        context("missing-context")
      )
    ).rejects.toMatchObject({ code: "invalid-query" })
    await expect(
      runtime.queryRows(
        {
          tableId,
          query,
          calendar: { ...execution, timeZoneData: "unavailable" },
          projection,
          limit: 20,
        },
        context("unavailable")
      )
    ).rejects.toMatchObject({ code: "unsupported" })
    for (const invalid of [
      { ...execution, timeZone: "system" },
      { ...execution, timeZone: "Not/A_Zone" },
      { ...execution, weekStartsOn: 2 },
      { ...execution, timeZoneData: "2026f", extra: true },
    ]) {
      await expect(
        queryRows(
          {
            tableId,
            query,
            projection,
            limit: 20,
            calendar: invalid as typeof execution,
          },
          context("invalid-execution")
        )
      ).rejects.toMatchObject({ code: "invalid-query" })
    }
    await expect(
      queryRows(
        {
          tableId,
          query: {
            filter: { ...calendar, timeZone: "UTC" },
          } as RowQuery,
          projection,
          limit: 20,
        },
        context("frozen-zone-in-leaf")
      )
    ).rejects.toMatchObject({ code: "invalid-query" })
    expect(
      (
        await queryRows(
          { tableId, query, projection, limit: 20 },
          context("new-root")
        )
      ).rows
    ).toHaveLength(2)
    reference = "2026-11-12T12:30:00.000Z"
    const counted = await runtime.aggregate(
      {
        tableId,
        calendar: execution,
        query,
        items: [
          { key: "count", op: "count-all" },
          { key: "dates", op: "distinct-count", fieldId: day },
        ],
      },
      context("aggregate")
    )
    expect(counted.results).toEqual([
      { key: "count", value: "3" },
      { key: "dates", value: "1" },
    ])
    const neighbors = await runtime.getRecordNeighbors(
      { tableId, calendar: execution, query, rowId: all.rows[1]!.id },
      context("neighbors")
    )
    expect(neighbors).toEqual({
      found: true,
      previousId: all.rows[0]!.id,
      nextId: all.rows[2]!.id,
    })
    const groupRequest = {
      tableId,
      calendar: execution,
      query,
      groupBy: [title],
      aggregates: [],
      projection,
      groupLimit: 1,
      rowsPerGroup: 1,
    }
    const grouped = await runtime.groupRows(groupRequest, context("groups"))
    expect(grouped.referenceInstant).toBe("2026-11-12T12:30:00.000Z")
    reference = "2026-11-13T12:30:00.000Z"
    const nextGroup = await runtime.groupRows(
      { ...groupRequest, cursor: grouped.nextCursor! },
      context("next-group")
    )
    expect(nextGroup.groups[0]!.key).toEqual(["midday"])
    await expect(
      runtime.groupRows(
        {
          ...groupRequest,
          cursor: grouped.nextCursor!,
          calendar: { ...execution, timeZone: "UTC" },
        },
        context("changed-group-zone")
      )
    ).rejects.toMatchObject({ code: "invalid-query" })
    reference = "2026-11-12T12:30:00.000Z"
    const dayGroup = await runtime.groupRows(
      { ...groupRequest, groupBy: [day] },
      context("day-group")
    )
    reference = "2026-11-13T12:30:00.000Z"
    const remaining = await runtime.queryGroupRows(
      {
        cursor: dayGroup.groups[0]!.nextRowCursor!,
        limit: 20,
        calendar: execution,
      },
      context("group-rows")
    )
    expect(remaining.rows).toHaveLength(2)
    expect(remaining.referenceInstant).toBe("2026-11-12T12:30:00.000Z")
    await expect(
      runtime.queryGroupRows(
        {
          cursor: dayGroup.groups[0]!.nextRowCursor!,
          limit: 20,
          calendar: { ...execution, weekStartsOn: 0 },
        },
        context("changed-group-row-context")
      )
    ).rejects.toMatchObject({ code: "invalid-query" })
    expect(remaining.rows.every((row) => row.values[1] === "2026-11-12")).toBe(
      true
    )
    reference = "2026-11-12T12:30:00.000Z"
    await expect(
      queryRows(
        {
          tableId,
          query: {
            ...query,
            filter: {
              op: "relative-date",
              fieldId: instant,
              direction: "this",
              unit: "day",
            },
          },
          projection,
          limit: 20,
        },
        context("legacy-utc")
      )
    ).rejects.toMatchObject({ code: "unsupported" })
    const beforeSave = await runtime.getSnapshot({}, context("before-save"))
    expect(
      (
        await queryRows(
          {
            tableId,
            query: { filter: { ...calendar, fieldId: id("formula-day") } },
            projection,
            limit: 20,
          },
          context("formula-calendar-query")
        )
      ).total
    ).toBe("3")
    const saved = await runtime.mutateView(
      {
        expectedRevision: beforeSave.revision,
        changes: [
          {
            kind: "create-view",
            clientKey: "formula-calendar",
            tableId,
            name: "Formula Today",
            type: "grid",
            query: { filter: { ...calendar, fieldId: id("formula-day") } },
            layout: {},
            position: "2",
          },
          {
            kind: "create-view",
            clientKey: "calendar",
            tableId,
            name: "Today in Shanghai",
            type: "grid",
            query,
            layout: {},
            position: "1",
          },
        ],
      },
      context("save-view")
    )
    const viewId = saved.createdViews.find(
      (view) => view.clientKey === "calendar"
    )!.viewId
    const validation = await runtime.validate(
      { level: "full", diagnosticsLimit: 100 },
      context("calendar-views-validation")
    )
    expect(
      validation.diagnostics.filter((item) => item.severity === "error")
    ).toEqual([])
    await runtime.close(context("close-before-reopen"))
    runtime = (
      await Runtime.open(port, environment, "readwrite", {
        cancellation: { cancelled: () => false, onCancel: () => () => {} },
      })
    ).service
    const reopenedSchema = await runtime.getSchemaPage(
      { revision: saved.revision, limit: 100, calendarQueryVersion: 2 },
      context("reopen-schema")
    )
    const savedView = reopenedSchema.objects.find(
      (item) => item.object === "view" && item.id === viewId
    )
    expect(savedView).toMatchObject({
      queryStatus: "supported",
      query: { filter: { op: "and", args: [calendar] } },
    })
    expect(
      (
        await queryRows(
          { tableId, query, projection, limit: 20 },
          context("reopened")
        )
      ).rows.map((row) => row.values)
    ).toEqual(all.rows.map((row) => row.values))
    await runtime.mutateRows(
      {
        tableId,
        expectedRevision: saved.revision,
        changes: [
          {
            kind: "update",
            rowId: all.rows[0]!.id,
            values: {
              [day]: "2026-11-13",
              [instant]: "2026-11-12T16:00:00.000Z",
            },
          },
        ],
      },
      context("edit-after-reopen")
    )
    expect(
      (
        await queryRows(
          { tableId, query, projection, limit: 20 },
          context("recalculate")
        )
      ).rows.map((row) => row.values[0])
    ).toEqual(["midday", "today-midnight"])
    await expectCalendarDayQueryConformance(runtime, (instant) => {
      reference = instant
    })
  } finally {
    await runtime.close(context("close"))
    port.close()
  }
}
it(
  "selects the same local calendar day on SQLite WASM",
  () => run("wasm"),
  30_000
)
it.skipIf(!supportsNodeSqlite)(
  "selects the same local calendar day on node:sqlite",
  () => run("node-sqlite"),
  30_000
)
