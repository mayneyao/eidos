import { describe, expect, it } from "vitest"

import {
  decodeBaseFilePaths,
  encodeBaseFilePaths,
  normalizeBaseFilePath,
} from "./file-values"

describe("Base file field values", () => {
  it("stores portable Space-relative paths as a JSON array", () => {
    expect(
      encodeBaseFilePaths([
        "/assets/roadmap, final.pdf",
        "assets\\cover.png",
        "assets/cover.png",
      ])
    ).toBe('["assets/roadmap, final.pdf","assets/cover.png"]')
  })

  it("reads new JSON and legacy comma/newline values", () => {
    expect(
      decodeBaseFilePaths('["assets/a.png","assets/report, final.pdf"]')
    ).toEqual(["assets/a.png", "assets/report, final.pdf"])
    expect(decodeBaseFilePaths("/files/a.png, /files/b.pdf")).toEqual([
      "files/a.png",
      "files/b.pdf",
    ])
    expect(decodeBaseFilePaths("assets/a.png\nassets/b.pdf")).toEqual([
      "assets/a.png",
      "assets/b.pdf",
    ])
  })

  it("rejects paths that escape the Space or use unsafe schemes", () => {
    expect(normalizeBaseFilePath("../../secret.txt")).toBeNull()
    expect(normalizeBaseFilePath("file:///Users/me/secret.txt")).toBeNull()
    expect(normalizeBaseFilePath("https://example.com/image.png")).toBe(
      "https://example.com/image.png"
    )
  })
})
