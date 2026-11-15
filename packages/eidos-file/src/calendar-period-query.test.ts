import { describe, expect, it } from "vitest"
import { compileEidosFileRowQuery } from "./query"
import type { EidosFileFieldInfo, EidosFileRowQuery } from "./types"

const field = (type: "date" | "datetime"): EidosFileFieldInfo => ({
  id: "0198c72d-82b5-7000-8000-000000000001",
  tableId: "0198c72d-82b5-7000-8000-000000000002",
  name: "Date",
  type,
  tableName: "records",
  tableColumnName: "day",
  physicalName: "day",
  isRecordLabel: false,
  position: 0,
  settings: {},
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
})
const query = (operator: string, value: unknown): EidosFileRowQuery =>
  ({
    filter: {
      type: "group",
      conjunction: "and",
      children: [{ type: "rule", field: "day", operator, value }],
    },
  }) as EidosFileRowQuery
const calendar = {
  timeZone: "Asia/Shanghai",
  timeZoneData: "2026f",
  weekStartsOn: 1 as const,
}
const referenceInstant = "2026-01-01T00:30:00.000Z"

describe("calendar query replacement", () => {
  it("uses local Date bounds without shifting literal dates", () => {
    const compiled = compileEidosFileRowQuery(
      [field("date")],
      query("is-in-calendar-period", { unit: "day", offset: 0 }),
      { referenceInstant, calendar }
    )
    expect(compiled.params).toEqual(["2026-01-01", "2026-01-02"])
    expect(compiled.whereSql).toContain('"day" < ?')
  })
  it("uses the same day for Datetime with half-open local midnight bounds", () => {
    const compiled = compileEidosFileRowQuery(
      [field("datetime")],
      query("is-in-calendar-period", { unit: "day", offset: 0 }),
      { referenceInstant, calendar }
    )
    expect(compiled.params).toEqual([
      "2025-12-31T16:00:00.000Z",
      "2026-01-01T16:00:00.000Z",
    ])
    expect(compiled.whereSql).toContain('"day" < ?')
  })
  it("requires explicit host calendar context", () => {
    expect(() =>
      compileEidosFileRowQuery(
        [field("date")],
        query("is-in-calendar-period", { unit: "day", offset: 0 }),
        { referenceInstant }
      )
    ).toThrow(/context/i)
  })
  it.each([
    ["is-relative-to-today", { direction: "past", unit: "week" }],
    [
      "is-on-calendar-day",
      { day: "today", timeZone: "UTC", timeZoneData: "2026f" },
    ],
  ])(
    "rejects retired %s instead of executing or dropping it",
    (operator, value) => {
      expect(() =>
        compileEidosFileRowQuery([field("date")], query(operator, value), {
          referenceInstant,
          calendar,
        })
      ).toThrow(/upgrad|retir|unsupported/i)
    }
  )
})
