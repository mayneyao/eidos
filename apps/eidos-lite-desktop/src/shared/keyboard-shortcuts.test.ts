import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  eidosLiteShortcutCommandForKeyboardEvent,
  eidosLiteShortcutLabel,
  isEidosLiteKeyboardShortcuts,
  normalizeEidosLiteKeyboardShortcuts,
  shortcutBindingForKeyboardEvent,
} from "./keyboard-shortcuts"

function event(overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    key: "",
    metaKey: false,
    repeat: false,
    shiftKey: false,
    ...overrides,
  }
}

describe("Eidos Lite keyboard shortcuts", () => {
  it("captures and matches primary-modifier shortcuts per platform", () => {
    expect(
      shortcutBindingForKeyboardEvent(event({ key: "\\", metaKey: true }), true)
    ).toBe("Mod+Backslash")
    expect(
      shortcutBindingForKeyboardEvent(
        event({ ctrlKey: true, key: "H", shiftKey: true }),
        false
      )
    ).toBe("Mod+Shift+H")
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({ key: "L", metaKey: true, shiftKey: true }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBe("toggle-theme")
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({ key: "n", metaKey: true }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBe("new-file")
  })

  it("resets obsolete shortcut shapes without retaining removed commands", () => {
    expect(
      normalizeEidosLiteKeyboardShortcuts({
        "toggle-sidebar": "Mod+B",
        "toggle-version": "Mod+Shift+H",
        "toggle-sync": "Mod+Shift+S",
        "navigate-back": "Alt+ArrowLeft",
        "navigate-forward": "Alt+ArrowRight",
      })
    ).toEqual(DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS)
  })

  it("normalizes current bindings and rejects conflicts or reserved keys", () => {
    expect(
      normalizeEidosLiteKeyboardShortcuts({
        ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        "toggle-sidebar": "Mod+W",
      })["toggle-sidebar"]
    ).toBe("Mod+Backslash")
    expect(
      isEidosLiteKeyboardShortcuts({
        ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        "toggle-sync": "Mod+Shift+H",
      })
    ).toBe(false)
  })

  it("supports clearing commands and renders platform-native labels", () => {
    expect(
      isEidosLiteKeyboardShortcuts({
        ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        "toggle-sync": null,
      })
    ).toBe(true)
    expect(eidosLiteShortcutLabel("Mod+Shift+H", true)).toBe("⌘⇧H")
    expect(eidosLiteShortcutLabel("Mod+Shift+H", false)).toBe("Ctrl+Shift+H")
    expect(eidosLiteShortcutLabel("Mod+Backslash", true)).toBe("⌘\\")
    expect(eidosLiteShortcutLabel("Mod+N", true)).toBe("⌘N")
  })
})
