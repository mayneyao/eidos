import { describe, expect, it } from "vitest"

import { renderSafeEidosFileMarkdown } from "./eidos-file-markdown"

describe("renderSafeEidosFileMarkdown", () => {
  it("renders Markdown while escaping HTML and rejecting unsafe URLs", () => {
    const html = renderSafeEidosFileMarkdown(
      "## Notes\n\n<script>alert(1)</script>\n\n[Safe](https://example.com) [Unsafe](javascript:alert(1)) ![Remote](https://example.com/tracker.png)"
    )

    expect(html).toContain("<h2>Notes</h2>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).toContain('data-eidos-file-markdown-external="true"')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain("tracker.png")
  })

  it("resolves document-local images against the Host base URL", () => {
    const html = renderSafeEidosFileMarkdown("![Cover](assets/cover.png)", {
      imageBaseUrl: "/api/assets/file/",
    })

    expect(html).toContain('src="/api/assets/file/assets/cover.png"')
    expect(html).toContain('alt="Cover"')
  })

  it("escapes document-local references when no base URL is declared", () => {
    const html = renderSafeEidosFileMarkdown("![Cover](assets/cover.png)")

    expect(html).not.toContain("assets/cover.png")
    expect(html).toContain("Cover")
  })

  it("rejects escaping and scheme-relative image references", () => {
    const html = renderSafeEidosFileMarkdown(
      "![a](../secret.png) ![b](//evil.example/x.png) ![c](/absolute.png) ![d](assets/ok.png?q=1)",
      { imageBaseUrl: "/api/assets/file/" }
    )

    expect(html).not.toContain("secret.png")
    expect(html).not.toContain("evil.example")
    expect(html).not.toContain("/absolute.png")
    expect(html).not.toContain("assets/ok.png")
  })
})
