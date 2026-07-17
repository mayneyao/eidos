import { describe, expect, it } from "vitest"

import {
  decodeEidosFileAttachmentPaths,
  encodeEidosFileAttachmentPaths,
  normalizeEidosFileAttachmentPath,
} from "./file-values"

describe("Eidos File field values", () => {
  it("stores portable Space-relative paths as a JSON array", () => {
    expect(
      encodeEidosFileAttachmentPaths([
        "/assets/roadmap, final.pdf",
        "assets\\cover.png",
        "assets/cover.png",
      ])
    ).toBe('["assets/roadmap, final.pdf","assets/cover.png"]')
  })

  it("reads only JSON arrays", () => {
    expect(
      decodeEidosFileAttachmentPaths(
        '["assets/a.png","assets/report, final.pdf"]'
      )
    ).toEqual(["assets/a.png", "assets/report, final.pdf"])
    expect(
      decodeEidosFileAttachmentPaths("/files/a.png, /files/b.pdf")
    ).toEqual([])
    expect(
      decodeEidosFileAttachmentPaths("assets/a.png\nassets/b.pdf")
    ).toEqual([])
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
