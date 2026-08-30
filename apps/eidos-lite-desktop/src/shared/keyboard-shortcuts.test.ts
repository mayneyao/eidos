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
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({ key: "1", metaKey: true }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBe("focus-file-content")
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({ ctrlKey: true, key: "1" }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        false
      )
    ).toBe("focus-file-content")
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({ key: "Enter", metaKey: true }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBe("new-record")
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({ key: "`", ctrlKey: true }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBe("toggle-terminal")
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({
          code: "Backquote",
          key: "Dead",
          ctrlKey: true,
          shiftKey: true,
        }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBe("toggle-terminal-position")
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({ ctrlKey: true, key: "PageDown" }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBe("next-view")
    expect(
      eidosLiteShortcutCommandForKeyboardEvent(
        event({ key: "F10", shiftKey: true }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBe("open-cell-actions")
  })

  it("migrates the previous settings shape without losing custom bindings", () => {
    const normalized = normalizeEidosLiteKeyboardShortcuts({
      "new-file": "Mod+N",
      "quick-open": "Mod+P",
      "toggle-sidebar": "Mod+Shift+B",
      "toggle-theme": "Mod+Shift+L",
      "toggle-version": "Mod+Shift+H",
      "toggle-sync": "Mod+Shift+S",
    })

    expect(normalized["toggle-sidebar"]).toBe("Mod+Shift+B")
    expect(normalized["new-record"]).toBe("Mod+Enter")
    expect(normalized["previous-view"]).toBe("Ctrl+PageUp")
    expect(normalized["open-cell-actions"]).toBe("Shift+F10")
    expect(normalized["toggle-terminal"]).toBe("Ctrl+Backquote")
    expect(normalized["toggle-terminal-position"]).toBe("Ctrl+Shift+Backquote")
    expect(normalized["focus-file-content"]).toBe("Mod+1")
  })

  it("does not let the new file-content focus default steal an existing custom binding", () => {
    const { "focus-file-content": _focusFileContent, ...previousShortcuts } =
      DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS
    const normalized = normalizeEidosLiteKeyboardShortcuts({
      ...previousShortcuts,
      "toggle-sidebar": "Mod+1",
    })

    expect(normalized["toggle-sidebar"]).toBe("Mod+1")
    expect(normalized["focus-file-content"]).toBeNull()
  })

  it("does not let a new default steal an existing custom binding", () => {
    const { "new-record": _newRecord, ...previousShortcuts } =
      DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS
    const normalized = normalizeEidosLiteKeyboardShortcuts({
      ...previousShortcuts,
      "previous-view": "Mod+Enter",
    })

    expect(normalized["previous-view"]).toBe("Mod+Enter")
    expect(normalized["new-record"]).toBeNull()
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
    expect(eidosLiteShortcutLabel("Ctrl+Backquote", false)).toBe("Ctrl+`")
    expect(eidosLiteShortcutLabel("Ctrl+Shift+Backquote", true)).toBe("⌃⇧`")
  })
})
