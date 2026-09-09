import { describe, expect, it } from "vitest"
import { resizeImageSource } from "./resize-image-source"

describe("resizeImageSource", () => {
  it.each([
    ["  ![caption](a.png)", "  ![caption|320](a.png)"],
    [
      '![caption](<folder/a b.png> "Title")',
      '![caption|320](<folder/a b.png> "Title")',
    ],
    ["![caption|640x480](a.png)", "![caption|320](a.png)"],
    ["![640](a.png)", "![|320](a.png)"],
    ["![photo2026](a.png)", "![photo2026|320](a.png)"],
    ["![a [nested] caption](a.png)", "![a [nested] caption|320](a.png)"],
    ["![a\\]b](a.png)", "![a\\]b|320](a.png)"],
  ])("preserves source except image dimensions: %s", (source, expected) => {
    expect(resizeImageSource(source, 320)).toBe(expected)
  })
  it("leaves malformed sources and invalid widths alone", () => {
    expect(resizeImageSource("![unterminated", 320)).toBe("![unterminated")
    expect(resizeImageSource("![a](a.png)", NaN)).toBe("![a](a.png)")
  })
})
