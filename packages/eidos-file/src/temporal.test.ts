import { describe, expect, it } from "vitest"

import {
  currentEidosFileInstant,
  isCanonicalEidosFileDate,
  isCanonicalEidosFileInstant,
  normalizeEidosFileDate,
  normalizeEidosFileInstant,
} from "./temporal"

describe("Eidos File canonical temporal values", () => {
  it("accepts only real fixed-width calendar dates", () => {
    expect(isCanonicalEidosFileDate("2024-02-29")).toBe(true)
    expect(isCanonicalEidosFileDate("2023-02-29")).toBe(false)
    expect(isCanonicalEidosFileDate("0000-01-01")).toBe(false)
    expect(isCanonicalEidosFileDate("2026-7-20")).toBe(false)
    expect(normalizeEidosFileDate("2026-07-20")).toBe("2026-07-20")
    expect(() => normalizeEidosFileDate("2026-02-30")).toThrow(
      /canonical YYYY-MM-DD/
    )
  })

  it("normalizes RFC 3339 offsets and missing milliseconds to UTC", () => {
    expect(normalizeEidosFileInstant("2026-07-20T10:11:12Z")).toBe(
      "2026-07-20T10:11:12.000Z"
    )
    expect(normalizeEidosFileInstant("2026-07-20T18:11:12.7+08:00")).toBe(
      "2026-07-20T10:11:12.700Z"
    )
    expect(normalizeEidosFileInstant("2026-07-20t02:11:12.07-08:00")).toBe(
      "2026-07-20T10:11:12.070Z"
    )
  })

  it("rejects invalid, leap-second, and sub-millisecond instants", () => {
    for (const value of [
      "2026-02-30T00:00:00Z",
      "2026-07-20T24:00:00Z",
      "2026-07-20T10:11:60Z",
      "2026-07-20 10:11:12Z",
    ]) {
      expect(() => normalizeEidosFileInstant(value)).toThrow(/RFC 3339/)
    }
    expect(() =>
      normalizeEidosFileInstant("2026-07-20T10:11:12.1234Z")
    ).toThrow(/sub-millisecond/)
  })

  it("emits exact canonical instants whose byte order is chronological", () => {
    const values = [
      "2026-01-01T00:00:00.000Z",
      "2025-12-31T23:59:59.999Z",
      "2026-01-01T00:00:00.001Z",
    ]
    expect([...values].sort()).toEqual([
      "2025-12-31T23:59:59.999Z",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.001Z",
    ])
    expect(
      isCanonicalEidosFileInstant(
        currentEidosFileInstant(new Date("2026-07-20T10:11:12.345Z"))
      )
    ).toBe(true)
  })
})
