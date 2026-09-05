import { describe, expect, it } from "vitest"
import { isRelativeMarkdownDestination } from "./relative-link-behavior"

describe("relative Markdown destinations", () => {
  it.each([
    "Notes/Next%20note.md#Section",
    "../note.md",
    "/docs/note",
    "#heading",
    "note with spaces.md",
  ])("preserves %s", (destination) => {
    expect(isRelativeMarkdownDestination(destination)).toBe(true)
  })

  it.each([
    "",
    "https://example.com",
    "mailto:a@example.com",
    "javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,test",
    "//example.com",
    "\\\\example.com",
    "/\\example.com",
  ])("does not bypass URL sanitization for %s", (destination) => {
    expect(isRelativeMarkdownDestination(destination)).toBe(false)
  })
})
