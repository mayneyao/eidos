import { describe, expect, it } from "vitest"
import {
  upgradeEidosFileDateQuery,
  eidosFileDateQueryUpgradeReceipt,
  hasRetiredEidosFileDateQuery,
} from "./calendar-query-upgrade"

const relative = {
  op: "relative-date",
  fieldId: "date",
  direction: "past",
  unit: "week",
}
const day = {
  op: "calendar-day",
  fieldId: "instant",
  day: "tomorrow",
  timeZone: "Europe/Berlin",
  timeZoneData: "2026f",
}
describe("explicit date query upgrade", () => {
  it("inspects AST nodes without treating opaque operand data as filters", () => {
    expect(
      hasRetiredEidosFileDateQuery({ filter: { op: "not", arg: relative } })
    ).toBe(true)
    expect(
      hasRetiredEidosFileDateQuery({
        filter: {
          op: "eq",
          fieldId: "file",
          value: { id: "file", op: "calendar-day" },
        },
      })
    ).toBe(false)
  })
  it("preserves nested logic, operands, sorting and original ownership", () => {
    const query = {
      filter: {
        op: "and",
        args: [
          relative,
          {
            op: "not",
            arg: {
              op: "or",
              args: [day, { op: "eq", fieldId: "name", value: "keep" }],
            },
          },
        ],
      },
      sort: [{ fieldId: "name", direction: "desc", nulls: "first" }],
    }
    const original = JSON.stringify(query)
    const result = upgradeEidosFileDateQuery(query)
    expect(result.query).toEqual({
      filter: {
        op: "and",
        args: [
          { op: "calendar-period", fieldId: "date", unit: "week", offset: -1 },
          {
            op: "not",
            arg: {
              op: "or",
              args: [
                {
                  op: "calendar-period",
                  fieldId: "instant",
                  unit: "day",
                  offset: 1,
                },
                { op: "eq", fieldId: "name", value: "keep" },
              ],
            },
          },
        ],
      },
      sort: query.sort,
    })
    expect(result.changes).toHaveLength(2)
    expect(JSON.stringify(query)).toBe(original)
    expect(JSON.stringify(result.query)).not.toMatch(/timeZone|2026f/)
    expect(eidosFileDateQueryUpgradeReceipt(query, result)).toMatchObject({
      version: 2,
      originalQuery: query,
    })
  })
  it.each(["day", "week", "month", "year"])(
    "maps all directions for %s to complete periods",
    (unit) => {
      for (const [direction, offset] of [
        ["past", -1],
        ["this", 0],
        ["next", 1],
      ] as const)
        expect(
          upgradeEidosFileDateQuery({
            filter: { ...relative, direction, unit },
          }).query.filter
        ).toEqual({ op: "calendar-period", fieldId: "date", unit, offset })
    }
  )
  it.each([
    { op: "unknown", fieldId: "date" },
    { ...relative, direction: ["past"] },
    { ...relative, unit: "hour" },
    { ...relative, unexpected: true },
    { ...day, timeZone: "system" },
    { op: "eq", fieldId: "name", value: null },
    { op: "has-any", fieldId: "name", values: [null] },
  ])("rejects an entire upgrade containing an unsafe node %j", (unsafe) => {
    const source = { filter: { op: "or", args: [relative, unsafe] } }
    const bytes = JSON.stringify(source)
    expect(() => upgradeEidosFileDateQuery(source)).toThrow()
    expect(JSON.stringify(source)).toBe(bytes)
  })
  it("rejects oversized recovery receipts", () => {
    const query = {
      filter: {
        op: "and",
        args: [
          relative,
          { op: "eq", fieldId: "name", value: "x".repeat(70000) },
        ],
      },
    }
    const result = upgradeEidosFileDateQuery(query)
    expect(() => eidosFileDateQueryUpgradeReceipt(query, result)).toThrow(
      /65536/
    )
  })
})
