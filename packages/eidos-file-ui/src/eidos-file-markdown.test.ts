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
})
