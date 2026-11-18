import { expect } from "vitest"
import { projectEidosFileCalendarInstant } from "./calendar-day"
import type { RuntimeService } from "./runtime-contract"

/** Fixed normative vectors shared by WASM, node:sqlite and native QuickJS. */
const vectors = [
  [
    "Asia/Shanghai",
    "2026-11-12T12:30:00.000Z",
    "today",
    "2026-11-12",
    "2026-11-11T16:00:00.000Z",
    "2026-11-12T16:00:00.000Z",
  ],
  [
    "Asia/Shanghai",
    "2026-11-11T16:30:00.000Z",
    "today",
    "2026-11-12",
    "2026-11-11T16:00:00.000Z",
    "2026-11-12T16:00:00.000Z",
  ],
  [
    "Asia/Shanghai",
    "2026-11-12T12:30:00.000Z",
    "tomorrow",
    "2026-11-13",
    "2026-11-12T16:00:00.000Z",
    "2026-11-13T16:00:00.000Z",
  ],
  [
    "Asia/Shanghai",
    "2026-11-13T12:30:00.000Z",
    "yesterday",
    "2026-11-12",
    "2026-11-11T16:00:00.000Z",
    "2026-11-12T16:00:00.000Z",
  ],
  [
    "UTC",
    "2026-11-12T12:30:00.000Z",
    "today",
    "2026-11-12",
    "2026-11-12T00:00:00.000Z",
    "2026-11-13T00:00:00.000Z",
  ],
  [
    "America/New_York",
    "2026-11-12T02:30:00.000Z",
    "today",
    "2026-11-11",
    "2026-11-11T05:00:00.000Z",
    "2026-11-12T05:00:00.000Z",
  ],
  [
    "Asia/Kathmandu",
    "2026-11-12T12:30:00.000Z",
    "today",
    "2026-11-12",
    "2026-11-11T18:15:00.000Z",
    "2026-11-12T18:15:00.000Z",
  ],
  [
    "Pacific/Kiritimati",
    "2026-11-12T12:30:00.000Z",
    "today",
    "2026-11-13",
    "2026-11-12T10:00:00.000Z",
    "2026-11-13T10:00:00.000Z",
  ],
  [
    "America/New_York",
    "2026-03-08T12:30:00.000Z",
    "today",
    "2026-03-08",
    "2026-03-08T05:00:00.000Z",
    "2026-03-09T04:00:00.000Z",
  ],
  [
    "America/New_York",
    "2026-11-01T12:30:00.000Z",
    "today",
    "2026-11-01",
    "2026-11-01T04:00:00.000Z",
    "2026-11-02T05:00:00.000Z",
  ],
  [
    "Australia/Lord_Howe",
    "2026-10-04T12:30:00.000Z",
    "today",
    "2026-10-04",
    "2026-10-03T13:30:00.000Z",
    "2026-10-04T13:00:00.000Z",
  ],
  [
    "Africa/Casablanca",
    "2026-11-16T12:30:00.000Z",
    "today",
    "2026-11-16",
    "2026-11-16T00:00:00.000Z",
    "2026-11-17T00:00:00.000Z",
  ],
] as const

