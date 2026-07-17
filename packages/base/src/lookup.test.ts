import { describe, expect, it } from "vitest"

import {
  baseLookupAggregateSupportsTarget,
  baseLookupDisplayType,
  baseLookupStorageCodec,
} from "./lookup"

describe("Base lookup policy", () => {
  it("stores all-values results as JSON arrays", () => {
    expect(baseLookupStorageCodec("values")).toBe("json_array")
    expect(baseLookupStorageCodec("first")).toBe("scalar")
    expect(baseLookupStorageCodec("count")).toBe("scalar")
  })

  it("preserves the target element display type for first and values", () => {
    expect(baseLookupDisplayType("first", "number")).toBe("number")
    expect(baseLookupDisplayType("values", "date")).toBe("date")
    expect(baseLookupDisplayType("values", "multi-select")).toBe("text")
    expect(baseLookupDisplayType("count", "text")).toBe("number")
  })

  it("only permits numeric rollups over numeric target fields", () => {
    expect(baseLookupAggregateSupportsTarget("sum", { type: "number" })).toBe(
      true
    )
    expect(
      baseLookupAggregateSupportsTarget("average", { type: "rating" })
    ).toBe(true)
    expect(
      baseLookupAggregateSupportsTarget("sum", { type: "multi-select" })
    ).toBe(false)
    expect(
      baseLookupAggregateSupportsTarget("values", { type: "multi-select" })
    ).toBe(true)
  })

  it("uses the effective display type of a nested lookup", () => {
    const numericLookup = {
      type: "lookup" as const,
      property: { displayType: "number" as const },
    }
    const textLookup = {
      type: "lookup" as const,
      property: { displayType: "text" as const },
    }

    expect(baseLookupDisplayType("values", numericLookup)).toBe("number")
    expect(baseLookupAggregateSupportsTarget("sum", numericLookup)).toBe(true)
    expect(baseLookupAggregateSupportsTarget("average", textLookup)).toBe(false)
  })
})
