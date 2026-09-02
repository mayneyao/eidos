export type MarkdownShortcutScope =
  | "block-handle"
  | "composer"
  | "document"
  | "editor"
  | "list-item"
  | "menu"
  | "overlay"
  | "selection"

export interface MarkdownShortcutBinding {
  key: string
  alt?: boolean
  primary?: boolean
  shift?: boolean
}

export interface MarkdownShortcutDefinition {
  bindings: readonly MarkdownShortcutBinding[]
  description: string
  scope: MarkdownShortcutScope
}

export const DEFAULT_MARKDOWN_SHORTCUTS = {
  "block-editor.commit": {
    bindings: [{ key: "Enter", primary: true }],
    description: "Commit the active block-local editor",
    scope: "composer",
  },
  "block.move-down": {
    bindings: [{ alt: true, key: "ArrowDown" }],
    description: "Move the active top-level block down",
    scope: "block-handle",
  },
  "block.move-up": {
    bindings: [{ alt: true, key: "ArrowUp" }],
    description: "Move the active top-level block up",
    scope: "block-handle",
  },
  "composer.confirm": {
    bindings: [{ key: "Enter" }],
    description: "Confirm a single-line composer",
    scope: "composer",
  },
  "document.save": {
    bindings: [{ key: "s", primary: true }],
    description: "Request a save from the host",
    scope: "document",
  },
  "format.bold": {
    bindings: [{ key: "b", primary: true }],
    description: "Toggle bold formatting",
    scope: "selection",
  },
  "format.italic": {
    bindings: [{ key: "i", primary: true }],
    description: "Toggle italic formatting",
    scope: "selection",
  },
  "history.redo": {
    bindings: [
      { key: "z", primary: true, shift: true },
      { key: "y", primary: true },
    ],
    description: "Redo the last editor operation",
    scope: "editor",
  },
  "history.undo": {
    bindings: [{ key: "z", primary: true }],
    description: "Undo the last editor operation",
    scope: "editor",
  },
  "inline-atom.activate": {
    bindings: [{ key: "Enter" }, { key: " " }],
    description: "Open the focused inline atom",
    scope: "editor",
  },
  "insert.open-menu": {
    bindings: [{ key: "/" }],
    description:
      "Open block insertion on an empty paragraph or inline insertion at a command boundary",
    scope: "editor",
  },
  "list-item.move-down": {
    bindings: [{ alt: true, key: "ArrowDown" }],
    description: "Move the current list item down among its siblings",
    scope: "list-item",
  },
  "list-item.toggle-checked": {
    bindings: [{ key: "Enter", primary: true }],
    description: "Toggle the current checklist item",
    scope: "list-item",
  },
  "list-item.move-up": {
    bindings: [{ alt: true, key: "ArrowUp" }],
    description: "Move the current list item up among its siblings",
    scope: "list-item",
  },
  "menu.choose": {
    bindings: [{ key: "Enter" }],
    description: "Choose the active menu item",
    scope: "menu",
  },
  "menu.next": {
    bindings: [{ key: "ArrowDown" }],
    description: "Focus the next menu item",
    scope: "menu",
  },
  "menu.previous": {
    bindings: [{ key: "ArrowUp" }],
    description: "Focus the previous menu item",
    scope: "menu",
  },
  "overlay.dismiss": {
    bindings: [{ key: "Escape" }],
    description: "Dismiss the active menu or composer",
    scope: "overlay",
  },
  "selection.clear": {
    bindings: [{ key: "Escape" }],
    description: "Clear the active block selection",
    scope: "selection",
  },
} as const satisfies Record<string, MarkdownShortcutDefinition>

export type BuiltInMarkdownShortcutId = keyof typeof DEFAULT_MARKDOWN_SHORTCUTS

/** Stable shortcut command ID. Third-party plugins should namespace their IDs. */
export type MarkdownShortcutId = BuiltInMarkdownShortcutId | (string & {})

export type MarkdownShortcutOverrides = Partial<
  Record<string, readonly MarkdownShortcutBinding[] | false>
>

export type ResolvedMarkdownShortcuts = Record<
  string,
  MarkdownShortcutDefinition
>

