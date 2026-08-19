import { describe, expect, it } from "vitest"

import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"
import { eidosFileKeyboardShortcuts } from "./eidos-file-keyboard-shortcuts"

describe("Eidos File editor keyboard shortcuts", () => {
  it("adapts defaults to platform-native UI bindings", () => {
    expect(
      eidosFileKeyboardShortcuts(DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS, true)
    ).toEqual({
      newRecord: ["Meta+Enter"],
      previousView: ["Control+PageUp", "Meta+Alt+ArrowLeft"],
      nextView: ["Control+PageDown", "Meta+Alt+ArrowRight"],
      previousTable: ["Control+Shift+PageUp"],
      nextTable: ["Control+Shift+PageDown"],
      openCellActions: ["Shift+F10"],
    })
  })

  it("honors customized and cleared editor bindings", () => {
    const shortcuts = {
      ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
      "next-view": "Alt+ArrowRight",
      "previous-table": null,
    }

    const bindings = eidosFileKeyboardShortcuts(shortcuts, true)
    expect(bindings.nextView).toEqual(["Alt+ArrowRight"])
    expect(bindings.previousTable).toEqual([])
  })
})
