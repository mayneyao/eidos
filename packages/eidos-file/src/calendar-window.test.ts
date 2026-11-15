import { describe, expect, it } from "vitest"
import {
  eidosFileCalendarWindowBounds,
  isEidosFileCalendarWindowValue,
} from "./calendar-window"

const calendar = {
  timeZone: "Asia/Shanghai",
  timeZoneData: "2026f",
  weekStartsOn: 1 as const,
}

describe("relative-to-today date windows", () => {
  it.each([
    ["past", "day", 1, "2026-11-14", "2026-11-16"],
    ["next", "day", 1, "2026-11-15", "2026-11-17"],
    ["past", "week", 1, "2026-11-08", "2026-11-16"],
    ["next", "week", 2, "2026-11-15", "2026-11-30"],
    ["past", "month", 1, "2026-10-15", "2026-11-16"],
    ["next", "year", 1, "2026-11-15", "2027-11-16"],
  ] as const)(
    "%s %s × %i includes both endpoint dates",
    (direction, unit, count, startDate, endDate) => {
      expect(
        eidosFileCalendarWindowBounds(
          { direction, unit, count },
          calendar,
          "2026-11-15T01:15:00.000Z"
        )
      ).toMatchObject({ startDate, endDate })
    }
  )
  it("includes whole local days for Datetime, including future hours of today", () => {
    expect(
      eidosFileCalendarWindowBounds(
        { direction: "past", unit: "day", count: 1 },
        calendar,
        "2026-11-15T01:15:00.000Z"
      )
    ).toEqual({
      startDate: "2026-11-14",
      endDate: "2026-11-16",
      intervals: [["2026-11-13T16:00:00.000Z", "2026-11-15T16:00:00.000Z"]],
    })
  })
  it.each([
    ["2026-01-31T12:00:00.000Z", "next", "month", "2026-01-31", "2026-03-01"],
    ["2026-03-31T12:00:00.000Z", "past", "month", "2026-02-28", "2026-04-01"],
    ["2024-02-29T12:00:00.000Z", "next", "year", "2024-02-29", "2025-03-01"],
  ] as const)(
    "clamps target dates at month/year ends",
    (reference, direction, unit, startDate, endDate) => {
      expect(
        eidosFileCalendarWindowBounds(
          { direction, unit, count: 1 },
          calendar,
          reference
        )
      ).toMatchObject({ startDate, endDate })
    }
  )
  it("preserves a DST transition instead of constructing exact 24-hour durations", () => {
    expect(
      eidosFileCalendarWindowBounds(
        { direction: "past", unit: "day", count: 1 },
        { ...calendar, timeZone: "America/New_York" },
        "2026-03-09T12:00:00.000Z"
      ).intervals
    ).toEqual([["2026-03-08T05:00:00.000Z", "2026-03-10T04:00:00.000Z"]])
  })
  it.each([0, -1, 0.5, 1_000_001, NaN, Infinity])(
    "rejects invalid counts %s",
    (count) => {
      expect(
        isEidosFileCalendarWindowValue({
          direction: "past",
          unit: "day",
          count,
        })
      ).toBe(false)
    }
  )
  it("does not accept unknown fields or freeze an execution zone", () => {
    expect(
      isEidosFileCalendarWindowValue({
        direction: "past",
        unit: "day",
        count: 1,
        timeZone: "UTC",
      })
    ).toBe(false)
    expect(() =>
      eidosFileCalendarWindowBounds(
        { direction: "past", unit: "year", count: 100 },
        calendar,
        "1970-01-01T12:00:00.000Z"
      )
    ).toThrow(/outside/)
  })
  it("preserves skipped civil dates and rejects numeric overflow at the count maximum", () => {
    expect(
      eidosFileCalendarWindowBounds(
        { direction: "next", count: 1, unit: "day" },
        { ...calendar, timeZone: "Pacific/Apia" },
        "2011-12-29T12:00:00.000Z"
      )
    ).toMatchObject({
      startDate: "2011-12-29",
      endDate: "2011-12-31",
      intervals: [["2011-12-29T10:00:00.000Z", "2011-12-30T10:00:00.000Z"]],
    })
    for (const direction of ["past", "next"] as const)
      expect(() =>
        eidosFileCalendarWindowBounds(
          { direction, count: 1_000_000, unit: "year" },
          calendar,
          "2026-11-15T01:15:00.000Z"
        )
      ).toThrow(/outside/)
  })
  it.each([1927, 1950, 2026])(
    "never reinterprets a historical target as a 1900s date: %s years",
    (count) => {
      for (const [unit, amount] of [
        ["year", count],
        ["month", count * 12],
      ] as const)
        expect(() =>
          eidosFileCalendarWindowBounds(
            { direction: "past", count: amount, unit },
            calendar,
            "2026-11-15T01:15:00.000Z"
          )
        ).toThrow(/outside/)
    }
  )
})
