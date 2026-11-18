import { expect } from "vitest"
import type { FilterNode, RuntimeService } from "./runtime-contract"

/** Observed Notion endpoints, expressed independently of the bounds implementation. */
export async function expectCalendarWindowConformance(
  runtime: RuntimeService,
  setReference: (value: string) => void
) {
  let sequence = 0
  const ctx = () => ({ requestId: `window-${sequence++}` })
  const reference = "2026-11-15T01:15:00.000Z"
  const calendar = {
    timeZone: "Asia/Shanghai",
    timeZoneData: "2026f",
    weekStartsOn: 1 as const,
  }
  setReference(reference)
  const before = await runtime.getSnapshot({}, ctx())
  const plan = await runtime.preflightSchema(
    {
      expectedRevision: before.revision,
      change: {
        kind: "create-table",
        clientKey: "windows",
        name: "Relative windows",
        position: "9999",
        labelFieldClientKey: "label",
        fields: [
          { clientKey: "label", name: "Label", kind: "text", position: "0" },
          { clientKey: "date", name: "Date", kind: "date", position: "1" },
          {
            clientKey: "instant",
            name: "Instant",
            kind: "datetime",
            position: "2",
          },
        ],
      },
    },
    ctx()
  )
  const created = await runtime.mutateSchema(
    {
      expectedRevision: before.revision,
      planToken: plan.planToken,
      actionsHash: plan.actionsHash,
    },
    ctx()
  )
  const id = (key: string) =>
    created.createdObjects.find(
      (item) => "clientKey" in item && item.clientKey === key
    )!.id
  const tableId = id("windows"),
    label = id("label"),
    date = id("date"),
    instant = id("instant")
  const dates = [
    "2025-11-14",
    "2025-11-15",
    "2026-09-14",
    "2026-09-15",
    "2026-10-14",
    "2026-10-15",
    "2026-11-01",
    "2026-11-07",
    "2026-11-08",
    "2026-11-09",
    "2026-11-13",
    "2026-11-14",
    "2026-11-15",
    "2026-11-16",
    "2026-11-17",
    "2026-11-22",
    "2026-11-23",
    "2026-11-30",
    "2026-12-15",
    "2026-12-16",
    "2026-12-31",
    "2027-11-15",
    "2027-11-16",
  ]
  const rows = await runtime.mutateRows(
    {
      tableId,
      expectedRevision: created.revision,
      changes: dates.map((day, index) => ({
        kind: "create" as const,
        clientKey: `d${index}`,
        values: {
          [label]: day,
          [date]: day,
          [instant]: `${day}T15:00:00.000Z`,
        },
      })),
    },
    ctx()
  )
  const vectors = [
    ["this", "day", 1, "2026-11-15", "2026-11-15"],
    ["this", "week", 1, "2026-11-09", "2026-11-15"],
    ["this", "month", 1, "2026-11-01", "2026-11-30"],
    ["this", "year", 1, "2026-01-01", "2026-12-31"],
    ["past", "day", 1, "2026-11-14", "2026-11-15"],
    ["next", "day", 1, "2026-11-15", "2026-11-16"],
    ["past", "week", 1, "2026-11-08", "2026-11-15"],
    ["next", "week", 1, "2026-11-15", "2026-11-22"],
    ["past", "month", 1, "2026-10-15", "2026-11-15"],
    ["next", "month", 1, "2026-11-15", "2026-12-15"],
    ["past", "year", 1, "2025-11-15", "2026-11-15"],
    ["next", "year", 1, "2026-11-15", "2027-11-15"],
    ["past", "month", 2, "2026-09-15", "2026-11-15"],
    ["next", "day", 2, "2026-11-15", "2026-11-17"],
  ] as const
  const projection = { fields: [label], resolveRelations: [] }
  for (const [direction, unit, count, start, end] of vectors)
    for (const fieldId of [date, instant]) {
      const filter: FilterNode =
        direction === "this"
          ? { op: "calendar-period", fieldId, unit, offset: 0 }
          : { op: "calendar-window", fieldId, direction, unit, count }
      const page = await runtime.queryRows(
        {
          tableId,
          calendar,
          query: { filter, sort: [{ fieldId: label, direction: "asc" }] },
          projection,
          limit: 100,
        },
        ctx()
      )
      expect(
        page.rows.map((row) => row.values[0]),
        `${direction} ${count} ${unit} / ${fieldId}`
      ).toEqual(dates.filter((day) => day >= start && day <= end))
      expect(page.referenceInstant).toBe(reference)
      expect(page.total).toBe(String(page.rows.length))
    }
  const filter: FilterNode = {
    op: "calendar-window",
    fieldId: date,
    direction: "past",
    count: 1,
    unit: "week",
  }
  const query = {
    filter,
    sort: [{ fieldId: label, direction: "asc" as const }],
  }
  const first = await runtime.queryRows(
    { tableId, calendar, query, projection, limit: 1 },
    ctx()
  )
  setReference("2026-11-16T01:15:00.000Z")
  const second = await runtime.queryRows(
    {
      tableId,
      calendar,
      query,
      projection,
      limit: 1,
      cursor: first.nextCursor!,
    },
    ctx()
  )
  expect(second.referenceInstant).toBe(reference)
  expect(second.total).toBe(first.total)
  await expect(
    runtime.queryRows(
      {
        tableId,
        calendar,
        query: { ...query, filter: { ...filter, count: 2 } },
        projection,
        limit: 1,
        cursor: first.nextCursor!,
      },
      ctx()
    )
  ).rejects.toMatchObject({ code: "invalid-query" })
  const aggregate = await runtime.aggregate(
    {
      tableId,
      calendar,
      referenceInstant: reference,
      query,
      items: [{ key: "count", op: "count-all" }],
    },
    ctx()
  )
  expect(aggregate.results[0]).toMatchObject({ value: first.total })
  const pages = await runtime.queryRowPages!(
    {
      tableId,
      calendar,
      referenceInstant: reference,
      queries: [query, query],
      projection,
      limit: 100,
    },
    ctx()
  )
  expect(pages.map((page) => [page.total, page.referenceInstant])).toEqual([
    [first.total, reference],
    [first.total, reference],
  ])
  const groups = await runtime.groupRows(
    {
      tableId,
      calendar,
      referenceInstant: reference,
      query,
      groupBy: [label],
      aggregates: [],
      projection,
      groupLimit: 100,
      rowsPerGroup: 1,
    },
    ctx()
  )
  expect(groups.referenceInstant).toBe(reference)
  const neighbors = await runtime.getRecordNeighbors(
    {
      tableId,
      calendar,
      referenceInstant: reference,
      query,
      rowId: first.rows[0]!.id,
    },
    ctx()
  )
  expect(neighbors).toMatchObject({ found: true, nextId: second.rows[0]!.id })
  if (runtime.exportCsv) {
    const exported = await runtime.exportCsv(
      {
        tableId,
        calendar,
        referenceInstant: reference,
        query,
        fields: [label],
        includeHeader: false,
      },
      ctx()
    )
    expect(
      String.fromCharCode(...exported.csv)
        .trim()
        .split(/\r?\n/u)
    ).toEqual(dates.filter((day) => day >= "2026-11-08" && day <= "2026-11-15"))
  }
  expect((await runtime.getSnapshot({}, ctx())).schemaCounts.features).toBe(
    before.schemaCounts.features
  )
  const saved = await runtime.mutateView(
    {
      expectedRevision: rows.revision,
      calendarQueryVersion: 2,
      calendarWindowVersion: 1,
      changes: [
        {
          kind: "create-view",
          clientKey: "window-view",
          tableId,
          name: "Past week",
          type: "grid",
          query,
          layout: {},
          position: "1",
        },
      ],
    },
    ctx()
  )
  expect(BigInt(saved.revision)).toBe(BigInt(rows.revision) + 1n)
  const viewId = saved.createdViews[0]!.viewId
  const schemaFirst = await runtime.getSchemaPage(
    {
      revision: saved.revision,
      calendarQueryVersion: 2,
      calendarWindowVersion: 1,
      limit: 1,
    },
    ctx()
  )
  await expect(
    runtime.getSchemaPage(
      {
        revision: saved.revision,
        calendarQueryVersion: 2,
        limit: 1,
        cursor: schemaFirst.nextCursor!,
      },
      ctx()
    )
  ).rejects.toMatchObject({ code: "invalid-query" })
  const read = async (window?: 1) =>
    runtime.getSchemaPage(
      {
        revision: saved.revision,
        calendarQueryVersion: 2,
        ...(window ? { calendarWindowVersion: window } : {}),
        limit: 100,
      },
      ctx()
    )
  const opaque = (await read()).objects.find(
    (item) => item.object === "view" && item.id === viewId
  )!
  expect(opaque).toMatchObject({
    queryStatus: "unsupported",
    query: { filter: { op: "and", args: [filter] }, sort: query.sort },
  })
  expect(
    (await read(1)).objects.find(
      (item) => item.object === "view" && item.id === viewId
    )
  ).toMatchObject({
    queryStatus: "supported",
    query: (opaque as { query: unknown }).query,
  })
  await expect(
    runtime.mutateView(
      {
        expectedRevision: saved.revision,
        calendarQueryVersion: 2,
        changes: [{ kind: "update-view", viewId, patch: { query: {} } }],
      },
      ctx()
    )
  ).rejects.toMatchObject({ code: "unsupported" })
  const renamed = await runtime.mutateView(
    {
      expectedRevision: saved.revision,
      changes: [{ kind: "update-view", viewId, patch: { name: "Renamed" } }],
    },
    ctx()
  )
  const updated = await runtime.mutateView(
    {
      expectedRevision: renamed.revision,
      calendarQueryVersion: 2,
      calendarWindowVersion: 1,
      changes: [{ kind: "update-view", viewId, patch: { query: {} } }],
    },
    ctx()
  )
  expect((await runtime.getSnapshot({}, ctx())).schemaCounts.features).toBe(
    String(
      Number(before.schemaCounts.features) +
        (before.schemaCounts.features === "0" ? 2 : 1)
    )
  )
  expect(
    (
      await runtime.validate({ level: "full", diagnosticsLimit: 100 }, ctx())
    ).diagnostics.filter((item) => item.severity === "error")
  ).toEqual([])
  return updated.revision
}
