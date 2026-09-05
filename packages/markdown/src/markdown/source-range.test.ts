import { EIDOS_MARKDOWN_PLUGIN_REGISTRY } from "../plugin-system/builtins"
import { resolveEfmEditableSourceRange } from "./source-range"
import { OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY } from "../plugin-system/builtins"
import { obsidianMarkdownProfile } from "../profile-system/builtins"
import type { MarkdownDocumentAnalysis } from "../core/document-contract"
import { analyzeEfmMarkdown } from "./efm-document"

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
  it("uses a custom codec's projection without knowing its syntax or feature IDs", () => {
    const markdown = "A\n\nB\n\nC"
    const analysis: MarkdownDocumentAnalysis = {
      normalizedSource: markdown,
      diagnostics: [],
      segments: [
        { start: 0, end: 1, source: "A" },
        {
          start: 3,
          end: 4,
          source: "B",
          projection: { placement: "end", sourceEditable: false },
        },
        { start: 6, end: 7, source: "C" },
      ],
    }
    const options = {
      markdown,
      analyze: () => analysis,
      inputProfile: "document" as const,
      syntaxFeatures: new Set<string>(),
      topLevelCount: 3,
    }
    expect(
      resolveEfmEditableSourceRange({ ...options, selectedIndices: [1] }).range
        ?.source
    ).toBe("C")
    expect(
      resolveEfmEditableSourceRange({ ...options, selectedIndices: [0, 1] })
        .range
    ).toMatchObject({
      source: "A\n\nC",
      expectedSource: markdown,
      protectedSourceSuffix: "\n\nB",
    })
    expect(
      resolveEfmEditableSourceRange({ ...options, selectedIndices: [2] })
    ).toEqual({ reason: "protected-block" })
  })

  it("does not project footnotes when their syntax feature is disabled", () => {
    const markdown = "One\n\n[^n]: Note\n\nTwo"
    const syntaxFeatures = new Set<string>()
    const analysis = analyzeEfmMarkdown(markdown, { syntaxFeatures })
    expect(
      analysis.segments.every((segment) => segment.projection === undefined)
    ).toBe(true)
    expect(
      resolveEfmEditableSourceRange({
        markdown,
        syntaxFeatures,
        inputProfile: "document",
        selectedIndices: [1],
        topLevelCount: 3,
      }).range?.source
    ).toBe("[^n]: Note")
  })
  it("maps Obsidian footnotes using the active profile", () => {
    const markdown = "One[^n]\n\n[^n]: Note\n\nTwo"
    const options = {
      analyze: obsidianMarkdownProfile.codec.analyze,
      inputProfile: "document" as const,
      markdown,
      syntaxFeatures: OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY.features,
      topLevelCount: 3,
    }
    expect(
      resolveEfmEditableSourceRange({ ...options, selectedIndices: [1] }).range
        ?.source
    ).toBe("Two")
    expect(
      resolveEfmEditableSourceRange({ ...options, selectedIndices: [2] })
    ).toEqual({ reason: "protected-block" })
  })
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
      reason: "protected-block",
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
