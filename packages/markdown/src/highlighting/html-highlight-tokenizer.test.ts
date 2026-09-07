import { sourceRangeLanguage, tokenizeHtml } from "./html-highlight-tokenizer"

it("selects HTML only for HTML source ranges", () => {
  expect(sourceRangeLanguage("<div>Text</div>")).toBe("html")
  expect(sourceRangeLanguage("Text <b>bold</b>")).toBe("markdown")
  expect(sourceRangeLanguage("```html\n<div />\n```")).toBe("markdown")
  expect(sourceRangeLanguage("<div>Text</div>\n\n# Title")).toBe("markdown")
})

it("separates tags, attributes, values and comments without coloring prose", () => {
  const source =
    '<div align="center" hidden>True Eidos 123 **text**<!-- note --></div>'
  expect(
    tokenizeHtml(source).map((t) => [source.slice(t.start, t.end), t.kind])
  ).toEqual([
    ["<div", "tag"],
    ["align", "property"],
    ["=", "operator"],
    ['"center"', "string"],
    ["hidden", "property"],
    [">", "operator"],
    ["<!-- note -->", "comment"],
    ["</div", "tag"],
    [">", "operator"],
  ])
})

it("retains offsets for multiline and unfinished attributes", () => {
  const source = '<img\r\n height=150 alt="中 > 文'
  expect(
    tokenizeHtml(source).map((t) => [source.slice(t.start, t.end), t.kind])
  ).toEqual([
    ["<img", "tag"],
    ["height", "property"],
    ["=", "operator"],
    ["150", "string"],
    ["alt", "property"],
    ["=", "operator"],
    ['"中 > 文', "string"],
  ])
})
