import {
  markdownShortcutAriaKeys,
  markdownShortcutConflicts,
  markdownShortcutLabel,
  markdownShortcutLabels,
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
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ key: "Enter", metaKey: true }),
        "list-item.toggle-checked"
      )
    ).toBe(true)
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
    expect(markdownShortcutLabels("history.redo", "mac", shortcuts)).toEqual([
      "⌘⇧Z",
      "⌘Y",
    ])
    expect(markdownShortcutLabel("format.bold", "mac", shortcuts)).toBe(
      undefined
    )
    expect(markdownShortcutAriaKeys("list-item.move-down")).toBe(
      "Alt+ArrowDown"
    )
    expect(markdownShortcutAriaKeys("list-item.toggle-checked")).toBe(
      "Meta+Enter Control+Enter"
    )
  })

  it("merges namespaced plugin shortcuts before host overrides", () => {
    const shortcuts = resolveMarkdownShortcuts(
      { "acme.callout.toggle": [{ alt: true, key: "c" }] },
      {
        "acme.callout.toggle": {
          bindings: [{ primary: true, key: "c" }],
          description: "Toggle a callout",
          scope: "selection",
        },
      }
    )

    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, key: "c" }),
        "acme.callout.toggle",
        shortcuts
      )
    ).toBe(true)
    expect(markdownShortcutLabel("acme.callout.toggle", "mac", shortcuts)).toBe(
      "⌥C"
    )
  })
})
