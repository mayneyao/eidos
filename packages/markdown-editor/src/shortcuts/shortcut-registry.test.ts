import {
  markdownShortcutAriaKeys,
  markdownShortcutConflicts,
  markdownShortcutLabel,
  matchesMarkdownShortcut,
  resolveMarkdownShortcuts,
} from "./shortcut-registry"

function keyboardEvent(
  overrides: Partial<{
    altKey: boolean
    ctrlKey: boolean
    isComposing: boolean
    key: string
    metaKey: boolean
    shiftKey: boolean
  }> = {}
) {
  return {
    altKey: false,
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe("Markdown shortcut registry", () => {
  it("has no conflicts inside the same interaction scope", () => {
    expect(markdownShortcutConflicts()).toEqual([])
  })

  it("matches exact modifiers and ignores IME composition", () => {
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, key: "ArrowUp" }),
        "list-item.move-up"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, key: "ArrowUp", shiftKey: true }),
        "list-item.move-up"
      )
    ).toBe(false)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ ctrlKey: true, key: "z", metaKey: true }),
        "history.undo"
      )
    ).toBe(false)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, isComposing: true, key: "ArrowUp" }),
        "list-item.move-up"
      )
    ).toBe(false)
  })

  it("supports host overrides, disabling, labels, and aria keys", () => {
    const shortcuts = resolveMarkdownShortcuts({
      "document.save": [{ alt: true, key: "s" }],
      "format.bold": false,
    })
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, key: "s" }),
        "document.save",
        shortcuts
      )
    ).toBe(true)
    expect(markdownShortcutLabel("document.save", "mac", shortcuts)).toBe("⌥S")
    expect(markdownShortcutLabel("format.bold", "mac", shortcuts)).toBe(
      undefined
    )
    expect(markdownShortcutAriaKeys("list-item.move-down")).toBe(
      "Alt+ArrowDown"
    )
  })
})
