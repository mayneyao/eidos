import { describe, expect, it } from "vitest"

import {
  EIDOS_FILE_DOCUMENTS,
  eidosFileDocumentBySlug,
} from "./eidos-file-documents"
import { renderEidosFileMarkdown } from "./markdown"
import {
  eidosFileDocsPath,
  eidosFileDocsRouteFromPathname,
  legacyEidosFileDocsSlugFromHash,
} from "./routes"

describe("Eidos File documentation Markdown", () => {
  it("builds stable heading anchors and rewrites bundled documentation links", () => {
    const rendered = renderEidosFileMarkdown(`
## File format
### SQLite schema
## File format

[Build](build.en.md)
`)

    expect(rendered.headings).toEqual([
      { id: "file-format", level: 2, text: "File format" },
      { id: "sqlite-schema", level: 3, text: "SQLite schema" },
      { id: "file-format-2", level: 2, text: "File format" },
    ])
    expect(rendered.html).toContain('href="/docs/build/"')
  })

  it("keeps localized documentation on indexable clean URLs", () => {
    const rendered = renderEidosFileMarkdown("[构建](build.zh.md)", "zh")

    expect(rendered.html).toContain('href="/zh/docs/build/"')
    expect(eidosFileDocsPath("overview", "en")).toBe("/docs/")
    expect(eidosFileDocsPath("format", "zh")).toBe("/zh/docs/format/")
    expect(eidosFileDocsRouteFromPathname("/zh/docs/build/")).toEqual({
      locale: "zh",
      slug: "build",
    })
    expect(legacyEidosFileDocsSlugFromHash("#/docs/format")).toBe("format")
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

  it("publishes one focused external editor and custom-view path", () => {
    const build = EIDOS_FILE_DOCUMENTS.find(
      (document) => document.slug === "build"
    )!

    expect(EIDOS_FILE_DOCUMENTS.map((document) => document.slug)).toEqual([
      "overview",
      "format",
      "build",
    ])

    for (const markdown of [
      ...EIDOS_FILE_DOCUMENTS.map((document) => document.markdown.en),
      ...EIDOS_FILE_DOCUMENTS.map((document) => document.markdown.zh),
    ]) {
      expect(markdown).not.toMatch(
        /Implementation Status|验收矩阵|docs\/rfcs|Living RFC/i
      )
    }

    for (const markdown of [build.markdown.en, build.markdown.zh]) {
      expect(markdown).toContain("@eidos.space/eidos-file")
      expect(markdown).toContain("@eidos.space/eidos-file-ui")
      expect(markdown).toContain("EidosFileSession")
      expect(markdown).toContain("EidosFileProvider")
      expect(markdown).toContain("EidosFileViewHost")
      expect(markdown).toContain("EidosFileViewRenderer")
      expect(markdown).toContain("defineEidosFileView")
      expect(markdown).toContain("com.example.timeline")
      expect(markdown).toMatch(/source\s*\.getPage/)
      expect(markdown).toContain("session.save()")
      expect(markdown).toMatch(/Eidos Space [Ee]xtensions?/)
    }
  })

  it("keeps legacy developer-document routes pointed at the focused build guide", () => {
    for (const slug of ["runtime", "plugins", "custom-views"]) {
      expect(eidosFileDocumentBySlug(slug).slug).toBe("build")
    }
  })
})
