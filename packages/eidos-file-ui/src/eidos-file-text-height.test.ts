import { beforeAll, describe, expect, it, vi } from "vitest"

const pretextMocks = vi.hoisted(() => ({
  prepare: vi.fn((text: string) => ({ text })),
  layout: vi.fn(
    (prepared: { text: string }, _width: number, lineHeight: number) => {
      const lineCount = prepared.text.startsWith("Long") ? 8 : 1
      return { lineCount, height: lineCount * lineHeight }
    }
  ),
}))

vi.mock("@chenglou/pretext", () => pretextMocks)

import { measureEidosFileTextHeight } from "./eidos-file-text-height"

beforeAll(() => {
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    value: class OffscreenCanvas {},
  })
})

describe("measureEidosFileTextHeight", () => {
  it("keeps short content natural and caps long content", () => {
    const short = measureEidosFileTextHeight({
      text: "Short pretext fixture",
      maxWidth: 160,
      font: "500 14px Aptos",
      fontSize: 14,
      lineHeight: 20,
      maxLines: 3,
    })
    const long = measureEidosFileTextHeight({
      text: "Long pretext fixture",
      maxWidth: 160,
      font: "500 14px Aptos",
      fontSize: 14,
      lineHeight: 20,
      maxLines: 3,
    })

    expect(short).toEqual({ height: 20, lineCount: 1, overflowing: false })
    expect(long).toEqual({ height: 60, lineCount: 8, overflowing: true })
    expect(pretextMocks.prepare).toHaveBeenCalledWith(
      "Short pretext fixture",
      "500 14px Aptos",
      expect.objectContaining({ whiteSpace: "pre-wrap" })
    )
    expect(pretextMocks.layout).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Long pretext fixture" }),
      160,
      20
    )
  })
})
