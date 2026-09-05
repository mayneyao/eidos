import {
  scanDisplayMath,
  scanInlineMath,
  inlineMathSourceFromValue,
} from "./syntax"

describe("equation syntax scanning", () => {
  it("preserves the inline equation delimiter on edit", () => {
    expect(inlineMathSourceFromValue("$x$", "y")).toBe("$y$")
    expect(inlineMathSourceFromValue("\\(x\\)", "y")).toBe("\\(y\\)")
  })
  it("finds block equations without treating protected code as equations", () => {
    const source = "$$\ncode\n$$\n\n$$\nx^2\n$$"
    expect(scanDisplayMath(source, [{ start: 0, end: 10 }])).toEqual({
      ranges: [{ start: 12, end: source.length }],
      unterminated: [],
    })
  })
  it("reports the opening line and retains the whole unterminated span", () => {
    const source = "Before\n$$\nx^2"
    expect(scanDisplayMath(source, [])).toEqual({
      ranges: [{ start: 7, end: source.length }],
      unterminated: [{ start: 7, end: 9 }],
    })
  })
  it("supports an empty block placeholder", () => {
    expect(scanDisplayMath("$$\n\n$$", []).ranges).toEqual([
      { start: 0, end: 6 },
    ])
  })
  it.each(["\\$x$", "$ x$", "$x $", "$$x$$", "$x$2", "$x\ny$"])(
    "does not treat %s as inline math",
    (source) => {
      expect(
        scanInlineMath(source, { start: 0, end: source.length }, [])
      ).toEqual([])
    }
  )
  it("respects protected spans and scans more than one inline equation", () => {
    const source = "$code$ $x$ $y$"
    expect(
      scanInlineMath(source, { start: 0, end: source.length }, [
        { start: 0, end: 6 },
      ])
    ).toEqual([
      { start: 7, end: 10 },
      { start: 11, end: 14 },
    ])
  })
})
