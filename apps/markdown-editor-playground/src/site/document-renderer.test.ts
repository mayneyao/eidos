import { renderDocument } from "./document-renderer"

it("renders tables and gives repeated headings distinct anchors", () => {
  const result = renderDocument(
    "# API\n\n## Options\n\n## Options\n\n| Key | Value |\n| --- | --- |\n| a | b |"
  )
  expect(result.headings.map((heading) => heading.id)).toEqual([
    "api",
    "options",
    "options-1",
  ])
  expect(result.html).toContain("<table>")
})

it("does not grant raw HTML or unsafe links execution authority", () => {
  const result = renderDocument(
    "<script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)"
  )
  expect(result.html).not.toContain("<script>")
  expect(result.html).not.toContain('href="javascript:')
})

it("does not collide with headings whose text already contains a suffix", () => {
  const result = renderDocument(
    "## Options\n\n## Options\n\n## Options-1\n\n## Options"
  )
  expect(result.headings.map((heading) => heading.id)).toEqual([
    "options",
    "options-1",
    "options-1-1",
    "options-2",
  ])
})
