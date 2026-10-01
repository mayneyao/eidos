import { describe, expect, it } from "vitest"
import {
  validPublicationPath,
  publicationUrlPath,
  decodePublicationPath,
} from "./publication-path"
describe("publication paths", () => {
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