export interface KeyboardShortcutEvent {
  altKey: boolean
  ctrlKey: boolean
  isComposing?: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

export type ShortcutDisplayPlatform = "mac" | "other"

function normalizedKey(key: string): string {
  return key.length === 1 ? key.toLocaleLowerCase() : key
}

function bindingMatches(
  event: KeyboardShortcutEvent,
  binding: MarkdownShortcutBinding
): boolean {
  if (event.isComposing) return false
  const primaryMatches = binding.primary
    ? event.metaKey !== event.ctrlKey
    : !event.metaKey && !event.ctrlKey
  return (
    normalizedKey(event.key) === normalizedKey(binding.key) &&
    event.altKey === Boolean(binding.alt) &&
    primaryMatches &&
    event.shiftKey === Boolean(binding.shift)
  )
}

export function resolveMarkdownShortcuts(
  overrides: MarkdownShortcutOverrides = {},
  extensions: Readonly<Record<string, MarkdownShortcutDefinition>> = {}
): ResolvedMarkdownShortcuts {
  const definitions: Record<string, MarkdownShortcutDefinition> = {
    ...DEFAULT_MARKDOWN_SHORTCUTS,
    ...extensions,
  }
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => {
      const override = overrides[id]
      return [
        id,
        {
          ...definition,
          bindings: override === false ? [] : (override ?? definition.bindings),
        },
      ]
    })
  ) as ResolvedMarkdownShortcuts
}

export function matchesMarkdownShortcut(
  event: KeyboardShortcutEvent,
  id: MarkdownShortcutId,
  shortcuts: ResolvedMarkdownShortcuts = resolveMarkdownShortcuts()
): boolean {
  return (shortcuts[id]?.bindings ?? []).some((binding) =>
    bindingMatches(event, binding)
  )
}

function displayKey(key: string): string {
  if (key === "ArrowUp") return "↑"
  if (key === "ArrowDown") return "↓"
  if (key === "Enter") return "↵"
  if (key === "Escape") return "Esc"
  if (key === " ") return "Space"
  return key.length === 1 ? key.toLocaleUpperCase() : key
}

function shortcutBindingLabel(
  binding: MarkdownShortcutBinding,
  platform: ShortcutDisplayPlatform
): string {
  const modifiers: string[] = []
  if (binding.primary) modifiers.push(platform === "mac" ? "⌘" : "Ctrl+")
  if (binding.alt) modifiers.push(platform === "mac" ? "⌥" : "Alt+")
  if (binding.shift) modifiers.push(platform === "mac" ? "⇧" : "Shift+")
  return `${modifiers.join("")}${displayKey(binding.key)}`
}

export function markdownShortcutLabels(
  id: MarkdownShortcutId,
  platform: ShortcutDisplayPlatform,
  shortcuts: ResolvedMarkdownShortcuts = resolveMarkdownShortcuts()
): string[] {
  return (shortcuts[id]?.bindings ?? []).map((binding) =>
    shortcutBindingLabel(binding, platform)
  )
}

export function markdownShortcutLabel(
  id: MarkdownShortcutId,
  platform: ShortcutDisplayPlatform,
  shortcuts: ResolvedMarkdownShortcuts = resolveMarkdownShortcuts()
): string | undefined {
  return markdownShortcutLabels(id, platform, shortcuts)[0]
}

function bindingAriaKeys(binding: MarkdownShortcutBinding): string[] {
  const prefix = [
    ...(binding.alt ? ["Alt"] : []),
    ...(binding.shift ? ["Shift"] : []),
  ]
  const key = binding.key === " " ? "Space" : binding.key
  const withPrimary = (primary?: "Control" | "Meta") =>
    [...(primary ? [primary] : []), ...prefix, key].join("+")
  return binding.primary
    ? [withPrimary("Meta"), withPrimary("Control")]
    : [withPrimary()]
}

export function markdownShortcutAriaKeys(
  ids: MarkdownShortcutId | readonly MarkdownShortcutId[],
  shortcuts: ResolvedMarkdownShortcuts = resolveMarkdownShortcuts()
): string | undefined {
  const shortcutIds = typeof ids === "string" ? [ids] : ids
  const keys = shortcutIds.flatMap((id) =>
    (shortcuts[id]?.bindings ?? []).flatMap(bindingAriaKeys)
  )
  return keys.length > 0 ? keys.join(" ") : undefined
}

export function markdownShortcutConflicts(
  shortcuts: ResolvedMarkdownShortcuts = resolveMarkdownShortcuts()
): [string, string][] {
  const conflicts: [string, string][] = []
  const ids = Object.keys(shortcuts)
  ids.forEach((id, index) => {
    for (const otherId of ids.slice(index + 1)) {
      const definition = shortcuts[id]
      const other = shortcuts[otherId]
      if (definition.scope !== other.scope) continue
      if (
        definition.bindings.some((binding) =>
          other.bindings.some(
            (candidate) =>
              normalizedKey(binding.key) === normalizedKey(candidate.key) &&
              Boolean(binding.alt) === Boolean(candidate.alt) &&
              Boolean(binding.primary) === Boolean(candidate.primary) &&
              Boolean(binding.shift) === Boolean(candidate.shift)
          )
        )
      ) {
        conflicts.push([id, otherId])
      }
    }
  })
  return conflicts
}
