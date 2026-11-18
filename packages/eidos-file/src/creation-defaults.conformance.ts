import { expect } from "vitest"
import type { ConnectionPort } from "./adapter-contract"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { EidosFileRuntime } from "./runtime"
import { Runtime } from "./runtime-service"
import type {
  EidosFileFilterGroup,
  EidosFileFilterRule,
  EidosFileRow,
  EidosFileRowQuery,
} from "./types"

export async function expectCreationDefaultsConformance(port: ConnectionPort) {
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
    { title: "Creation defaults" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const core = new EidosFileRuntime(
    new ConnectionPortEidosFileConnection(port),
    false,
    { nowInstant: () => now }
  )
  const table = core.createTable({
    name: "Records",
    fields: [
      { name: "Name", type: "text" },
      { name: "Number", type: "number" },
      { name: "Integer", type: "integer" },
      { name: "Flag", type: "checkbox" },
      {
        name: "State",
        type: "select",
        property: {
          options: [{ name: "Todo" }, { name: "Done" }],
          defaultOption: "Todo",
        },
      },
      {
        name: "Tags",
        type: "multi-select",
        property: { options: [{ name: "A" }, { name: "B" }] },
      },
      { name: "Day", type: "date", property: { defaultValue: "now" } },
      { name: "Instant", type: "datetime", property: { defaultValue: "now" } },
      { name: "Files", type: "file" },
      { name: "Rating", type: "rating" },
      { name: "URL", type: "url" },
      { name: "Locked", type: "text", property: { readOnly: true } },
    ],
  })
  const fields = core.listFields(table.id)
  const field = (name: string) => fields.find((entry) => entry.name === name)!
  const rule = (
    name: string,
    operator: EidosFileFilterRule["operator"],
    value?: EidosFileFilterRule["value"]
  ): EidosFileFilterRule => ({
    type: "rule",
    field: field(name).id,
    operator,
    ...(value === undefined ? {} : { value }),
  })
  const and = (
    ...children: EidosFileFilterGroup["children"]
  ): EidosFileFilterGroup => ({ type: "group", conjunction: "and", children })
  const or = (
    ...children: EidosFileFilterGroup["children"]
  ): EidosFileFilterGroup => ({ type: "group", conjunction: "or", children })
  const calendar = {
    timeZone: "Asia/Shanghai",
    timeZoneData: "2026f",
    weekStartsOn: 1 as const,
  }
  const create = (filter: EidosFileFilterGroup, values: EidosFileRow = {}) => {
    const result = core.mutateRows({
      tableId: table.id,
      creationContext: {
        timeZone: calendar.timeZone,
        timeZoneData: calendar.timeZoneData,
      },
      creationQuery: { filter, calendar },
      insert: [{ fields: values }],
    })
    return core.getRow(table.id, result.rows[0]!.id)!
  }
  const value = (row: EidosFileRow, name: string) =>
    row[field(name).tableColumnName]
  const satisfies = (row: EidosFileRow, filter: EidosFileFilterGroup) =>
    expect(
      core.getRowIndex(table.id, String(row._id), {
        filter,
        calendar,
        referenceInstant: now,
      })
    ).not.toBeNull()
  const filter = and(
    rule("State", "equals", "Done"),
    rule("Flag", "equals", true),
    rule("Tags", "contains", "A"),
    rule("Tags", "contains", "B"),
    rule("Number", "greater-than", 23),
    rule("Number", "less-than", 25),
    rule("Name", "contains", "213")
  )
  const row = create(filter)
  expect([
    value(row, "State"),
    value(row, "Flag"),
    value(row, "Tags"),
    value(row, "Number"),
    value(row, "Name"),
  ]).toEqual(["Done", 1, '["A","B"]', 24, "213"])
  satisfies(row, filter)
  const explicit = create(filter, {
    [field("State").id]: "Todo",
    [field("Name").id]: null,
    [field("Flag").id]: false,
  })
  expect([
    value(explicit, "State"),
    value(explicit, "Name"),
    value(explicit, "Flag"),
  ]).toEqual(["Todo", null, 0])
  const dates = and(
    rule("Day", "is-in-calendar-period", { unit: "year", offset: 1 }),
    rule("Instant", "is-between", [
      "2026-11-20T00:00:00.000Z",
      "2026-11-21T00:00:00.000Z",
    ])
  )
  const dated = create(dates)
  expect([value(dated, "Day"), value(dated, "Instant")]).toEqual([
    "2027-01-01",
    "2026-11-20T00:00:00.000Z",
  ])
  satisfies(dated, dates)
  expect(
    value(
      create(dates, {
        [field("Day").id]: "2000-01-01",
        [field("Instant").id]: null,
      }),
      "Instant"
    )
  ).toBeNull()
  const nested = and(
    rule("Flag", "equals", true),
    or(
      and(rule("State", "equals", "Todo"), rule("Name", "equals", "same")),
      and(rule("State", "equals", "Done"), rule("Name", "equals", "same"))
    )
  )
  const ambiguous = create(nested)
  expect([
    value(ambiguous, "Flag"),
    value(ambiguous, "State"),
    value(ambiguous, "Name"),
  ]).toEqual([1, "Todo", "same"])
  satisfies(ambiguous, nested)
  const selected = create(
    or(
      and(rule("State", "equals", "Todo"), rule("Name", "equals", "one")),
      and(rule("State", "equals", "Done"), rule("Name", "equals", "two"))
    ),
    { [field("State").id]: "Done" }
  )
  expect(value(selected, "Name")).toBe("two")
  const conflict = create(
    and(
      rule("State", "equals", "Todo"),
      rule("State", "equals", "Done"),
      rule("Flag", "equals", true)
    )
  )
  expect([value(conflict, "State"), value(conflict, "Flag")]).toEqual([
    "Todo",
    1,
  ])
  expect(
    value(create(and(rule("Tags", "is-any-of", ["A", "B"]))), "Tags")
  ).toBe("[]")
  expect(value(create(and(rule("Tags", "contains", "missing"))), "Tags")).toBe(
    "[]"
  )
  expect(value(create(and(rule("State", "equals", "missing"))), "State")).toBe(
    "Todo"
  )
  expect(value(create(and(rule("Files", "is-not-empty"))), "Files")).toBe("[]")
  expect(value(create(and(rule("Day", "is-empty"))), "Day")).toBeNull()
  expect(
    value(
      create(and(rule("Integer", "greater-than", "9007199254740993"))),
      "Integer"
    )
  ).toBe(9007199254740994n)
  const narrow = and(
    rule("Number", "greater-than", 1),
    rule("Number", "less-than", 1.0000000000000004)
  )
  satisfies(create(narrow), narrow)
  const system = fields.find((entry) => entry.systemRole === "created-time")!
  const readonly = create(
    and(
      {
        type: "rule",
        field: system.id,
        operator: "equals",
        value: "2000-01-01T00:00:00.000Z",
      },
      rule("State", "equals", "Done")
    )
  )
  expect(readonly[system.tableColumnName]).toBe(now)
  expect(value(readonly, "State")).toBe("Done")
  const plain = core.insertRow(table.id, {})
  expect([
    value(plain, "State"),
    value(plain, "Flag"),
    value(plain, "Day"),
  ]).toEqual(["Todo", 0, "2026-11-16"])
  const imported = core.insertImportedRow(table.id, {})
  expect(value(imported, "Day")).toBeNull()
  const revision = core.info().revision
  const invalid: EidosFileRowQuery = {
    filter: and({
      type: "rule",
      field: "missing",
      operator: "equals",
      value: "x",
    }),
  }
  expect(() =>
    core.mutateRows({
      tableId: table.id,
      creationQuery: invalid,
      insert: [{ fields: {} }],
    })
  ).toThrow()
  expect(core.info().revision).toBe(revision)
  const originalGet = core.connection.get.bind(core.connection)
  let evaluations = 0
  core.connection.get = (sql, params) => {
    if (sql.startsWith("SELECT 1 AS matched") && ++evaluations === 2)
      throw new Error("injected candidate SQL failure")
    return originalGet(sql, params)
  }
  try {
    expect(() => create(and(rule("Flag", "equals", true)))).toThrow(
      "injected candidate SQL failure"
    )
    expect(core.info().revision).toBe(revision)
  } finally {
    core.connection.get = originalGet
  }
  const prefix = and(
    rule("Name", "starts-with", "hello"),
    rule("Name", "contains", "world"),
    rule("Name", "ends-with", "!")
  )
  satisfies(create(prefix), prefix)
  expect(
    Number(value(create(and(rule("Rating", "greater-than", "3"))), "Rating"))
  ).toBe(4)
  expect(
    Number(value(create(and(rule("Rating", "greater-than", "5"))), "Rating"))
  ).toBe(6)
  expect(
    value(create(and(rule("Integer", "equals", "9007199254740993"))), "Integer")
  ).toBe(9007199254740993n)
  expect(
    value(create(and(rule("URL", "equals", "https://example.com"))), "URL")
  ).toBe("https://example.com")
  expect(
    value(create(and(rule("Locked", "equals", "must not write"))), "Locked")
  ).toBeNull()
  expect(value(create(and(rule("Flag", "is-empty"))), "Flag")).toBe(0)
  const complex = and(
    ...Array.from({ length: 7 }, () =>
      or(rule("Name", "equals", "one"), rule("Name", "equals", "two"))
    ),
    rule("Flag", "equals", true)
  )
  expect(value(create(complex), "Flag")).toBe(0)
  const target = core.createTable({
    name: "Targets",
    fields: [{ name: "Title", type: "text" }],
  })
  const relation = core.addField(table.id, {
    name: "Relation",
    type: "relation",
    property: {
      targetTableId: target.id,
      cardinality: "many",
      onDelete: "preserve",
    },
  })
  const relationFilter = and({
    type: "rule",
    field: relation.id,
    operator: "contains",
    value: "missing-target",
  })
  const related = core.mutateRows({
    tableId: table.id,
    creationQuery: { filter: relationFilter },
    insert: [{ fields: {} }],
  })
  expect(
    core.getRow(table.id, related.rows[0]!.id)![relation.tableColumnName]
  ).toBe("[]")
  for (const [instant, expected] of [
    ["2026-03-08T06:30:00.000Z", "2026-03-09T04:00:00.000Z"],
    ["2026-11-01T05:30:00.000Z", "2026-11-02T05:00:00.000Z"],
  ]) {
    now = instant!
    const filter = and(
      rule("Instant", "is-in-calendar-period", { unit: "day", offset: 1 })
    )
    const calendar = {
      timeZone: "America/New_York",
      timeZoneData: "2026f",
      weekStartsOn: 1 as const,
    }
    const result = core.mutateRows({
      tableId: table.id,
      creationQuery: { filter, calendar },
      insert: [{ fields: {} }, { fields: {} }],
    })
    for (const row of result.rows) {
      expect(
        core.getRow(table.id, row.id)![field("Instant").tableColumnName]
      ).toBe(expected)
      expect(
        core.getRowIndex(table.id, row.id, {
          filter,
          calendar,
          referenceInstant: now,
        })
      ).not.toBeNull()
    }
  }
  await service.close({ requestId: "close" })
}
