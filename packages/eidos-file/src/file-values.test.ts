import { describe, expect, it } from "vitest"

import {
  decodeEidosFileAttachmentPaths,
  encodeEidosFileAttachmentPaths,
  normalizeEidosFileAttachmentPath,
} from "./file-values"

describe("Eidos File field values", () => {
  it("stores portable File objects with stable UUIDv7 identities", () => {
    const encoded = encodeEidosFileAttachmentPaths([
      "assets/roadmap, final.pdf",
      "assets/cover.png",
      "assets/cover.png",
    ])
    expect(decodeEidosFileAttachmentPaths(encoded ?? undefined)).toEqual([
      "assets/roadmap, final.pdf",
      "assets/cover.png",
    ])
    expect(JSON.parse(encoded ?? "[]")).toEqual([
      expect.objectContaining({ uri: "assets/roadmap, final.pdf" }),
      expect.objectContaining({ uri: "assets/cover.png" }),
    ])
  })

  it("reads only canonical File object arrays", () => {
    const encoded = encodeEidosFileAttachmentPaths([
      "assets/a.png",
      "assets/report, final.pdf",
    ])
    expect(decodeEidosFileAttachmentPaths(encoded ?? undefined)).toEqual([
      "assets/a.png",
      "assets/report, final.pdf",
    ])
    expect(() => decodeEidosFileAttachmentPaths('["assets/a.png"]')).toThrow(
      /invalid entry/
    )
    expect(() =>
      decodeEidosFileAttachmentPaths("/files/a.png, /files/b.pdf")
    ).toThrow(/valid JSON/)
  })

  it("rejects paths that escape the Space or use unsafe schemes", () => {
    expect(normalizeEidosFileAttachmentPath("../../secret.txt")).toBeNull()
    expect(
      normalizeEidosFileAttachmentPath("file:///Users/me/secret.txt")
    ).toBeNull()
    expect(
      normalizeEidosFileAttachmentPath("https://example.com/image.png")
    ).toBe("https://example.com/image.png")
  })
})
