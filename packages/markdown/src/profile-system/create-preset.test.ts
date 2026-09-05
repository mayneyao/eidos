import {
  createEditor,
  $getRoot,
  $isElementNode,
  type LexicalNode,
} from "lexical"
import { $isTableNode } from "@lexical/table"
import { $isListItemNode } from "@lexical/list"
import {
  commonmarkPreset,
  gfmPreset,
  eidosPreset,
  minimalPreset,
  obsidianPreset,
} from "../presets"
import { headingPlugin, listPlugin } from "../features/commonmark/plugin"
import { createMarkdownPreset } from "./create-preset"
import {
  tablePlugin,
  taskListPlugin,
  autolinkPlugin,
  strikethroughPlugin,
} from "../features/gfm/individual-plugins"
import { mathPlugin, footnotePlugin } from "../plugin-system/builtins"
import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"
import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"
import { $isEfmBlockNode, $isEfmInlineNode } from "../nodes/efm-semantic-node"
import type { MarkdownProfile } from "./profile-api"
import { wikilinkPlugin } from "../features/wikilink/plugin"
import { frontmatterPlugin } from "../plugin-system/builtins"
import { rawHtmlPlugin } from "../features/html/plugin"
import {
  calloutPlugin,
  attachmentPlugin,
} from "../features/vault-blocks/plugins"
import { obsidianMarkdownProfile } from "./builtins"
import { $createEfmInlineNode, EfmInlineNode } from "../nodes/efm-semantic-node"
import type { MarkdownPlugin } from "../plugin-system/plugin-api"
import {
  embedPlugin,
  tagPlugin,
  commentPlugin,
  blockIdPlugin,
  inlineFootnotePlugin,
} from "../features/vault-inline/plugins"

function flatten(node: LexicalNode): LexicalNode[] {
  return [
    node,
    ...($isElementNode(node) ? node.getChildren().flatMap(flatten) : []),
  ]
}
function inspect(profile: MarkdownProfile, source: string) {
  const registry = compileMarkdownPlugins(profile.plugins)
  const editor = createEditor({
    nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
    onError(error) {
      throw error
    },
  })
  editor.update(() => profile.codec.import(source, registry.transformers, {}), {
    discrete: true,
  })
  return editor.getEditorState().read(() => {
    const nodes = flatten($getRoot())
    return {
      types: nodes.map((node) => node.getType()),
      tables: nodes.filter($isTableNode).length,
      checked: nodes
        .filter($isListItemNode)
        .map((node) => node.getChecked())
        .filter((checked) => typeof checked === "boolean"),
      inlines: nodes.filter($isEfmInlineNode).map((node) => node.getData()),
      blocks: nodes.filter($isEfmBlockNode).map((node) => node.getData()),
      source: profile.codec.export(registry.transformers),
    }
  })
}
const source =
  "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] Done\n\n~~Removed~~ and www.example.com\n\nAn $x^2$ equation and note[^a].\n\n[^a]: Explanation."
const custom = (plugins: MarkdownProfile["plugins"]) =>
  createMarkdownPreset({
    id: "test.custom",
    extends: commonmarkPreset,
    plugins,
  })

