import { describe, expect, it } from "vitest"

import { EIDOS_FILE_DOCUMENTS } from "./eidos-file-documents"
import { renderEidosFileMarkdown } from "./markdown"

describe("Eidos File documentation Markdown", () => {
  it("builds stable heading anchors and rewrites bundled documentation links", () => {
    const rendered = renderEidosFileMarkdown(`
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
    const rendered = renderEidosFileMarkdown(`
<script>window.bad = true</script>
<a href="javascript:alert(1)" onclick="alert(2)">Unsafe</a>
`)

    expect(rendered.html).not.toContain("script")
    expect(rendered.html).not.toContain("javascript:")
    expect(rendered.html).not.toContain("onclick")
  })

  it("syntax-highlights fenced code and preserves its language", () => {
    const rendered = renderEidosFileMarkdown(`
\`\`\`ts
const message: string = "Hello Eidos File"
\`\`\`
`)

    expect(rendered.html).toContain('data-language="TS"')
    expect(rendered.html).toContain('data-highlighted="true"')
    expect(rendered.html).toContain('class="token keyword"')
    expect(rendered.html).toContain('class="token string"')
  })

  it("publishes a complete external editor and custom-view path", () => {
    const runtime = EIDOS_FILE_DOCUMENTS.find(
      (document) => document.slug === "runtime"
    )!
    const views = EIDOS_FILE_DOCUMENTS.find(
      (document) => document.slug === "custom-views"
    )!
    const plugins = EIDOS_FILE_DOCUMENTS.find(
      (document) => document.slug === "plugins"
    )!

    for (const markdown of [
      ...EIDOS_FILE_DOCUMENTS.map((document) => document.markdown.en),
      ...EIDOS_FILE_DOCUMENTS.map((document) => document.markdown.zh),
    ]) {
      expect(markdown).not.toMatch(
        /Implementation Status|验收矩阵|docs\/rfcs|Living RFC/i
      )
    }

    for (const markdown of [runtime.markdown.en, runtime.markdown.zh]) {
      expect(markdown).toContain("@eidos.space/eidos-file")
      expect(markdown).toContain("@eidos.space/eidos-file-ui")
      expect(markdown).toContain("EidosFileConnection")
      expect(markdown).toContain("EidosFileEditorDataSource")
      expect(markdown).toContain("EidosFileEditorView")
      expect(markdown).toContain("FileSystemFileHandle")
    }

    for (const markdown of [views.markdown.en, views.markdown.zh]) {
      expect(markdown).toContain("EidosFileViewRenderer")
      expect(markdown).toContain("defineEidosFilePlugin")
      expect(markdown).toContain("com.example.timeline")
      expect(markdown).toContain("source.getPage")
      expect(markdown).toContain("source.updateView")
    }

    for (const markdown of [plugins.markdown.en, plugins.markdown.zh]) {
      expect(markdown).toContain("EidosFilePluginSlot")
      expect(markdown).toContain("createEidosFileCsvImportPlugin")
      expect(markdown).toMatch(/Eidos Space [Ee]xtensions?/)
    }
  })
})
