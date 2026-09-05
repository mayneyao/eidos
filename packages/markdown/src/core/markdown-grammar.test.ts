import { fromMarkdown } from "mdast-util-from-markdown"
import { micromark } from "micromark"
import { composeMarkdownGrammar } from "./markdown-grammar"

describe("explicit CommonMark constructs", () => {
  const source = "# Title\n\n- item\n\n**strong** and `code`\n\n> quote\n\n---"
  it("keeps unspecified legacy grammar compatible", () => {
    expect(micromark(source, composeMarkdownGrammar([]))).toContain("<h1>")
  })
  it("disables unselected parser and HTML constructs together", () => {
    const grammar = composeMarkdownGrammar([{ commonmark: [] }])
    expect(
      fromMarkdown(source, grammar).children.every(
        (node) => node.type === "paragraph"
      )
    ).toBe(true)
    const html = micromark(source, grammar)
    for (const tag of ["h1", "ul", "strong", "code", "blockquote", "hr"])
      expect(html).not.toContain(`<${tag}`)
    expect(html).toContain("**strong** and `code`")
  })
  it("unions independently owned constructs and respects them in nested previews", () => {
    const grammar = composeMarkdownGrammar([
      { commonmark: ["blockQuote"] },
      { commonmark: ["headingAtx"] },
    ])
    expect(micromark("> # Title\n>\n> **plain**", grammar)).toBe(
      "<blockquote>\n<h1>Title</h1>\n<p>**plain**</p>\n</blockquote>"
    )
  })
})
