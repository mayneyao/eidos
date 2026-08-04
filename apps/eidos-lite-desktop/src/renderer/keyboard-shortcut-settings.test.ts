import { describe, expect, it } from "vitest"

import { keyboardShortcutRowMode } from "./keyboard-shortcut-settings"

describe("Keyboard shortcut row actions", () => {
  it("offers removal only while the shortcut matches its default", () => {
    expect(keyboardShortcutRowMode("Mod+Backslash", "Mod+Backslash")).toBe(
      "remove"
    )
  })

  it("offers reset only after the shortcut is modified or cleared", () => {
    expect(keyboardShortcutRowMode("Mod+Shift+B", "Mod+Backslash")).toBe(
      "reset"
    )
    expect(keyboardShortcutRowMode(null, "Mod+Backslash")).toBe("reset")
  })
})
