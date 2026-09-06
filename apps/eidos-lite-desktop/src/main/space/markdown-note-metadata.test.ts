import { describe, expect, it } from "vitest"
import { markdownNoteAliases } from "./markdown-note-metadata"

describe("Markdown note aliases", () => {
  it("reads quoted lists, scalar aliases, BOM and legacy alias", () => {
    expect(
      markdownNoteAliases(
        '\uFEFF---\r\naliases: ["中文名", "a: b", "a: b"]\r\n---\r\nBody'
      )
    ).toEqual(["中文名", "a: b"])
    expect(
      markdownNoteAliases("---\naliases:\n  - First\n  - Second\n---\n")
    ).toEqual(["First", "Second"])
    expect(markdownNoteAliases("---\nalias: Old name\n---")).toEqual([
      "Old name",
    ])
  })
  it("does not interpret body text, YAML aliases, objects, or malformed frontmatter", () => {
    for (const source of [
      "Text\n---\naliases: Hidden\n---",
      "---\naliases: [broken\n---",
      "---\naliases: {name: value}\n---",
      "---\n[one, two]\n---",
      "---\naliases: &a [*a, *a]\n---",
    ])
      expect(markdownNoteAliases(source)).toEqual([])
    expect(
      markdownNoteAliases(
        '---\naliases: [null, true, 12, "Valid", "[[bad]]"]\n---'
      )
    ).toEqual(["Valid"])
  })
})
