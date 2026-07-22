import { describe, expect, it } from "vitest"

import {
  decodeEidosFileRelationDisplay,
  decodeEidosFileRelationIds,
  encodeEidosFileRelationIds,
} from "./relation-values"

describe("Eidos File relation values", () => {
  const adaId = "0198c72d-82b5-7968-b163-98be4b7477df"
  const graceId = "0198c72d-82b5-7969-8163-98be4b7477df"

  it("stores ordered unique UUIDv7 record IDs", () => {
    expect(encodeEidosFileRelationIds([adaId, graceId])).toBe(
      JSON.stringify([adaId, graceId])
    )
    expect(() => encodeEidosFileRelationIds([adaId, adaId])).toThrow(/unique/)
  })

  it("reads only portable JSON arrays", () => {
    expect(
      decodeEidosFileRelationIds(JSON.stringify([adaId, graceId]))
    ).toEqual([adaId, graceId])
    expect(() => decodeEidosFileRelationIds("row-a,row-b")).toThrow(
      /JSON array/
    )
  })

  it("decodes hydrated display values defensively", () => {
    expect(
      decodeEidosFileRelationDisplay(
        JSON.stringify([
          { id: adaId, title: "Ada" },
          { id: 42, title: "Ignored" },
        ])
      )
    ).toEqual([{ id: adaId, title: "Ada" }])
  })
})
