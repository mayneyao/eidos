import { describe, expect, it } from "vitest"
import { rootPublishedShellAssets } from "../src/gateway"
import {
  validPublicationPath,
  publicationUrlPath,
  decodePublicationPath,
} from "../src/publication-path"
describe("publication paths", () => {
  it("resolves Serve resources from the site root at any publication depth", async () => {
    const response = rootPublishedShellAssets(
      new Response(
        '<script src="./assets/main.js"></script><link rel="stylesheet" href="./assets/main.css"><link href="https://example.com/icon.png">'
      )
    )
    const html = await response.text()
    expect(html).toContain('src="/assets/main.js"')
    expect(html).toContain('href="/assets/main.css"')
    expect(html).toContain('href="https://example.com/icon.png"')
  })
  it.each(["legacy-slug", "运动/2026/骑行.gpx", "docs/My Note.md", "ride.gpx"])(
    "preserves %s",
    (path) => {
      expect(validPublicationPath(path)).toBe(true)
      expect(decodePublicationPath(publicationUrlPath(path))).toBe(path)
      expect(decodePublicationPath(encodeURIComponent(path))).toBe(path)
    }
  )
  it.each([
    "",
    "/a",
    "a/",
    "a//b",
    "a/../b",
    "a/./b",
    "a\\b",
    "a?b",
    "a#b",
    "a%2Fb",
    "_eidos/file",
    "assets/file",
    ".well-known/file",
    "a".repeat(256),
  ])("rejects %s", (path) => expect(validPublicationPath(path)).toBe(false))
})
