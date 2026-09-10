import { describe, expect, it } from "vitest"

import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"
import {
  markdownKeyboardShortcuts,
  parseMarkdownBinding,
} from "./markdown-keyboard-shortcuts"

describe("markdownKeyboardShortcuts", () => {
  it("parses single key with modifiers correctly", () => {
    expect(parseMarkdownBinding("Mod+Alt+BracketLeft")).toEqual({
      key: "[",
      primary: true,
      alt: true,
    })
    expect(parseMarkdownBinding("Alt+ArrowUp")).toEqual({
      key: "ArrowUp",
      alt: true,
    })
    expect(parseMarkdownBinding("Mod+Shift+0")).toEqual({
      key: "0",
      primary: true,
      shift: true,
    })
    expect(parseMarkdownBinding("Mod+B")).toEqual({
      key: "b",
      primary: true,
    })
  })

  it("converts default Eidos Lite shortcuts to Markdown overrides preserving aliases", () => {
    const overrides = markdownKeyboardShortcuts(
      DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS
    )

    // Heading fold default includes both [ and t aliases
    expect(overrides["heading.toggle-fold"]).toEqual([
      { alt: true, key: "[", primary: true },
      { alt: true, key: "t", primary: true },
    ])
    expect(overrides["heading.fold-all"]).toEqual([
      { alt: true, key: "0", primary: true },
    ])
    expect(overrides["heading.unfold-all"]).toEqual([
      { alt: true, key: "0", primary: true, shift: true },
    ])
    expect(overrides["list-item.move-up"]).toEqual([
      { alt: true, key: "ArrowUp" },
    ])
    expect(overrides["list-item.move-down"]).toEqual([
      { alt: true, key: "ArrowDown" },
    ])
    expect(overrides["block.move-up"]).toEqual([{ alt: true, key: "ArrowUp" }])
    expect(overrides["block.move-down"]).toEqual([
      { alt: true, key: "ArrowDown" },
    ])
    expect(overrides["format.bold"]).toEqual([{ primary: true, key: "b" }])
    expect(overrides["format.italic"]).toEqual([{ primary: true, key: "i" }])
  })

  it("honors custom keybindings and cleared shortcuts", () => {
    const customized = {
      ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
      "toggle-heading-fold": "Mod+Alt+H",
      "fold-all-headings": null,
      "move-list-item-up": "Alt+PageUp",
      "format-bold": null,
    }

    const overrides = markdownKeyboardShortcuts(customized)

    expect(overrides["heading.toggle-fold"]).toEqual([
      { alt: true, key: "h", primary: true },
    ])
    expect(overrides["heading.fold-all"]).toBe(false)
    expect(overrides["list-item.move-up"]).toEqual([
      { alt: true, key: "PageUp" },
    ])
    expect(overrides["block.move-up"]).toEqual([{ alt: true, key: "PageUp" }])
    expect(overrides["format.bold"]).toBe(false)
    // Non-modified shortcuts stay standard
    expect(overrides["format.italic"]).toEqual([{ primary: true, key: "i" }])
  })
})
