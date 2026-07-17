import { describe, expect, it } from "vitest"

import { BASE_DOCUMENTS } from "./base-documents"
import { renderBaseMarkdown } from "./markdown"

describe("Base documentation Markdown", () => {
  it("builds stable heading anchors and rewrites bundled documentation links", () => {
    const rendered = renderBaseMarkdown(`
## File format
### SQLite schema
## File format

[Runtime](runtime.en.md)
`)

    expect(rendered.headings).toEqual([
      { id: "file-format", level: 2, text: "File format" },
      { id: "sqlite-schema", level: 3, text: "SQLite schema" },
      { id: "file-format-2", level: 2, text: "File format" },
    ])
    expect(rendered.html).toContain('href="#/docs/runtime"')
  })

  it("removes executable HTML and unsafe URLs", () => {
    const rendered = renderBaseMarkdown(`
<script>window.bad = true</script>
<a href="javascript:alert(1)" onclick="alert(2)">Unsafe</a>
`)

    expect(rendered.html).not.toContain("script")
    expect(rendered.html).not.toContain("javascript:")
    expect(rendered.html).not.toContain("onclick")
  })

  it("syntax-highlights fenced code and preserves its language", () => {
    const rendered = renderBaseMarkdown(`
\`\`\`ts
const message: string = "Hello Base"
\`\`\`
`)

    expect(rendered.html).toContain('data-language="TS"')
    expect(rendered.html).toContain('data-highlighted="true"')
    expect(rendered.html).toContain('class="token keyword"')
    expect(rendered.html).toContain('class="token string"')
  })

  it("publishes a complete external editor and custom-view path", () => {
    const runtime = BASE_DOCUMENTS.find(
      (document) => document.slug === "runtime"
    )!
    const views = BASE_DOCUMENTS.find(
      (document) => document.slug === "custom-views"
    )!

    for (const markdown of [
      ...BASE_DOCUMENTS.map((document) => document.markdown.en),
      ...BASE_DOCUMENTS.map((document) => document.markdown.zh),
    ]) {
      expect(markdown).not.toMatch(
        /Implementation Status|验收矩阵|docs\/rfcs|Living RFC/i
      )
    }

    for (const markdown of [runtime.markdown.en, runtime.markdown.zh]) {
      expect(markdown).toContain("@eidos.space/base")
      expect(markdown).toContain("@eidos.space/base-ui")
      expect(markdown).toContain("BaseConnection")
      expect(markdown).toContain("BaseEditorDataSource")
      expect(markdown).toContain("BaseEditorView")
      expect(markdown).toContain("FileSystemFileHandle")
    }

    for (const markdown of [views.markdown.en, views.markdown.zh]) {
      expect(markdown).toContain("BaseViewRenderer")
      expect(markdown).toContain("builtInBaseViewRenderers")
      expect(markdown).toContain("com.example.timeline")
      expect(markdown).toContain("source.getPage")
      expect(markdown).toContain("source.updateView")
    }
  })
})
