import { expect, it } from "vitest"
import { sourceInstantComparisonKey as key } from "./source-instant"
import { normalizeEidosFileInstant } from "./temporal"

it("compares exact source fractions and equivalent offsets across calendar boundaries", () => {
  expect(key("2023-11-14T22:13:20.124000000+00:00")).toBe(
    key("2023-11-15T06:13:20.124+08:00")
  )
  expect(
    key("2023-11-14T22:13:20.124001+00:00")! > key("2023-11-14T22:13:20.124Z")!
  ).toBe(true)
  expect(
    key("2023-11-14T22:13:20.124999999999999999Z")! <
      key("2023-11-14T22:13:20.125Z")!
  ).toBe(true)
  expect(
    key("2023-11-14T22:13:20Z")! < key("2023-11-14T22:13:20.0000000000001Z")!
  ).toBe(true)
  expect(
    key("1969-12-31T23:59:59.999999Z")! < key("1970-01-01T00:00:00Z")!
  ).toBe(true)
  expect(key("2024-03-01T00:30:00.123456+01:00")).toBe(
    key("2024-02-29T23:30:00.123456Z")
  )
  expect(key(null)).toBeNull()
  for (const invalid of [
    42,
    "2023-02-29T00:00:00Z",
    "2024-01-01T24:00:00Z",
    "2024-01-01T00:00:60Z",
  ])
    expect(() => key(invalid)).toThrow()
  expect(() =>
    normalizeEidosFileInstant("2023-11-14T22:13:20.124001Z")
  ).toThrow(/sub-millisecond/)
})
