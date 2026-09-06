import {
  literalTextMatches,
  resolveTextSearchTarget,
  textOffsetPosition,
} from "./text-search"

it("revalidates source locations against current content without modifying it", () => {
  const target = { requestId: "1", query: "中文", start: 4, end: 6 }
  expect(resolveTextSearchTarget("prefix 中文", target)).toMatchObject({
    start: 7,
    end: 9,
  })
  expect(resolveTextSearchTarget("gone", target)).toBeNull()
  expect(textOffsetPosition("😀\r\n中文", 4)).toEqual({
    lineNumber: 2,
    character: 0,
  })
  expect(literalTextMatches("İ [a]+ [A]+", "[a]+")).toEqual([
    { start: 2, end: 6 },
    { start: 7, end: 11 },
  ])
})
