import { describe, expect, it } from "vitest"

import {
  workspaceShortcutForKeyboardEvent,
  workspaceShortcutLabel,
} from "./workspace-shortcuts"

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
  it("maps the three workspace toggles on macOS and other platforms", () => {
    expect(
      workspaceShortcutForKeyboardEvent(
        shortcutEvent({ key: "b", metaKey: true })
      )
    ).toBe("toggle-sidebar")
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
  })

  it("renders platform-appropriate labels", () => {
    expect(workspaceShortcutLabel("toggle-sidebar", true)).toBe("⌘B")
    expect(workspaceShortcutLabel("toggle-version", true)).toBe("⌘⇧H")
    expect(workspaceShortcutLabel("toggle-sync", false)).toBe("Ctrl+Shift+S")
  })
})
