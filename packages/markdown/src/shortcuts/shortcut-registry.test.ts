import {
  markdownShortcutAriaKeys,
  markdownShortcutConflicts,
  markdownShortcutLabel,
  markdownShortcutLabels,
  matchesMarkdownShortcut,
  resolveMarkdownShortcuts,
  type KeyboardShortcutEvent,
} from "./shortcut-registry"

function keyboardEvent(overrides: Partial<KeyboardShortcutEvent> = {}) {
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
        keyboardEvent({ key: "E" }),
        "selection.edit-source"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ key: "e", metaKey: true }),
        "selection.edit-source"
      )
    ).toBe(false)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ isComposing: true, key: "e" }),
        "selection.edit-source"
      )
    ).toBe(false)
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
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ key: "Escape" }),
        "selection.enter-block"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ key: "ArrowUp", shiftKey: true }),
        "selection.extend-up"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ key: "ArrowUp" }),
        "selection.extend-up"
      )
    ).toBe(false)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ key: "a", metaKey: true }),
        "selection.select-all-blocks"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ key: "a", metaKey: true, shiftKey: true }),
        "selection.select-all-blocks"
      )
    ).toBe(false)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ key: "Tab" }),
        "source-editor.indent"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, key: "ArrowDown", shiftKey: true }),
        "source-editor.copy-line-down"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, key: "[", metaKey: true }),
        "heading.toggle-fold"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, key: "t", metaKey: true }),
        "heading.toggle-fold"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({ altKey: true, key: "0", metaKey: true }),
        "heading.fold-all"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({
          altKey: true,
          key: "0",
          metaKey: true,
          shiftKey: true,
        }),
        "heading.unfold-all"
      )
    ).toBe(true)
    // macOS Option key character replacements and code match
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({
          altKey: true,
          code: "BracketLeft",
          key: "“",
          metaKey: true,
        }),
        "heading.toggle-fold"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({
          altKey: true,
          code: "KeyT",
          key: "†",
          metaKey: true,
        }),
        "heading.toggle-fold"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({
          altKey: true,
          code: "Digit0",
          key: "º",
          metaKey: true,
        }),
        "heading.fold-all"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({
          altKey: true,
          code: "Digit0",
          key: "‚",
          metaKey: true,
          shiftKey: true,
        }),
        "heading.unfold-all"
      )
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(
        keyboardEvent({
          altKey: true,
          isComposing: true,
          key: "ArrowDown",
          shiftKey: true,
        }),
        "source-editor.copy-line-down"
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
    expect(markdownShortcutAriaKeys("selection.select-all-blocks")).toBe(
      "Meta+a Control+a"
    )
    expect(markdownShortcutLabel("selection.extend-up", "mac")).toBe("⇧↑")
    expect(markdownShortcutLabel("selection.select-all-blocks", "mac")).toBe(
      "⌘A"
    )
    expect(markdownShortcutLabels("source-editor.indent", "mac")).toEqual([
      "Tab",
      "⌘]",
    ])
    expect(markdownShortcutLabels("heading.toggle-fold", "mac")).toEqual([
      "⌘⌥[",
      "⌘⌥T",
    ])
    expect(markdownShortcutLabels("heading.fold-all", "mac")).toEqual(["⌘⌥0"])
    expect(markdownShortcutLabels("heading.unfold-all", "mac")).toEqual([
      "⌘⌥⇧0",
    ])
    expect(markdownShortcutAriaKeys("heading.toggle-fold")).toBe(
      "Meta+Alt+[ Control+Alt+[ Meta+Alt+t Control+Alt+t"
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

  it("distinguishes Option + [ and Option + ] accurately on macOS", () => {
    const shortcuts = resolveMarkdownShortcuts({
      "list-item.move-up": [{ alt: true, key: "[" }],
      "list-item.move-down": [{ alt: true, key: "]" }],
    })

    // User presses Option + [ (generates “ on Mac)
    const optOpen = keyboardEvent({
      altKey: true,
      code: "BracketLeft",
      key: "“",
    })
    expect(
      matchesMarkdownShortcut(optOpen, "list-item.move-up", shortcuts)
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(optOpen, "list-item.move-down", shortcuts)
    ).toBe(false)

    // User presses Option + ] (generates ‘ on Mac)
    const optClose = keyboardEvent({
      altKey: true,
      code: "BracketRight",
      key: "‘",
    })
    expect(
      matchesMarkdownShortcut(optClose, "list-item.move-up", shortcuts)
    ).toBe(false)
    expect(
      matchesMarkdownShortcut(optClose, "list-item.move-down", shortcuts)
    ).toBe(true)

    // Fallback without event.code (e.g. synthetic event with only Mac key characters)
    const noCodeOpen = keyboardEvent({ altKey: true, key: "“" })
    const noCodeClose = keyboardEvent({ altKey: true, key: "‘" })
    expect(
      matchesMarkdownShortcut(noCodeOpen, "list-item.move-up", shortcuts)
    ).toBe(true)
    expect(
      matchesMarkdownShortcut(noCodeOpen, "list-item.move-down", shortcuts)
    ).toBe(false)
    expect(
      matchesMarkdownShortcut(noCodeClose, "list-item.move-up", shortcuts)
    ).toBe(false)
    expect(
      matchesMarkdownShortcut(noCodeClose, "list-item.move-down", shortcuts)
    ).toBe(true)
  })
})
