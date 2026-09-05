import { $createParagraphNode, $createTextNode, createEditor } from "lexical"
import {
  importInlineSyntax,
  scanInlineSyntax,
  type MarkdownInlineSyntax,
} from "./inline-syntax"
import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"

const syntax: MarkdownInlineSyntax = {
  id: "test.inline",
  scan: () => [{ start: 1, end: 3 }],
  import: (source) => $createTextNode(source),
  export: () => null,
}
describe("inline syntax boundary", () => {
  it("rejects duplicate or unnamespaced registrations before mounting", () => {
    const plugin = {
      apiVersion: 1 as const,
      id: "test.plugin",
      version: "1",
      inlineSyntax: [syntax, syntax],
    }
    expect(() => compileMarkdownPlugins([plugin])).toThrow("unique namespaced")
    expect(() =>
      compileMarkdownPlugins([
        { ...plugin, inlineSyntax: [{ ...syntax, id: "invalid" }] },
      ])
    ).toThrow("unique namespaced")
  })
  it("validates ranges and rejects grammar collisions", () => {
    expect(scanInlineSyntax("abcd", [syntax], [], {})).toHaveLength(1)
    expect(
      scanInlineSyntax("abcd", [syntax], [{ start: 2, end: 4 }], {})
    ).toEqual([])
    expect(() =>
      scanInlineSyntax(
        "abcd",
        [syntax, { ...syntax, id: "test.other" }],
        [],
        {}
      )
    ).toThrow("overlaps")
    for (const range of [
      { start: -1, end: 2 },
      { start: 2, end: 2 },
      { start: 0, end: 8 },
      { start: 0.5, end: 2 },
    ])
      expect(() =>
        scanInlineSyntax("abcd", [{ ...syntax, scan: () => [range] }], [], {})
      ).toThrow("invalid")
  })
  it("accepts inline nodes but rejects blocks and already attached nodes", () => {
    const editor = createEditor({
      onError: (error) => {
        throw error
      },
    })
    editor.update(
      () => {
        expect(importInlineSyntax(syntax, "text", {}).getTextContent()).toBe(
          "text"
        )
        expect(() =>
          importInlineSyntax(
            { ...syntax, import: () => $createParagraphNode() },
            "text",
            {}
          )
        ).toThrow("detached inline")
        expect(() =>
          importInlineSyntax(
            {
              ...syntax,
              import: () => {
                const node = $createTextNode("text")
                $createParagraphNode().append(node)
                return node
              },
            },
            "text",
            {}
          )
        ).toThrow("detached inline")
      },
      { discrete: true }
    )
  })
})
