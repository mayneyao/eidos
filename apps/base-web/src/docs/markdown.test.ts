import { describe, expect, it } from "vitest"

import { renderBaseMarkdown } from "./markdown"

describe("Base documentation Markdown", () => {
  it("builds stable heading anchors and rewrites bundled RFC links", () => {
    const rendered = renderBaseMarkdown(`
## File format
### SQLite schema
## File format

[Storage](eidos-space-base-storage.md)
`)

    expect(rendered.headings).toEqual([
      { id: "file-format", level: 2, text: "File format" },
      { id: "sqlite-schema", level: 3, text: "SQLite schema" },
      { id: "file-format-2", level: 2, text: "File format" },
    ])
    expect(rendered.html).toContain('href="#/docs/storage-model"')
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
})
