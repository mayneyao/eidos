import { describe, expect, it } from "vitest"
import { eidosPreset, gfmPreset } from "../presets"
import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"
import { eidosSyntax, EIDOS_EXTENSION_IDS } from "./presets"
import { STATIC_EXTENSION_SUPPORT } from "../static/render"
import { renderMarkdownToHtml } from "../static"
import { vaultInlineSyntax } from "../features/vault-inline/syntax"
import { scanVaultInline } from "../features/vault-inline/semantics"
import { MARKDOWN_FEATURES } from "../plugin-system/feature-ids"

describe("editor/static syntax contract", () => {
  it("uses the same extension manifest and composed parser grammar", () => {
    const base = new Set(gfmPreset.plugins.map((plugin) => plugin.id))
    expect(
      eidosPreset.plugins
        .filter((plugin) => !base.has(plugin.id))
        .map((plugin) => plugin.id)
        .sort()
    ).toEqual([...EIDOS_EXTENSION_IDS].sort())
    expect(Object.keys(STATIC_EXTENSION_SUPPORT).sort()).toEqual(
      [...EIDOS_EXTENSION_IDS].sort()
    )
    expect(compileMarkdownPlugins(eidosPreset.plugins).grammar).toEqual(
      eidosSyntax.grammar
    )
  })
  it("shares inline source ownership, including overlapping constructs", () => {
    const source = "%%[[hidden]] $x$%% [[Page|alias]] #tag ^[note] ^id"
    const features = new Set(Object.values(MARKDOWN_FEATURES))
    const expected = scanVaultInline(source, () => true, []).map(
      ({ start, end }) => ({ start, end })
    )
    const actual = vaultInlineSyntax
      .flatMap((syntax) =>
        syntax.scan(source, {
          protectedRanges: [],
          options: { syntaxFeatures: features },
        })
      )
      .sort((a, b) => a.start - b.start)
    expect(actual).toEqual(expected)
  })
  it.each([
    ["eidos.math", "$x$", "<math"],
    ["eidos.footnote", "note[^a]\n\n[^a]: footnote", "user-content-fn-a"],
    ["eidos.frontmatter", "---\na: 1\n---", "eme-efm-frontmatter"],
    ["eidos.highlight", "==marked==", "<mark>"],
    ["markdown.wikilink", "[[Page]]", "eme-obsidian-link"],
    ["markdown.tag", "#topic", "eme-obsidian-tag"],
    ["markdown.comment", "visible %%hidden%%", "<p>visible</p>"],
    ["markdown.block-id", "body ^id", "obsidian-block-id"],
    [
      "markdown.inline-footnote",
      "body ^[note]",
      "eme-obsidian-inline-footnote",
    ],
    ["markdown.callout", "> [!note]\n> body", "eme-obsidian-callout"],
    ["markdown.attachment", "![alt|200](asset.png)", 'width="200"'],
    ["markdown.vault-link", "[page](page.md)", 'href="page.md"'],
  ])("renders %s", (_id, source, marker) => {
    expect(renderMarkdownToHtml(source)).toContain(marker)
  })
})
