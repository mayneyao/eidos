import {
  tokenizeCodeLightweight,
  type CodeHighlightKind,
  type CodeHighlightToken,
} from "./code-highlight-tokenizer"
import { tokenizeMarkdownLightweight } from "./markdown-highlight-tokenizer"

function kindAt(
  source: string,
  tokens: readonly CodeHighlightToken[],
  needle: string,
  offset = 0
): CodeHighlightKind | undefined {
  const start = source.indexOf(needle)
  if (start < 0) throw new Error(`Missing fixture text: ${needle}`)
  const point = start + offset
  return tokens.find((token) => point >= token.start && point < token.end)?.kind
}

function assertValidRanges(
  source: string,
  tokens: readonly CodeHighlightToken[]
): void {
  let end = 0
  for (const token of tokens) {
    expect(token.start).toBeGreaterThanOrEqual(end)
    expect(token.end).toBeGreaterThan(token.start)
    expect(token.end).toBeLessThanOrEqual(source.length)
    end = token.end
  }
}

describe("Markdown syntax tokenizer", () => {
  it("highlights CommonMark, GFM, frontmatter, and EFM constructs", () => {
    const source = `---
title: "A # title"
draft: false
count: 3
---
# Heading **strong** *em* ~~gone~~

> - [x] [Link](https://example.test "Title") and \`inline code\`

| Name | Value |
| :--- | ----: |
| one  | two   |

See[^note] and ==marked== with $x^2$.

[^note]: Footnote

<!-- hidden -->
<em data-kind="demo">HTML</em>

~~~ts metadata
const value = 42
~~~
`
    const tokens = tokenizeMarkdownLightweight(source)

    assertValidRanges(source, tokens)
    expect(kindAt(source, tokens, "---")).toBe("property")
    expect(kindAt(source, tokens, "title:")).toBe("property")
    expect(kindAt(source, tokens, '"A # title"')).toBe("string")
    expect(kindAt(source, tokens, "false")).toBe("keyword")
    expect(kindAt(source, tokens, "count: 3", 7)).toBe("number")
    expect(kindAt(source, tokens, "# Heading")).toBe("keyword")
    expect(kindAt(source, tokens, "Heading", 1)).toBe("keyword")
    expect(kindAt(source, tokens, "strong", 1)).toBe("type")
    expect(kindAt(source, tokens, "*em*", 1)).toBe("variable")
    expect(kindAt(source, tokens, "gone", 1)).toBe("deleted")
    expect(kindAt(source, tokens, "> - [x]")).toBe("comment")
    expect(kindAt(source, tokens, "- [x]", 0)).toBe("keyword")
    expect(kindAt(source, tokens, "[x]", 1)).toBe("keyword")
    expect(kindAt(source, tokens, "Link", 1)).toBe("function")
    expect(kindAt(source, tokens, "https://example.test", 2)).toBe("string")
    expect(kindAt(source, tokens, "inline code", 2)).toBe("string")
    expect(kindAt(source, tokens, "| Name")).toBe("operator")
    expect(kindAt(source, tokens, ":---", 2)).toBe("operator")
    expect(kindAt(source, tokens, "See[^note]", 5)).toBe("function")
    expect(kindAt(source, tokens, "[^note]:", 2)).toBe("property")
    expect(kindAt(source, tokens, "==marked==", 3)).toBe("inserted")
    expect(kindAt(source, tokens, "$x^2$", 2)).toBe("type")
    expect(kindAt(source, tokens, "<!-- hidden -->", 3)).toBe("comment")
    expect(kindAt(source, tokens, '<em data-kind="demo">', 2)).toBe("tag")
    expect(kindAt(source, tokens, "~~~ts")).toBe("operator")
    expect(kindAt(source, tokens, "ts metadata", 0)).toBe("property")
    expect(kindAt(source, tokens, "const value = 42", 3)).toBe("string")
  })

  it("keeps nested inline precedence and protects literal code", () => {
    const source =
      "# [**Bold** and *soft*](https://example.test) `==not mark== $not$` ==$x$=="
    const tokens = tokenizeMarkdownLightweight(source)

    assertValidRanges(source, tokens)
    expect(kindAt(source, tokens, "Bold", 1)).toBe("type")
    expect(kindAt(source, tokens, "soft", 1)).toBe("variable")
    expect(kindAt(source, tokens, "https://example.test", 4)).toBe("string")
    expect(kindAt(source, tokens, "==not mark==", 3)).toBe("string")
    expect(kindAt(source, tokens, "$not$", 2)).toBe("string")
    expect(kindAt(source, tokens, "==$x$==", 3)).toBe("type")
  })

  it("uses exact CRLF offsets and highlights incomplete editable blocks", () => {
    const source = "# Head\r\n\r\n$$\r\nx + y\r\n"
    const tokens = tokenizeMarkdownLightweight(source)

    assertValidRanges(source, tokens)
    expect(kindAt(source, tokens, "Head", 1)).toBe("keyword")
    expect(kindAt(source, tokens, "$$")).toBe("type")
    expect(kindAt(source, tokens, "x + y", 2)).toBe("type")
  })

  it("routes markdown aliases away from programming-language heuristics", async () => {
    const ordinary = "Version 2 uses TypeName in prose."

    expect(
      await Promise.resolve(tokenizeCodeLightweight(ordinary, "md"))
    ).toEqual([])
    expect(
      await Promise.resolve(tokenizeCodeLightweight("# Heading", "markdown"))
    ).toEqual(tokenizeMarkdownLightweight("# Heading"))
  })
})
