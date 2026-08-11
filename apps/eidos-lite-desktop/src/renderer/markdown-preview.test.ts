import { renderSafeMarkdown } from "./markdown-preview"

describe("safe Markdown preview", () => {
  it("renders GFM without allowing raw HTML or executable URLs", () => {
    const document = renderSafeMarkdown(
      [
        "# Release notes",
        "",
        "| Product | Downloads |",
        "| --- | ---: |",
        "| Lite | 42 |",
        "",
        "- [x] Preview Markdown",
        "",
        "[Safe](https://eidos.space) [Unsafe](javascript:alert(1))",
        "",
        "<script>window.compromised = true</script>",
      ].join("\n")
    )

    expect(document).toContain('<h1 id="release-notes">Release notes</h1>')
    expect(document).toContain("<table>")
    expect(document).toContain('type="checkbox"')
    expect(document).toContain('data-markdown-external="true"')
    expect(document).not.toContain("javascript:")
    expect(document).toContain("&lt;script&gt;")
    expect(document).not.toContain("<script>window.compromised")
  })

  it("only emits image sources that the renderer policy can load", () => {
    const document = renderSafeMarkdown(
      [
        "![Remote](https://eidos.space/image.png)",
        "![Insecure](http://example.com/image.png)",
        "![Local](./private.png)",
      ].join("\n")
    )

    expect(document).toContain('src="https://eidos.space/image.png"')
    expect(document).not.toContain('src="http:')
    expect(document).not.toContain('src="./private.png"')
  })
})
