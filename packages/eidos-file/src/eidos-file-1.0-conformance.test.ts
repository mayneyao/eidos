import { describe, expect, it } from "vitest"

import {
  canonicalizeEidosFileJson,
  isCanonicalEidosFileJson,
  parseEidosFileJson,
} from "./canonical-json"
import {
  assertEidosFileTableName,
  assertEidosFileUuid,
  createEidosFileUuid,
  isEidosFileUuid,
} from "./identifiers"
import {
  decodeEidosFileRelationIds,
  encodeEidosFileRelationIds,
} from "./relation-values"
import { assertEidosFileSelectOptions } from "./select-options"

const ID = "0198c72d-82b5-7968-b163-98be4b7477df"
const OTHER_ID = "0198c72d-82b5-7968-a163-98be4b7477df"

describe("Eidos File 1.0 primitive contracts", () => {
  it("uses one lowercase hyphenated UUIDv7 TEXT representation", () => {
    const generated = createEidosFileUuid(1_753_000_000_000)
    const next = createEidosFileUuid(1_753_000_000_000)
    expect(isEidosFileUuid(generated)).toBe(true)
    expect(generated < next).toBe(true)
    expect(assertEidosFileUuid(generated)).toBe(generated)
    expect(() => assertEidosFileUuid(ID.toUpperCase())).toThrow(/lowercase/)
    expect(() => assertEidosFileUuid(ID.replace(/-/g, ""))).toThrow(
      /hyphenated/
    )
  })

  it("accepts direct user Table names and rejects reserved prefixes", () => {
    expect(assertEidosFileTableName("项目")).toBe("项目")
    expect(assertEidosFileTableName("x__vendor__Tasks")).toBe(
      "x__vendor__Tasks"
    )
    for (const name of [
      "sqlite_Foo",
      "SQLITE_Foo",
      "eidos__Tasks",
      "EIDOS__Tasks",
    ]) {
      expect(() => assertEidosFileTableName(name)).toThrow(
        /must not begin with sqlite_ or eidos__/
      )
    }
  })

  it("canonicalizes JSON with sorted keys and rejects non-canonical text", () => {
    expect(canonicalizeEidosFileJson({ z: [2, 1], a: -0 })).toBe(
      '{"a":0,"z":[2,1]}'
    )
    expect(isCanonicalEidosFileJson('{"a":0,"z":[2,1]}')).toBe(true)
    expect(isCanonicalEidosFileJson('{ "z": [2,1], "a": 0 }')).toBe(false)
    expect(() => canonicalizeEidosFileJson({ value: Number.NaN })).toThrow(
      /finite/
    )
    expect(() => parseEidosFileJson('{"a":1,"a":2}')).toThrow(/Duplicate/)
    expect(() => parseEidosFileJson('"\\ud800"')).toThrow(/surrogate/)
  })

  it("encodes Relation values as ordered unique UUID string arrays", () => {
    const encoded = encodeEidosFileRelationIds([ID, OTHER_ID])
    expect(encoded).toBe(`["${ID}","${OTHER_ID}"]`)
    expect(decodeEidosFileRelationIds(encoded)).toEqual([ID, OTHER_ID])
    expect(() => encodeEidosFileRelationIds([ID, ID])).toThrow(/unique/)
    expect(() => decodeEidosFileRelationIds("null")).toThrow(/array/)
  })

  it("uses Select option names as values without an option identity", () => {
    const options = assertEidosFileSelectOptions({
      options: [
        { color: "gray", name: "Todo" },
        { color: "green", name: "Done" },
      ],
    })
    expect(options.map((option) => option.name)).toEqual(["Todo", "Done"])
    expect(() =>
      assertEidosFileSelectOptions({
        options: [{ name: "Todo" }, { name: "Todo" }],
      })
    ).toThrow(/Duplicate Select option name/)
  })
})
