import { findDocumentRanges, findLiteralText } from "./document-find"

describe("document text matching", () => {
  it("matches literal Unicode and punctuation with original offsets", () => {
    expect(findLiteralText("中文 中文", "中文").matches).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ])
    expect(findLiteralText("[a]+ [A]+", "[a]+").matches).toHaveLength(2)
    expect(findLiteralText("İ x", "x").matches).toEqual([{ start: 2, end: 3 }])
    expect(findLiteralText("test", "").matches).toEqual([])
    expect(findLiteralText("a a a", "a", 2)).toEqual({
      matches: [
        { start: 0, end: 1 },
        { start: 2, end: 3 },
      ],
      limited: true,
    })
  })

  it("finds across inline formatting but not across separate paragraphs", () => {
    const root = document.createElement("div")
    root.innerHTML =
      '<p>中<strong>文</strong> search</p><p>中文</p><p><span hidden>中文</span><button>中文</button><span aria-hidden="true">中文</span></p>'
    document.body.append(root)
    try {
      const before = root.innerHTML
      expect(
        findDocumentRanges(root, "中文").ranges.map((range) => range.toString())
      ).toEqual(["中文", "中文"])
      expect(findDocumentRanges(root, "search中文").ranges).toEqual([])
      expect(root.innerHTML).toBe(before)
    } finally {
      root.remove()
    }
  })
})