describe("composable presets", () => {
  it("imports root HTML through its plugin without a central feature flag", () => {
    const preset = createMarkdownPreset({
      id: "test.html-owner",
      extends: minimalPreset,
      plugins: [{ ...rawHtmlPlugin, features: [] }],
    })
    const source = "<div>Portable HTML</div>"
    const result = inspect(preset, source)
    expect(result.blocks.map((block) => block.kind)).toEqual(["raw-html"])
    expect(result.source).toBe(source)
    expect(preset.codec.analyze(source, {}).segments[0]).toMatchObject({
      syntaxId: "markdown.html.block",
    })
  })

  it("retains active HTML diagnostics and inert source with the HTML plugin enabled", () => {
    for (const source of [
      "<script>alert(1)</script>",
      '<div onclick="alert(1)">Text</div>',
    ]) {
      const result = inspect(commonmarkPreset, source)
      expect(result.blocks).toEqual([])
      expect(result.source).toBe(source)
      const analysis = commonmarkPreset.codec.analyze(source, {})
      expect(analysis.diagnostics.map((entry) => entry.code)).toContain(
        "efm-unsafe-raw-html"
      )
      expect(analysis.segments[0]).not.toHaveProperty("syntaxId")
    }
  })

  it("imports callouts through their parsed-block owner without a feature flag", () => {
    const preset = custom([{ ...calloutPlugin, features: [] }])
    const source = "> [!warning]- Read carefully\n> **Body**\n>\n> - Item"
    const result = inspect(preset, source)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toMatchObject({
      kind: "obsidian-callout",
      calloutType: "warning",
      calloutTitle: "Read carefully",
      calloutFold: "-",
    })
    expect(result.blocks[0].previewHtml).toContain("<strong>Body</strong>")
    expect(result.source).toBe(source)
    expect(
      inspect(commonmarkPreset, source).blocks.some(
        (block) => block.kind === "obsidian-callout"
      )
    ).toBe(false)
  })

  it("does not claim nested callout-like text as a root block", () => {
    const preset = custom([calloutPlugin])
    const source =
      "```md\n> [!note]\n> Example\n```\n\n- Item\n\n  > [!note]\n  > Nested"
    expect(
      inspect(preset, source).blocks.some(
        (block) => block.kind === "obsidian-callout"
      )
    ).toBe(false)
    expect(
      preset.codec
        .analyze(source, {})
        .segments.map((block) => block.source)
        .join("\n\n")
    ).toBe(source)
  })
  it("imports inline equations through the plugin registry without a math feature flag", () => {
    const preset = custom([{ ...mathPlugin, features: [] }])
    const source = "An $x^2$ equation.\n\n- A $y$ equation"
    const result = inspect(preset, source)
    expect(result.inlines.map((node) => [node.kind, node.value])).toEqual([
      ["math", "x^2"],
      ["math", "y"],
    ])
    expect(result.source).toBe(source)
  })
  it("keeps code and links literal when math is enabled", () => {
    const source = "`$code$` and [$link$](https://example.com) and $x$"
    const result = inspect(custom([mathPlugin]), source)
    expect(
      result.inlines
        .filter((node) => node.kind === "math")
        .map((node) => node.value)
    ).toEqual(["x"])
    expect(result.source).toBe(source)
    expect(
      inspect(commonmarkPreset, source).inlines.filter(
        (node) => node.kind === "math"
      )
    ).toEqual([])
  })
  it("does not import an escaped opening delimiter as math", () => {
    const result = inspect(custom([mathPlugin]), "\\$escaped$ and $x$")
    expect(
      result.inlines
        .filter((node) => node.kind === "math")
        .map((node) => node.value)
    ).toEqual(["x"])
  })
  it("does not infer parser behavior from a plugin feature namespace", () => {
    const preset = custom([
      {
        apiVersion: 1,
        id: "test.metadata",
        version: "1",
        features: ["obsidian.third-party-metadata"],
      },
    ])
    const source = "> [!note] Ordinary quote\n> Content\n\n```math\nx\n```"
    expect(inspect(preset, source)).toEqual(inspect(commonmarkPreset, source))
    expect(preset.codec.analyze(source, {}).segments).toEqual(
      commonmarkPreset.codec.analyze(source, {}).segments
    )
  })
  it("keeps inner math literal inside comments and wiki aliases", () => {
    const source = "%% $x$ %% and [[Note|$x$]]"
    const result = inspect(obsidianPreset, source)
    expect(result.inlines.map((node) => node.kind)).toEqual([
      "obsidian-comment",
      "obsidian-link",
    ])
    expect(result.source).toBe(source)
  })
  it("imports and exports custom inline syntax without a central feature flag", () => {
    const plugin: MarkdownPlugin = {
      apiVersion: 1,
      id: "test.badge",
      version: "1",
      nodes: [EfmInlineNode],
      inlineSyntax: [
        {
          id: "test.badge.syntax",
          scan: (source) =>
            [...source.matchAll(/::([a-z]+)::/gu)].map((match) => ({
              start: match.index,
              end: match.index + match[0].length,
            })),
          import: (source) =>
            $createEfmInlineNode({
              kind: "obsidian-tag",
              source,
              value: source.slice(2, -2),
            }),
          export: (node) =>
            $isEfmInlineNode(node) ? node.getData().source : null,
        },
      ],
    }
    const markdown =
      "::badge:: and `::code::` and [::link::](https://example.com)\n\n- ::item::"
    const preset = custom([plugin])
    const result = inspect(preset, markdown)
    expect(result.inlines.map((node) => node.value)).toEqual(["badge", "item"])
    expect(result.source).toBe(markdown)
    expect(inspect(commonmarkPreset, markdown).inlines).toEqual([])
  })
  it("composes the Vault preset from independent owners with legacy rendering parity", () => {
    const source =
      "---\ntitle: Vault\n---\n\n[[Note]] and ![[Other]] #tag ^[inline] %%hidden%%\n\nText ^block\n\n> [!note] Title\n> Body\n\n![Caption|240](image.png)\n\nMath $x$ and note[^a].\n\n[^a]: Explanation."
    expect(obsidianPreset.plugins.map((plugin) => plugin.id)).not.toContain(
      "obsidian.syntax"
    )
    expect(inspect(obsidianPreset, source)).toEqual(
      inspect(obsidianMarkdownProfile, source)
    )
    const withoutCallouts = createMarkdownPreset({
      id: "test.no-callouts",
      extends: obsidianPreset,
      exclude: [calloutPlugin.id],
    })
    expect(
      inspect(withoutCallouts, source).blocks.map((node) => node.kind)
    ).not.toContain("obsidian-callout")
    const withoutDimensions = createMarkdownPreset({
      id: "test.no-dimensions",
      extends: obsidianPreset,
      exclude: [attachmentPlugin.id],
    })
    expect(
      inspect(withoutDimensions, "![Caption|240](image.png)").blocks[0]?.alt
    ).toBe("Caption|240")
  })
  it.each([
    [embedPlugin, "![[Note]]", "obsidian-embed"],
    [tagPlugin, "#topic", "obsidian-tag"],
    [commentPlugin, "%%private%%", "obsidian-comment"],
    [blockIdPlugin, "Text ^block", "obsidian-block-id"],
    [inlineFootnotePlugin, "Text ^[note]", "obsidian-inline-footnote"],
  ] as const)("independently composes %s", (plugin, markdown, kind) => {
    const preset = createMarkdownPreset({
      id: "test.inline",
      extends: minimalPreset,
      plugins: [plugin],
    })
    expect(inspect(preset, markdown).inlines.map((node) => node.kind)).toEqual([
      kind,
    ])
    expect(inspect(preset, markdown).source).toBe(markdown)
    expect(inspect(minimalPreset, markdown).inlines).toEqual([])
  })
  it("does not reinterpret ordinary image alt text when adding a vault plugin", () => {
    const markdown = "An image ![Caption|240x120](photo.png) here."
    const plain = inspect(commonmarkPreset, markdown)
    const mixed = inspect(custom([wikilinkPlugin]), markdown)
    expect(mixed.inlines).toEqual(plain.inlines)
    expect(mixed.inlines[0]?.alt).toBe("Caption|240x120")
    const block = "![Caption|240x120](photo.png)"
    expect(inspect(custom([wikilinkPlugin]), block).blocks).toEqual(
      inspect(commonmarkPreset, block).blocks
    )
  })
  it("adds wiki links without replacing independently selected math, footnotes or properties", () => {
    const markdown =
      "---\ntitle: Mixed\n---\n\n[[Note]] and $x$ and a note[^a].\n\n[^a]: Explanation."
    const output = inspect(
      custom([wikilinkPlugin, mathPlugin, footnotePlugin, frontmatterPlugin]),
      markdown
    )
    expect(output.inlines.map((node) => node.kind)).toContain("obsidian-link")
    expect(output.inlines.map((node) => node.kind)).toContain("math")
    expect(output.blocks.map((node) => node.kind)).toContain("frontmatter")
    expect(output.blocks.map((node) => node.kind)).toContain(
      "footnote-definition"
    )
    expect(output.source).toBe(markdown)
  })
  it("enables wiki links alone without enabling embeds or other vault syntax", () => {
    const markdown = "[[Note]] ![[Other]] #tag ^[note]"
    const preset = createMarkdownPreset({
      id: "test.wiki-only",
      extends: minimalPreset,
      plugins: [wikilinkPlugin],
    })
    const output = inspect(preset, markdown)
    expect(output.inlines.map((node) => node.kind)).toEqual(["obsidian-link"])
    expect(output.source).toBe(markdown)
  })
  it("starts with literal text and adds only the selected CommonMark syntax", () => {
    const text = "# Title\n\n- item\n\n**strong** and `code`\n\n> quote"
    const plain = inspect(minimalPreset, text)
    expect(plain.types).not.toContain("heading")
    expect(plain.types).not.toContain("list")
    expect(plain.types).not.toContain("quote")
    const headings = createMarkdownPreset({
      id: "test.headings-only",
      extends: minimalPreset,
      plugins: [headingPlugin],
    })
    expect(inspect(headings, text).types).toContain("heading")
    expect(inspect(headings, text).types).not.toContain("list")
    expect(inspect(headings, text).types).not.toContain("quote")
    const tasks = createMarkdownPreset({
      id: "test.tasks-only",
      extends: minimalPreset,
      plugins: [listPlugin, taskListPlugin],
    })
    expect(inspect(tasks, "- [x] Done").checked).toEqual([true])
    expect(tasks.plugins.map((plugin) => plugin.id)).not.toContain(
      "eidos.commonmark"
    )
  })
  it("enables a table without enabling task lists, automatic links or math", () => {
    const output = inspect(custom([tablePlugin]), source)
    expect(output.tables).toBe(1)
    expect(output.checked).toEqual([])
    expect(output.inlines).toEqual([])
    expect(output.source).toBe(source.replace(/~~/gu, "\\~\\~"))
  })
  it("enables task lists without installing tables", () => {
    const output = inspect(custom([taskListPlugin]), source)
    expect(output.tables).toBe(0)
    expect(output.checked).toEqual([true])
    expect(output.source).toBe(source.replace(/~~/gu, "\\~\\~"))
  })
  it("keeps CommonMark angle links but does not interpret bare URLs", () => {
    const markdown = "www.example.com and <https://example.com>"
    expect(
      inspect(commonmarkPreset, markdown).inlines.map((node) => node.kind)
    ).toEqual(["autolink"])
    expect(
      inspect(custom([autolinkPlugin]), markdown).inlines.map(
        (node) => node.kind
      )
    ).toEqual(["autolink", "autolink"])
  })
  it("composes math and footnotes independently of GFM extensions", () => {
    const output = inspect(custom([mathPlugin, footnotePlugin]), source)
    expect(output.tables).toBe(0)
    expect(output.checked).toEqual([])
    expect(output.inlines.map((node) => node.kind)).toContain("math")
    expect(output.blocks.map((node) => node.kind)).toContain(
      "footnote-definition"
    )
    expect(output.source).toBe(source.replace(/~~/gu, "\\~\\~"))
  })
  it("renders disabled extensions literally inside a semantic container too", () => {
    const markdown = "> ~~removed~~ www.example.com\n>\n>     code"
    const plain = inspect(commonmarkPreset, markdown)
    const enabled = inspect(
      custom([strikethroughPlugin, autolinkPlugin]),
      markdown
    )
    expect(plain.blocks[0]?.previewHtml).not.toContain("<del>")
    expect(plain.blocks[0]?.previewHtml).not.toContain("href=")
    expect(enabled.blocks[0]?.previewHtml).toContain("<del>")
    expect(enabled.blocks[0]?.previewHtml).toContain("href=")
    expect(plain.source).toBe(markdown)
  })
  it("supports preset exclusions and detects missing dependencies", () => {
    const withoutTables = createMarkdownPreset({
      id: "test.no-tables",
      extends: gfmPreset,
      exclude: [tablePlugin.id],
    })
    expect(inspect(withoutTables, source).tables).toBe(0)
    expect(() => custom([taskListPlugin])).not.toThrow()
    expect(() =>
      createMarkdownPreset({ id: "test.broken", plugins: [taskListPlugin] })
    ).toThrow("requires missing plugin")
    expect(() =>
      createMarkdownPreset({
        id: "test.typo",
        extends: commonmarkPreset,
        exclude: ["not.a-plugin"],
      })
    ).toThrow("unknown")
  })
  it("does not mutate a reused base preset", () => {
    const before = commonmarkPreset.plugins.map((plugin) => plugin.id)
    custom([tablePlugin])
    expect(commonmarkPreset.plugins.map((plugin) => plugin.id)).toEqual(before)
    expect(inspect(gfmPreset, source).tables).toBe(1)
    expect(
      inspect(eidosPreset, source).blocks.map((node) => node.kind)
    ).toContain("footnote-definition")
  })
})
