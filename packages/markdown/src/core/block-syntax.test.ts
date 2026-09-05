import { $createCodeNode, $isCodeNode, CodeNode } from "@lexical/code-core"
import { $createTextNode, $getRoot, createEditor } from "lexical"
import {
  importBlockSyntax,
  scanBlockSyntax,
  type MarkdownBlockSyntax,
} from "./block-syntax"
import { compileMarkdownPlugins, defineMarkdownPlugin } from "../plugin-system"
import { eidosMarkdownPlugins } from "../plugin-system/builtins"
import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"
import { eidosMarkdownProfile } from "../profile-system/builtins"

const noteSyntax: MarkdownBlockSyntax = {
  id: "test.note",
  scan(source) {
    return Array.from(
      source.matchAll(/^:::note\n[\s\S]*?\n:::$/gmu),
      (match) => ({ start: match.index, end: match.index + match[0].length })
    )
  },
  import(source) {
    return $createCodeNode("test-note").append(
      $createTextNode(source.split("\n").slice(1, -1).join("\n"))
    )
  },
  export(node) {
    return $isCodeNode(node) && node.getLanguage() === "test-note"
      ? `:::note\n${node.getTextContent()}\n:::`
      : null
  },
}

const notePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "test.notes",
  version: "1",
  nodes: [CodeNode],
  blockSyntax: [noteSyntax],
})

describe("plugin block syntax", () => {
  it("allows explicit whole-block ownership without weakening scanner protection", () => {
    const source = "> [!note]\n> Body"
    const block = { start: 0, end: source.length, type: "blockquote", source }
    const syntax: MarkdownBlockSyntax = {
      ...noteSyntax,
      scan: undefined,
      matchParsedBlock: (candidate) => candidate.type === "blockquote",
    }
    expect(scanBlockSyntax(source, [syntax], [block], {}, [block])).toEqual([
      { ...block, syntaxId: syntax.id },
    ])
    expect(
      scanBlockSyntax(
        source,
        [{ ...noteSyntax, scan: () => [block] }],
        [block],
        {},
        [block]
      )
    ).toEqual([])
    expect(scanBlockSyntax(source, [syntax], [block], {})).toEqual([])
  })

  it("rejects two parsed-block owners claiming the same root block", () => {
    const source = "> Note"
    const syntax: MarkdownBlockSyntax = {
      ...noteSyntax,
      scan: undefined,
      matchParsedBlock: () => true,
    }
    expect(() =>
      scanBlockSyntax(
        source,
        [syntax, { ...syntax, id: "test.other" }],
        [],
        {},
        [{ start: 0, end: source.length, type: "blockquote", source }]
      )
    ).toThrow(/overlaps/u)
  })

  it("rejects block contributions with no recognizer", () => {
    expect(() =>
      compileMarkdownPlugins([
        { ...notePlugin, blockSyntax: [{ ...noteSyntax, scan: undefined }] },
      ])
    ).toThrow(/scanner or parsed-block matcher/u)
  })
  it("rejects text nodes and attached nodes at the import boundary", () => {
    const editor = createEditor({ nodes: [CodeNode] })
    editor.update(
      () => {
        expect(() =>
          importBlockSyntax(
            { ...noteSyntax, import: () => $createTextNode("invalid") },
            "",
            {}
          )
        ).toThrow(/detached block/u)
        const attached = $createCodeNode()
        $getRoot().append(attached)
        expect(() =>
          importBlockSyntax({ ...noteSyntax, import: () => attached }, "", {})
        ).toThrow(/detached block/u)
      },
      { discrete: true }
    )
  })

  it("imports, edits, and exports a third-party grammar without changing the core", () => {
    const registry = compileMarkdownPlugins([
      ...eidosMarkdownPlugins,
      notePlugin,
    ])
    const editor = createEditor({
      nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
    })
    const source = "Before\n\n:::note\nHello\n:::\n\nAfter"
    const options = {
      blockSyntax: registry.blockSyntax,
      syntaxFeatures: registry.features,
    }
    const analysis = eidosMarkdownProfile.codec.analyze(source, options)
    expect(analysis.segments.map((segment) => segment.source)).toEqual([
      "Before",
      ":::note\nHello\n:::",
      "After",
    ])
    editor.update(
      () => {
        eidosMarkdownProfile.codec.import(
          source,
          registry.transformers,
          options
        )
        const note = $getRoot().getChildAtIndex(1)
        expect($isCodeNode(note)).toBe(true)
        if ($isCodeNode(note)) note.clear().append($createTextNode("Changed"))
      },
      { discrete: true }
    )
    expect(
      editor
        .getEditorState()
        .read(() => eidosMarkdownProfile.codec.export(registry.transformers))
    ).toBe(source.replace("Hello", "Changed"))
  })

  it("does not activate an unregistered grammar", () => {
    const source = ":::note\nHello\n:::"
    expect(scanBlockSyntax(source, [], [], {})).toEqual([])
    const editor = createEditor({
      nodes: [
        ...MARKDOWN_EDITOR_CORE_NODES,
        ...compileMarkdownPlugins(eidosMarkdownPlugins).nodes,
      ],
    })
    editor.update(
      () => eidosMarkdownProfile.codec.import(source, [], { blockSyntax: [] }),
      { discrete: true }
    )
    expect(
      editor
        .getEditorState()
        .read(() => $getRoot().getChildren().some($isCodeNode))
    ).toBe(false)
  })

  it("does not recognize grammar starts inside protected code", () => {
    const source = ":::note\nHello\n:::"
    expect(
      scanBlockSyntax(
        source,
        [noteSyntax],
        [{ start: 0, end: source.length }],
        {}
      )
    ).toEqual([])
  })

  it("rejects overlapping grammars rather than silently choosing one", () => {
    expect(() =>
      scanBlockSyntax(
        ":::note\nHello\n:::",
        [noteSyntax, { ...noteSyntax, id: "test.other" }],
        [],
        {}
      )
    ).toThrow(/overlaps/u)
  })

  it("rejects ranges that split a source line", () => {
    expect(() =>
      scanBlockSyntax(
        "text",
        [{ ...noteSyntax, scan: () => [{ start: 1, end: 4 }] }],
        [],
        {}
      )
    ).toThrow(/whole-line/u)
  })

  it("rejects duplicate grammar registrations", () => {
    expect(() =>
      compileMarkdownPlugins([notePlugin, { ...notePlugin, id: "test.other" }])
    ).toThrow(/unique namespaced/u)
  })
})
