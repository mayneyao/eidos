import { describe, expect, it } from "vitest"
import { matchWikiQuery } from "./wiki-link-completion"

describe("wiki-link authoring trigger", () => {
  it("supports empty and Chinese queries after ordinary text", () => {
    expect(matchWikiQuery("hello [[笔记")).toEqual({
      leadOffset: 6,
      matchingString: "笔记",
      replaceableString: "[[笔记",
    })
    expect(matchWikiQuery("[[")?.matchingString).toBe("")
  })
  it("does not trigger for unsupported wiki embeds", () => {
    expect(matchWikiQuery("text ![[Note")).toBeNull()
    expect(matchWikiQuery("![[")).toBeNull()
  })
  it("accepts heading and block queries", () => {
    expect(matchWikiQuery("[[note#heading")?.matchingString).toBe(
      "note#heading"
    )
    expect(matchWikiQuery("[[note#^block")?.matchingString).toBe("note#^block")
  })
  it("does not consume closed links or aliases", () => {
    for (const text of [
      "[[done]]",
      "[[note|alias",
      "[[line\nbreak",
      "\\[[literal",
    ])
      expect(matchWikiQuery(text)).toBeNull()
  })
  it("handles multiple links and escaped backslashes", () => {
    expect(matchWikiQuery("[[old]] [[new")?.matchingString).toBe("new")
    expect(matchWikiQuery("\\\\[[new")?.matchingString).toBe("new")
  })
})
