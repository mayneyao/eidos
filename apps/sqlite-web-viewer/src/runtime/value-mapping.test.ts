import {
  BLOB_PREVIEW_BYTES,
  decodeViewerCell,
  encodedColumnExpression,
  TEXT_PREVIEW_CHARACTERS,
} from "./value-mapping"

describe("SQLite value mapping", () => {
  it("preserves integer precision as text and real values as numbers", () => {
    expect(decodeViewerCell("i:9223372036854775807")).toEqual({
      kind: "integer",
      value: "9223372036854775807",
    })
    expect(decodeViewerCell("r:9.75")).toEqual({ kind: "real", value: 9.75 })
  })

  it("keeps colons in text and marks truncated previews", () => {
    expect(decodeViewerCell("t:8:a:b:c:d")).toEqual({
      kind: "text",
      totalLength: 8,
      truncated: true,
      value: "a:b:c:d",
    })
  })

  it("maps NULL and bounded BLOB previews clearly", () => {
    expect(decodeViewerCell("n:")).toEqual({ kind: "null" })
    expect(decodeViewerCell("b:96:DEADBEEF")).toEqual({
      byteLength: 96,
      hexPreview: "DEADBEEF",
      kind: "blob",
    })
  })

  it("builds a bounded expression using a safely quoted column", () => {
    const sql = encodedColumnExpression('payload"bytes')
    expect(sql).toContain('"payload""bytes"')
    expect(sql).toContain(`1, ${TEXT_PREVIEW_CHARACTERS}`)
    expect(sql).toContain(`1, ${BLOB_PREVIEW_BYTES}`)
  })
})
