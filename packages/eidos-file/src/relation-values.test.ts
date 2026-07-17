import { describe, expect, it } from "vitest"

import {
  decodeEidosFileRelationDisplay,
  decodeEidosFileRelationIds,
  encodeEidosFileRelationIds,
} from "./relation-values"

describe("Eidos File relation values", () => {
  it("stores stable record IDs as a deduplicated JSON array", () => {
    expect(encodeEidosFileRelationIds(["row-a", "row-b", "row-a", ""])).toBe(
      '["row-a","row-b"]'
    )
  })

  it("reads only portable JSON arrays", () => {
    expect(decodeEidosFileRelationIds('["row-a","row,b"]')).toEqual([
      "row-a",
      "row,b",
    ])
    expect(decodeEidosFileRelationIds("row-a,row-b")).toEqual([])
  })

  it("decodes hydrated display values defensively", () => {
    expect(
      decodeEidosFileRelationDisplay(
        '[{"id":"row-a","title":"Ada"},{"id":42,"title":"Ignored"}]'
      )
    ).toEqual([{ id: "row-a", title: "Ada" }])
  })
})
