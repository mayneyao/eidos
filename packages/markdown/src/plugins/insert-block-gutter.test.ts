import { describe, expect, it } from "vitest"
import { $getRoot, createEditor } from "lexical"
import { $createHeadingNode, HeadingNode } from "@lexical/rich-text"
import {
  BLOCK_GUTTER_HEIGHT,
  clampBlockGutterPosition,
  getBlockGutterVerticalOffset,
} from "./insert-block-plugin"

describe("clampBlockGutterPosition", () => {
  const bounds = { top: 40, bottom: 600, left: 100, right: 800 }
  const base = {
    contentLeft: 200,
    gutterWidth: 50,
    verticalOffset: 0,
    bounds,
  }

  it("clamps a block near the editor top to the editor inset, not the window", () => {
    const placement = clampBlockGutterPosition({
      ...base,
      blockTop: 30,
      blockBottom: 60,
    })
    expect(placement?.gutterTop).toBe(bounds.top + 8)
  })

  it("clamps a block near the editor bottom to the editor inset", () => {
    const placement = clampBlockGutterPosition({
      ...base,
      blockTop: 580,
      blockBottom: 620,
    })
    expect(placement?.gutterTop).toBe(bounds.bottom - BLOCK_GUTTER_HEIGHT - 8)
  })

  it("clamps a block outside the editor to the nearest editor edge", () => {
    expect(
      clampBlockGutterPosition({ ...base, blockTop: 640, blockBottom: 700 })
        .gutterTop
    ).toBe(bounds.bottom - BLOCK_GUTTER_HEIGHT - 8)
    expect(
      clampBlockGutterPosition({ ...base, blockTop: -40, blockBottom: 10 })
        .gutterTop
    ).toBe(bounds.top + 8)
  })

  it("keeps the gutter in the editor's left margin", () => {
    const placement = clampBlockGutterPosition({
      ...base,
      blockTop: 200,
      blockBottom: 240,
    })
    expect(placement).toEqual({
      gutterLeft: base.contentLeft - base.gutterWidth - 4,
      gutterTop: 200,
    })
  })

  it("reserves the wider fold gutter and vertical offset", () => {
    const placement = clampBlockGutterPosition({
      ...base,
      contentLeft: 180,
      gutterWidth: 76,
      verticalOffset: 5,
      blockTop: 200,
      blockBottom: 240,
    })
    expect(placement).toEqual({ gutterLeft: bounds.left + 8, gutterTop: 205 })
  })
})

describe("getBlockGutterVerticalOffset", () => {
  it("returns 0 for non-heading elements like paragraphs", () => {
    const p = document.createElement("p")
    p.className = "eme-paragraph"
    p.style.fontSize = "14px"
    p.style.lineHeight = "24px"

    const offset = getBlockGutterVerticalOffset(p)
    expect(offset).toBe(0)
  })

  it("returns 0 for code blocks, blockquotes, and lists", () => {
    const quote = document.createElement("blockquote")
    quote.className = "eme-quote"
    expect(getBlockGutterVerticalOffset(quote)).toBe(0)

    const code = document.createElement("div")
    code.className = "eme-code-block"
    expect(getBlockGutterVerticalOffset(code)).toBe(0)

    const ul = document.createElement("ul")
    ul.className = "eme-list"
    expect(getBlockGutterVerticalOffset(ul)).toBe(0)
  })

  it("calculates vertical offset for H1 to center 24px handle with line-height", () => {
    const h1 = document.createElement("h1")
    h1.className = "eme-heading eme-heading-h1"
    h1.style.fontSize = "28.8px"
    h1.style.lineHeight = "35.136px"

    // (35.136 - 24) / 2 = 5.568
    const offset = getBlockGutterVerticalOffset(h1)
    expect(offset).toBeCloseTo(5.568, 2)
  })

  it("calculates vertical offset for H2", () => {
    const h2 = document.createElement("h2")
    h2.className = "eme-heading eme-heading-h2"
    h2.style.fontSize = "22.08px"
    h2.style.lineHeight = "26.938px"

    // (26.938 - 24) / 2 = 1.469
    const offset = getBlockGutterVerticalOffset(h2)
    expect(offset).toBeCloseTo(1.469, 2)
  })

  it("returns 0 for H3 when line-height is smaller than gutter height (does not go negative)", () => {
    const h3 = document.createElement("h3")
    h3.className = "eme-heading eme-heading-h3"
    h3.style.fontSize = "17.28px"
    h3.style.lineHeight = "21.082px"

    const offset = getBlockGutterVerticalOffset(h3)
    expect(offset).toBe(0)
  })

  it("handles unitless line-height fallback (e.g. 1.22 multiplier)", () => {
    const h1 = document.createElement("h1")
    h1.className = "eme-heading eme-heading-h1"
    h1.style.fontSize = "28.8px"
    h1.style.lineHeight = "1.22"

    // 28.8 * 1.22 = 35.136, (35.136 - 24) / 2 = 5.568
    const offset = getBlockGutterVerticalOffset(h1)
    expect(offset).toBeCloseTo(5.568, 2)
  })

  it("incorporates paddingTop if present on heading", () => {
    const h1 = document.createElement("h1")
    h1.className = "eme-heading eme-heading-h1"
    h1.style.fontSize = "28.8px"
    h1.style.lineHeight = "35.136px"
    h1.style.paddingTop = "8px"

    // 8 + (35.136 - 24) / 2 = 13.568
    const offset = getBlockGutterVerticalOffset(h1)
    expect(offset).toBeCloseTo(13.568, 2)
  })

  it("detects heading via Lexical HeadingNode and editor key", () => {
    const editor = createEditor({ nodes: [HeadingNode] })
    let headingKey = ""
    editor.update(
      () => {
        const root = $getRoot()
        const heading = $createHeadingNode("h1")
        root.append(heading)
        headingKey = heading.getKey()
      },
      { discrete: true }
    )

    const customDiv = document.createElement("div")
    customDiv.style.fontSize = "28.8px"
    customDiv.style.lineHeight = "35.136px"

    const offset = getBlockGutterVerticalOffset(customDiv, editor, headingKey)
    expect(offset).toBeCloseTo(5.568, 2)
  })

  it("constant BLOCK_GUTTER_HEIGHT is 24px", () => {
    expect(BLOCK_GUTTER_HEIGHT).toBe(24)
  })
})
