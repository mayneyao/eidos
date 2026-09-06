import { markdownFileLinkRanges } from "./document-link-ranges"

it("preserves encoded anchor spelling and distinguishes encoded filename hashes", () => {
  const source =
    "[x](Note.md&#35;Heading) [y](Note.md\\#Heading) [z](a%23b.md#Heading)"
  expect(
    markdownFileLinkRanges(source).map((range) =>
      source.slice(range.start, range.end)
    )
  ).toEqual(["Note.md", "Note.md", "a%23b.md"])
})

it("locates only path bytes, retaining aliases, anchors, labels, titles and CRLF", () => {
  const source =
    '[[ Note#Head|Alias ]]\r\n![[image.png|200]]\r\n[Label](../Note.md#^id "Title")\r\n![Alt](<images/a b.png>)\r\n\r\n[ref]: /Note.md "Title"'
  const ranges = markdownFileLinkRanges(source)
  expect(ranges.map((range) => source.slice(range.start, range.end))).toEqual([
    "Note",
    "../Note.md",
    "images/a b.png",
    "/Note.md",
  ])
})

it("ignores code, HTML, comments, math, escapes and external destinations", () => {
  const source =
    "`[[inline]]`\n\n```md\n[[fenced]]\n[x](note.md)\n```\n\n<!-- [[html]] -->\n\n%% [[comment]] %%\n\n$[[math]]$\n\n\\[[escaped]]\n\n[x](https://host/file.md)\n\n[[real]]"
  expect(markdownFileLinkRanges(source).map((range) => range.path)).toEqual([
    "real",
  ])
})

it("handles nested labels, escaped and percent-encoded destinations", () => {
  const source =
    "[**Label** `](decoy.md)`](actual%20file.md)\n\n[x](a(b).md)\n\n[x](a\\(b\\).md)"
  expect(
    markdownFileLinkRanges(source).map((range) => [
      range.path,
      source.slice(range.start, range.end),
    ])
  ).toEqual([
    ["actual file.md", "actual%20file.md"],
    ["a(b).md", "a(b).md"],
    ["a(b).md", "a\\(b\\).md"],
  ])
})

it("keeps wiki references in YAML properties without treating other properties as Markdown links", () => {
  const source =
    '---\nauthor: "[[Author]]"\ntext: "[label](not-a-link.md)"\n---\n\n[[Other]]'
  expect(markdownFileLinkRanges(source).map((range) => range.path)).toEqual([
    "Author",
    "Other",
  ])
})
