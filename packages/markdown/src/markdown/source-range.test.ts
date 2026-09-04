import { EIDOS_MARKDOWN_PLUGIN_REGISTRY } from "../plugin-system/builtins"
import { resolveEfmEditableSourceRange } from "./source-range"

const syntaxFeatures = EIDOS_MARKDOWN_PLUGIN_REGISTRY.features

function resolve(
  markdown: string,
  selectedIndices: readonly number[],
  topLevelCount: number,
  inputProfile: "document" | "fragment" = "document"
) {
  return resolveEfmEditableSourceRange({
    inputProfile,
    markdown,
    selectedIndices,
    syntaxFeatures,
    topLevelCount,
  })
}

describe("resolveEfmEditableSourceRange", () => {
  it("maps duplicate blocks to the exact selected source occurrence", () => {
    const markdown = "Same.\n\n\nSame.\n\nSame.\n"
    expect(resolve(markdown, [1], 3)).toEqual({
      range: {
        start: 8,
        end: 13,
        inputProfile: "fragment",
        source: "Same.",
      },
    })
  })

  it("owns complete top-level list and table blocks, including nested source", () => {
    const markdown = `Before

- parent
  - child

| A | B |
| - | - |
| 1 | 2 |

After`
    const result = resolve(markdown, [1, 2], 4)
    expect(result.range?.source).toBe(`- parent
  - child

| A | B |
| - | - |
| 1 | 2 |`)
    expect(result.range?.inputProfile).toBe("fragment")
  })

  it("rejects editor-discontinuous selections", () => {
    expect(resolve("One\n\nTwo\n\nThree", [0, 2], 3)).toEqual({
      reason: "discontinuous-editor-selection",
    })
  })

  it("preserves a source-positioned footnote outside the editable draft", () => {
    const markdown = "One\n\n[^n]: Note\n\nTwo"
    expect(resolve(markdown, [0, 1], 3)).toEqual({
      range: {
        start: 0,
        end: markdown.length,
        expectedSource: markdown,
        inputProfile: "document",
        protectedSourceSuffix: "\n\n[^n]: Note",
        source: "One\n\nTwo",
      },
    })
    expect(resolve(markdown, [2], 3)).toEqual({
      reason: "pinned-footnote",
    })
  })

  it("keeps CRLF separators when moving protected footnote source", () => {
    const markdown = "One\r\n\r\n[^n]: Note\r\n\r\nTwo"
    expect(resolve(markdown, [0, 1], 3).range).toEqual({
      start: 0,
      end: markdown.length,
      expectedSource: markdown,
      inputProfile: "document",
      protectedSourceSuffix: "\r\n\r\n[^n]: Note",
      source: "One\r\n\r\nTwo",
    })
  })

  it("preserves raw CRLF and BOM offsets outside the selected range", () => {
    const markdown = "\ufeffOne\r\n\r\nTwo\r\n\r\nThree\r\n"
    const result = resolve(markdown, [1], 3)
    expect(result.range).toEqual({
      start: 8,
      end: 11,
      inputProfile: "fragment",
      source: "Two",
    })
    expect(
      `${markdown.slice(0, result.range!.start)}Changed${markdown.slice(
        result.range!.end
      )}`
    ).toBe("\ufeffOne\r\n\r\nChanged\r\n\r\nThree\r\n")
  })

  it("keeps document parsing only for a range that starts at source offset zero", () => {
    const markdown = "---\ntitle: Note\n---\n\nBody"
    expect(resolve(markdown, [0], 2).range?.inputProfile).toBe("document")
    expect(resolve(markdown, [1], 2).range?.inputProfile).toBe("fragment")
  })
})
