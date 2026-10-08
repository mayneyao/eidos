import { expect, it } from "vitest"
import { FILE_EXPORT_LIMIT, parseFileExport } from "./file-export"

const valid = { name: "趋势.png", mimeType: "image/png", data: "AAH/" }
it("decodes generated binary content without accepting a guest destination path", () => {
  expect(parseFileExport(valid).data).toEqual(new Uint8Array([0, 1, 255]))
  for (const name of [
    "../out.png",
    "/tmp/out.png",
    "C:\\out.png",
    "a\n.png",
    "..",
    "x.",
    "CON.png",
    "x".repeat(256),
  ])
    expect(() => parseFileExport({ ...valid, name })).toThrow()
  expect(() => parseFileExport({ ...valid, path: "/tmp/out.png" })).toThrow()
})
it("rejects malformed media types, base64, and oversized content", () => {
  for (const data of ["abc", "a===", "====", "ab=c", "abc$", "a\nbc"])
    expect(() => parseFileExport({ ...valid, data })).toThrow()
  expect(() =>
    parseFileExport({ ...valid, mimeType: "image/png; charset=utf8" })
  ).toThrow()
  expect(
    parseFileExport({
      ...valid,
      data: Buffer.alloc(FILE_EXPORT_LIMIT).toString("base64"),
    }).data.length
  ).toBe(FILE_EXPORT_LIMIT)
  expect(() =>
    parseFileExport({
      ...valid,
      data: Buffer.alloc(FILE_EXPORT_LIMIT + 1).toString("base64"),
    })
  ).toThrow()
})
