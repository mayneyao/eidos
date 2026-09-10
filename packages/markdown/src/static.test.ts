// @vitest-environment node
import { describe, expect, it } from "vitest"
import { micromark } from "micromark"
import { gfm, gfmHtml } from "micromark-extension-gfm"
import {
  renderMarkdownToHtml,
  composeMarkdownGrammar,
  eidosSyntax,
  gfmSyntax,
} from "./static"
import { GFM_GRAMMARS } from "./features/gfm/grammar"

describe("static Markdown rendering", () => {
  it.each([
    "# Heading\n\n**Bold** and *emphasis* with `code`.",
    "| Left | Right |\n| :--- | ---: |\n| a | b |",
    "- [x] Complete\n- [ ] Pending\n\n~~removed~~ https://eidos.space",
    "A note[^one].\n\n[^one]: Footnote **body**.",
    "```html\n<script>alert(1)</script>\n```",
    "![Alt](assets/photo.png)\n\n[File][ref]\n\n[ref]: docs/guide.pdf",
    "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>",
  ])("retains grammar-only rendering compatibility for %s", (source) => {
    expect(renderMarkdownToHtml(source, { grammar: eidosSyntax.grammar })).toBe(
      micromark(source, {
        allowDangerousHtml: false,
        allowDangerousProtocol: false,
        extensions: [gfm()],
        htmlExtensions: [gfmHtml()],
      })
    )
  })

  it("escapes source HTML and rejects executable URL schemes", () => {
    const html = renderMarkdownToHtml(
      "<script>alert(1)</script>\n\n[x](javascript:alert%281%29) ![x](data:text/html,evil)"
    )
    expect(html).not.toContain("<script>")
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('src="data:')
    expect(html).toContain("&lt;script>")
  })

  it("accepts the same composable grammar contributions as the editor", () => {
    const source = "~~deleted~~\n\n- [x] Task"
    const html = renderMarkdownToHtml(source, {
      grammar: composeMarkdownGrammar([GFM_GRAMMARS.strikethrough]),
    })
    expect(html).toContain("<del>deleted</del>")
    expect(html).not.toContain('type="checkbox"')
  })

  it("renders extended syntax by default and allows an explicit GFM profile", () => {
    const source = "[[Note]] and $x$ and ==highlight=="
    const html = renderMarkdownToHtml(source)
    expect(html).toContain('aria-disabled="true">Note</span>')
    expect(html).toContain("<math ")
    expect(html).toContain("<mark>highlight</mark>")
    expect(renderMarkdownToHtml(source, { syntax: gfmSyntax })).toContain(
      source
    )
  })

  it("renders frontmatter, display math, callouts, footnotes and image sizes", () => {
    const html = renderMarkdownToHtml(
      "---\ntitle: Document\n---\n\n$$\nx^2\n$$\n\n> [!note]- Details\n> Equation $y$ and [site][ref].\n\n![Diagram|200x100](assets/a.png)\n\nNote[^a].\n\n[^a]: Footnote\n\n[ref]: https://eidos.space"
    )
    expect(html).toContain("eme-efm-frontmatter")
    expect(html).toContain("<dt>title</dt><dd>Document</dd>")
    expect(html).toContain("eme-efm-math-display")
    expect(html).toContain('<details class="eme-obsidian-callout"')
    expect(html).toMatch(/<summary[^>]*>Details<\/summary>/)
    expect(html).not.toContain("[!note]")
    expect(html).toContain('href="https://eidos.space"')
    expect(html).toContain('width="200" height="100"')
    expect(html).toContain("user-content-fn-a")
  })

  it("preserves protected source and rejects unsafe resolver results", () => {
    const html = renderMarkdownToHtml(
      "`[[Private]] $x$ ==literal==`\n\n```\n%%code%%\n$$\nx\n$$\n```\n\n%%hide $x$%% [[Page|Alias]] #topic ^block",
      {
        resolveInternalLink: () => "javascript:alert(1)",
      }
    )
    expect(html).toContain("<code>[[Private]] $x$ ==literal==</code>")
    expect(html).toContain("%%code%%")
    expect(html).not.toContain("hide")
    expect(html).not.toContain("<math")
    expect(html).not.toContain("javascript:")
    expect(html).toContain(">Alias</span>")
    expect(html).toContain("eme-obsidian-tag")
    expect(html).toContain("obsidian-block-block")
  })

  it("sanitizes HTML while retaining safe markup and inline pairs", () => {
    const html = renderMarkdownToHtml(
      'Text <b>bold</b>.\n\n<div><em>safe</em><a href="data:text/html,evil">blocked</a></div>\n\n<img src="x" onerror="alert(1)">'
    )
    expect(html).toContain("Text <b>bold</b>.")
    expect(html).toContain("<div><em>safe</em><a>blocked</a></div>")
    expect(html).not.toContain("<img")
    expect(html).not.toContain('href="data:')
  })

  it("renders ordinary GFM through the default pipeline", () => {
    const html = renderMarkdownToHtml(
      "# Heading\n\n- [x] done\n- [ ] pending\n\n| a | b |\n| - | - |\n| ~~old~~ | **new** |\n\nhttps://eidos.space"
    )
    for (const marker of [
      ">Heading</h1>",
      'type="checkbox"',
      "disabled",
      "checked",
      "<table>",
      "<del>old</del>",
      "<strong>new</strong>",
      'href="https://eidos.space"',
    ])
      expect(html).toContain(marker)
  })

  it("handles indentation, escapes, nested formatting and malformed delimiters", () => {
    const html = renderMarkdownToHtml(
      "  $$\n  x\n  $$\n\n==**strong**== and \\$literal$\n\n$$\nunterminated"
    )
    expect(html).toContain("eme-efm-math-display")
    expect(html).toContain("<mark><strong>strong</strong></mark>")
    expect(html).toContain("$literal$")
    expect(html).toContain("<pre>$$\nunterminated</pre>")
  })

  it("keeps footnotes and extensions inside tables and nested callouts", () => {
    const html = renderMarkdownToHtml(
      "| a |\n| - |\n| $x$ ==hi== |\n\n> [!note]\n> one\n>\n> > [!tip]+ Nested\n> > two[^n]\n\n[^n]: foot"
    )
    expect(html).toContain("<table>")
    expect(html).toContain("<math")
    expect(html).toContain("<mark>hi</mark>")
    expect(html).toMatch(/<summary[^>]*>Nested<\/summary>/)
    expect(html).toContain("user-content-fn-n")
  })
  it("resolves local heading paths and explicit publisher mappings", () => {
    const html = renderMarkdownToHtml(
      "# Parent\n\n## Child\n\n[[#Parent#Child|Jump]] [[Page|Read]]",
      {
        resolveInternalLink: (target) =>
          target.path === "Page" ? "https://example.com/page" : null,
      }
    )
    expect(html).toContain('href="#user-content-heading-1"')
    expect(html).toContain('href="https://example.com/page"')
  })
  it("never exposes the tail of comments spanning paragraphs", () => {
    const html = renderMarkdownToHtml(
      "before %%private\n\n# still private\n\nprivate too%% after"
    )
    expect(html).not.toContain("private")
    expect(html).toContain("before")
    expect(html).toContain("after")
  })
  it("uses the editor's root-level display-math boundary", () => {
    const html = renderMarkdownToHtml("- $$\n  x\n  $$")
    expect(html).not.toContain("<pre>")
    expect(html).not.toContain("<math")
    expect(html).toContain("$$")
  })

  it("highlights fenced code with the editor's shared tokenizer", () => {
    const html = renderMarkdownToHtml("```ts\nconst answer = 42\n```")
    expect(html).toContain('<span class="eme-code-keyword">const</span>')
    expect(html).toContain('<span class="eme-code-number">42</span>')
  })

  it("leaves unlabelled or plain fenced code unhighlighted", () => {
    expect(renderMarkdownToHtml("```\nplain text\n```")).not.toContain(
      "eme-code-"
    )
    expect(renderMarkdownToHtml("```text\na = 1\n```")).not.toContain(
      "eme-code-"
    )
  })
})