export async function expectCalendarDayQueryConformance(
  runtime: RuntimeService,
  setReference: (instant: string) => void
): Promise<void> {
  let sequence = 0
  const context = () => ({
    requestId: `calendar-conformance-${sequence++}`,
    deadlineMilliseconds: 30_000,
  })
  setReference(vectors[0][1])
  const before = await runtime.getSnapshot({}, context())
  const plan = await runtime.preflightSchema(
    {
      expectedRevision: before.revision,
      change: {
        kind: "create-table",
        clientKey: "calendar-conformance",
        name: "Calendar query conformance",
        position: "999",
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
    context()
  )
  const schema = await runtime.mutateSchema(
    {
      expectedRevision: before.revision,
      planToken: plan.planToken,
      actionsHash: plan.actionsHash,
    },
    context()
  )
  const id = (key: string) =>
    schema.createdObjects.find(
      (item) => "clientKey" in item && item.clientKey === key
    )!.id
  const tableId = id("calendar-conformance"),
    label = id("label"),
    date = id("date"),
    instant = id("instant")
  let revision = schema.revision
  for (const [
    index,
    [timeZone, reference, day, target, start, end],
  ] of vectors.entries()) {
    setReference(reference)
    const prefix = `case-${index}-`
    const samples = [
      new Date(Date.parse(start) - 1).toISOString(),
      start,
      new Date(Date.parse(end) - 1).toISOString(),
      end,
      ...(timeZone === "America/New_York" && target === "2026-11-01"
        ? ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]
        : []),
    ]
    const rows = await runtime.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: samples.map((value, sample) => {
          const p = projectEidosFileCalendarInstant(value, timeZone, "2026f")!
          const calendarDate = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
          return {
            kind: "create",
            clientKey: `sample-${sample}`,
            values: {
              [label]: prefix + sample,
              [date]: calendarDate,
              [instant]: value,
            },
          }
        }),
      },
      context()
    )
    revision = rows.revision
    const expected = [
      prefix + "1",
      prefix + "2",
      ...(samples.length > 4 ? [prefix + "4", prefix + "5"] : []),
    ]
    for (const fieldId of [date, instant]) {
      const selected = await runtime.queryRows(
        {
          tableId,
          calendar: { timeZone, timeZoneData: "2026f", weekStartsOn: 1 },
          query: {
            filter: {
              op: "and",
              args: [
                { op: "starts-with", fieldId: label, value: prefix },
                {
                  op: "calendar-period",
                  fieldId,
                  unit: "day",
                  offset: day === "yesterday" ? -1 : day === "tomorrow" ? 1 : 0,
                },
              ],
            },
            sort: [{ fieldId: label, direction: "asc" }],
          },
          projection: { fields: [label], resolveRelations: [] },
          limit: 20,
        },
        context()
      )
      expect(selected.rows.map((row) => row.values[0])).toEqual(expected)
    }
  }
  setReference("2011-12-29T12:00:00.000Z")
  const skipped = await runtime.mutateRows(
    {
      tableId,
      expectedRevision: revision,
      changes: [
        {
          kind: "create",
          clientKey: "skipped",
          values: { [label]: "skipped", [date]: "2011-12-30" },
        },
      ],
    },
    context()
  )
  for (const fieldId of [date, instant]) {
    const selected = await runtime.queryRows(
      {
        tableId,
        calendar: {
          timeZone: "Pacific/Apia",
          timeZoneData: "2026f",
          weekStartsOn: 1,
        },
        query: {
          filter: {
            op: "calendar-period",
            fieldId,
            unit: "day",
            offset: 1,
          },
        },
        projection: { fields: [label], resolveRelations: [] },
        limit: 20,
      },
      context()
    )
    expect(selected.rows.length).toBe(fieldId === date ? 1 : 0)
    expect(selected.revision).toBe(skipped.revision)
  }
  revision = skipped.revision
  const periods = [
    ["day", -1, "2025-12-31", "2026-01-01"],
    ["day", 0, "2026-01-01", "2026-01-02"],
    ["day", 1, "2026-01-02", "2026-01-03"],
    ["week", -1, "2025-12-22", "2025-12-29"],
    ["week", 0, "2025-12-29", "2026-01-05"],
    ["week", 1, "2026-01-05", "2026-01-12"],
    ["month", -1, "2025-12-01", "2026-01-01"],
    ["month", 0, "2026-01-01", "2026-02-01"],
    ["month", 1, "2026-02-01", "2026-03-01"],
    ["year", -1, "2025-01-01", "2026-01-01"],
    ["year", 0, "2026-01-01", "2027-01-01"],
    ["year", 1, "2027-01-01", "2028-01-01"],
  ] as const
  setReference("2026-01-01T12:30:00.000Z")
  for (const [index, [unit, offset, start, end]] of periods.entries()) {
    const prefix = `period-${index}-`
    const lower = `${start}T00:00:00.000Z`,
      upper = `${end}T00:00:00.000Z`
    const samples = [
      new Date(Date.parse(lower) - 1).toISOString(),
      lower,
      new Date(Date.parse(upper) - 1).toISOString(),
      upper,
    ]
    const created = await runtime.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: samples.map((value, sample) => ({
          kind: "create",
          clientKey: `period-${sample}`,
          values: {
            [label]: prefix + sample,
            [date]: value.slice(0, 10),
            [instant]: value,
          },
        })),
      },
      context()
    )
    revision = created.revision
    for (const fieldId of [date, instant]) {
      const page = await runtime.queryRows(
        {
          tableId,
          calendar: { timeZone: "UTC", timeZoneData: "2026f", weekStartsOn: 1 },
          query: {
            filter: {
              op: "and",
              args: [
                { op: "starts-with", fieldId: label, value: prefix },
                { op: "calendar-period", fieldId, unit, offset },
              ],
            },
            sort: [{ fieldId: label, direction: "asc" }],
          },
          projection: { fields: [label], resolveRelations: [] },
          limit: 10,
        },
        context()
      )
      expect(page.rows.map((row) => row.values[0])).toEqual([
        prefix + "1",
        prefix + "2",
      ])
      expect(page.total).toBe("2")
      expect(page.referenceInstant).toBe("2026-01-01T12:30:00.000Z")
    }
  }
}
