import { describe, expect, it } from "vitest"

import {
  workspaceShortcutForKeyboardEvent,
  workspaceShortcutLabel,
} from "./workspace-shortcuts"
import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"

function shortcutEvent(
  overrides: Partial<Parameters<typeof workspaceShortcutForKeyboardEvent>[0]>
) {
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

describe("Eidos Lite workspace shortcuts", () => {
  it("maps file creation and workspace toggles on macOS and other platforms", () => {
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ key: "n", metaKey: true })
      )
    ).toBe("new-file")
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ key: "\\", metaKey: true })
      )
    ).toBe("toggle-sidebar")
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ key: "L", metaKey: true, shiftKey: true })
      )
    ).toBe("toggle-theme")
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ ctrlKey: true, key: "H", shiftKey: true })
      )
    ).toBe("toggle-version")
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ ctrlKey: true, key: "S", shiftKey: true })
      )
    ).toBe("toggle-sync")
  })

  it("does not toggle on repeats, Alt combinations, or incomplete chords", () => {
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ key: "b", metaKey: true, repeat: true })
      )
    ).toBeNull()
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ altKey: true, key: "b", metaKey: true })
      )
    ).toBeNull()
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ key: "h", metaKey: true })
      )
    ).toBeNull()
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ ctrlKey: true, key: "PageDown" }),
        DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
        true
      )
    ).toBeNull()
  })

  it("renders platform-appropriate labels", () => {
    expect(workspaceShortcutLabel("new-file", true)).toBe("⌘N")
    expect(workspaceShortcutLabel("toggle-sidebar", true)).toBe("⌘\\")
    expect(workspaceShortcutLabel("toggle-theme", true)).toBe("⌘⇧L")
    expect(workspaceShortcutLabel("toggle-version", true)).toBe("⌘⇧H")
    expect(workspaceShortcutLabel("toggle-sync", false)).toBe("Ctrl+Shift+S")
  })

  it("uses custom bindings immediately and allows commands to be cleared", () => {
    const shortcuts = {
      ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
      "toggle-sidebar": "Mod+Shift+E",
      "toggle-sync": null,
    }

    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ key: "E", metaKey: true, shiftKey: true }),
        shortcuts,
        true
      )
    ).toBe("toggle-sidebar")
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ key: "S", metaKey: true, shiftKey: true }),
        shortcuts,
        true
      )
    ).toBeNull()
  })
})
