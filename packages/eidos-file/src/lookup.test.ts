import { describe, expect, it } from "vitest"

import {
  eidosFileLookupAggregateSupportsTarget,
  eidosFileLookupDisplayType,
  eidosFileLookupStorageCodec,
} from "./lookup"

describe("Eidos File lookup policy", () => {
  it("stores all-values results as JSON arrays", () => {
    expect(eidosFileLookupStorageCodec("values")).toBe("json_array")
    expect(eidosFileLookupStorageCodec("first")).toBe("scalar")
    expect(eidosFileLookupStorageCodec("count")).toBe("scalar")
  })

  it("preserves the target element display type for first and values", () => {
    expect(eidosFileLookupDisplayType("first", "number")).toBe("number")
    expect(eidosFileLookupDisplayType("values", "date")).toBe("date")
    expect(eidosFileLookupDisplayType("values", "multi-select")).toBe("text")
    expect(eidosFileLookupDisplayType("count", "text")).toBe("number")
  })

  it("only permits numeric rollups over numeric target fields", () => {
    expect(
      eidosFileLookupAggregateSupportsTarget("sum", { type: "number" })
    ).toBe(true)
    expect(
      eidosFileLookupAggregateSupportsTarget("average", { type: "rating" })
    ).toBe(true)
    expect(
      eidosFileLookupAggregateSupportsTarget("sum", { type: "multi-select" })
    ).toBe(false)
    expect(
      eidosFileLookupAggregateSupportsTarget("values", { type: "multi-select" })
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

    expect(eidosFileLookupDisplayType("values", numericLookup)).toBe("number")
    expect(eidosFileLookupAggregateSupportsTarget("sum", numericLookup)).toBe(
      true
    )
    expect(eidosFileLookupAggregateSupportsTarget("average", textLookup)).toBe(
      false
    )
  })
})
