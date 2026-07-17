import { describe, expect, it } from "vitest"

import {
  decodeBaseRelationDisplay,
  decodeBaseRelationIds,
  encodeBaseRelationIds,
} from "./relation-values"

describe("Base relation values", () => {
  it("stores stable record IDs as a deduplicated JSON array", () => {
    expect(encodeBaseRelationIds(["row-a", "row-b", "row-a", ""])).toBe(
      '["row-a","row-b"]'
    )
  })

  it("reads only portable JSON arrays", () => {
    expect(decodeBaseRelationIds('["row-a","row,b"]')).toEqual([
      "row-a",
      "row,b",
    ])
    expect(decodeBaseRelationIds("row-a,row-b")).toEqual([])
  })

  it("decodes hydrated display values defensively", () => {
    expect(
      decodeBaseRelationDisplay(
        '[{"id":"row-a","title":"Ada"},{"id":42,"title":"Ignored"}]'
      )
    ).toEqual([{ id: "row-a", title: "Ada" }])
  })
})
