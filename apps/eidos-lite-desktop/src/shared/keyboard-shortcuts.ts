export const EIDOS_LITE_WORKSPACE_SHORTCUT_COMMANDS = [
  "new-file",
  "quick-open",
  "toggle-sidebar",
  "toggle-theme",
  "toggle-version",
  "toggle-sync",
] as const

export const EIDOS_LITE_EDITOR_SHORTCUT_COMMANDS = [
  "previous-view",
  "next-view",
  "previous-table",
  "next-table",
  "open-cell-actions",
] as const

export const EIDOS_LITE_SHORTCUT_COMMANDS = [
  ...EIDOS_LITE_WORKSPACE_SHORTCUT_COMMANDS,
  ...EIDOS_LITE_EDITOR_SHORTCUT_COMMANDS,
] as const

export type EidosLiteShortcutCommand =
  (typeof EIDOS_LITE_SHORTCUT_COMMANDS)[number]
export type EidosLiteWorkspaceShortcutCommand =
  (typeof EIDOS_LITE_WORKSPACE_SHORTCUT_COMMANDS)[number]
export type EidosLiteShortcutBinding = string | null
export type EidosLiteKeyboardShortcuts = Record<
  EidosLiteShortcutCommand,
  EidosLiteShortcutBinding
>

export const DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS: EidosLiteKeyboardShortcuts =
  Object.freeze({
    "new-file": "Mod+N",
    "quick-open": "Mod+P",
    "toggle-sidebar": "Mod+Backslash",
    "toggle-theme": "Mod+Shift+L",
    "toggle-version": "Mod+Shift+H",
    "toggle-sync": "Mod+Shift+S",
    "previous-view": "Ctrl+PageUp",
    "next-view": "Ctrl+PageDown",
    "previous-table": "Ctrl+Shift+PageUp",
    "next-table": "Ctrl+Shift+PageDown",
    "open-cell-actions": "Shift+F10",
  })

const MODIFIERS = ["Mod", "Ctrl", "Alt", "Shift"] as const
const NAMED_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backquote",
  "Backslash",
  "BracketLeft",
  "BracketRight",
  "Comma",
  "Delete",
  "End",
  "Enter",
  "Equal",
  "Home",
  "Insert",
  "Minus",
  "PageDown",
  "PageUp",
  "Period",
  "Quote",
  "Semicolon",
  "Slash",
  "Space",
])

const KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  ";": "Semicolon",
  "'": "Quote",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
}

const KEY_LABELS: Record<string, string> = {
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  Minus: "−",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Space: "Space",
}

const RESERVED_BINDINGS = new Set([
  "Mod+A",
  "Mod+C",
  "Mod+Comma",
  "Mod+F",
  "Mod+H",
  "Mod+M",
  "Mod+Q",
  "Mod+R",
  "Mod+V",
  "Mod+W",
  "Mod+X",
  "Mod+Z",
  "Mod+Shift+Z",
  "Alt+F4",
])

interface ShortcutKeyboardEvent {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  repeat: boolean
  shiftKey: boolean
}

function normalizedKey(key: string): string | null {
  const alias = KEY_ALIASES[key]
  if (alias) return alias
  if (/^[a-z0-9]$/iu.test(key)) return key.toUpperCase()
  if (/^F(?:[1-9]|1[0-2])$/iu.test(key)) return key.toUpperCase()
  return NAMED_KEYS.has(key) ? key : null
}

export function normalizeEidosLiteShortcutBinding(
  value: unknown
): EidosLiteShortcutBinding | undefined {
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const tokens = value.split("+")
  if (tokens.length < 2) return undefined
  const key = tokens.at(-1)
  if (
    !key ||
    (!normalizedKey(KEY_LABELS[key] ?? key) && !NAMED_KEYS.has(key))
  ) {
    return undefined
  }
  const modifiers = tokens.slice(0, -1)
  if (
    new Set(modifiers).size !== modifiers.length ||
    modifiers.some(
      (modifier) => !(MODIFIERS as readonly string[]).includes(modifier)
    )
  ) {
    return undefined
  }
  const ordered = MODIFIERS.filter((modifier) => modifiers.includes(modifier))
  return `${ordered.join("+")}+${key}`
}

export function isReservedEidosLiteShortcut(binding: string): boolean {
  return RESERVED_BINDINGS.has(binding)
}

export function normalizeEidosLiteKeyboardShortcuts(
  value: unknown
): EidosLiteKeyboardShortcuts {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const isCurrentShape = EIDOS_LITE_SHORTCUT_COMMANDS.every(
    (command) => command in candidate
  )
  const isPreviousShape = EIDOS_LITE_WORKSPACE_SHORTCUT_COMMANDS.every(
    (command) => command in candidate
  )
  if (!isCurrentShape && !isPreviousShape) {
    return { ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS }
  }
  const normalized = {} as EidosLiteKeyboardShortcuts
  const used = new Set<string>()
  for (const command of EIDOS_LITE_SHORTCUT_COMMANDS) {
    const requested = normalizeEidosLiteShortcutBinding(candidate[command])
    const fallback = DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS[command]
    let binding = requested === undefined ? fallback : requested
    if (
      binding &&
      (isReservedEidosLiteShortcut(binding) || used.has(binding))
    ) {
      binding = fallback && !used.has(fallback) ? fallback : null
    }
    normalized[command] = binding
    if (binding) used.add(binding)
  }
  return normalized
}

export function isEidosLiteWorkspaceShortcutCommand(
  value: EidosLiteShortcutCommand
): value is EidosLiteWorkspaceShortcutCommand {
  return (EIDOS_LITE_WORKSPACE_SHORTCUT_COMMANDS as readonly string[]).includes(
    value
  )
}

export function isEidosLiteKeyboardShortcuts(
  value: unknown
): value is EidosLiteKeyboardShortcuts {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).length !== EIDOS_LITE_SHORTCUT_COMMANDS.length) {
    return false
  }
  const used = new Set<string>()
  for (const command of EIDOS_LITE_SHORTCUT_COMMANDS) {
    if (!(command in candidate)) return false
    const binding = normalizeEidosLiteShortcutBinding(candidate[command])
    if (
      binding === undefined ||
      (binding !== null &&
        (isReservedEidosLiteShortcut(binding) || used.has(binding)))
    ) {
      return false
    }
    if (binding) used.add(binding)
  }
  return true
}

export function shortcutBindingForKeyboardEvent(
  event: ShortcutKeyboardEvent,
  macos: boolean
): string | null {
  if (event.repeat) return null
  const key = normalizedKey(event.key)
  if (!key) return null
  const modifiers: string[] = []
  if (macos ? event.metaKey : event.ctrlKey) modifiers.push("Mod")
  if (macos && event.ctrlKey) modifiers.push("Ctrl")
  if (event.altKey) modifiers.push("Alt")
  if (event.shiftKey) modifiers.push("Shift")
  if (modifiers.length === 0) return null
  return `${modifiers.join("+")}+${key}`
}

export function eidosLiteShortcutCommandForKeyboardEvent(
  event: ShortcutKeyboardEvent,
  shortcuts: EidosLiteKeyboardShortcuts,
  macos: boolean
): EidosLiteShortcutCommand | null {
  const binding = shortcutBindingForKeyboardEvent(event, macos)
  if (!binding) return null
  return (
    EIDOS_LITE_SHORTCUT_COMMANDS.find(
      (command) => shortcuts[command] === binding
    ) ?? null
  )
}

export function eidosLiteShortcutLabel(
  binding: EidosLiteShortcutBinding,
  macos: boolean
): string {
  if (!binding) return "—"
  const tokens = binding.split("+")
  const key = tokens.at(-1) ?? ""
  const modifiers = tokens.slice(0, -1)
  if (macos) {
    return `${modifiers
      .map((modifier) =>
        modifier === "Mod"
          ? "⌘"
          : modifier === "Ctrl"
            ? "⌃"
            : modifier === "Alt"
              ? "⌥"
              : "⇧"
      )
      .join("")}${KEY_LABELS[key] ?? key}`
  }
  return `${modifiers
    .map((modifier) => (modifier === "Mod" ? "Ctrl" : modifier))
    .join("+")}+${KEY_LABELS[key] ?? key}`
}

export function eidosLiteShortcutAriaKeyShortcuts(
  binding: EidosLiteShortcutBinding,
  macos: boolean
): string | undefined {
  if (!binding) return undefined
  return binding
    .split("+")
    .map((token) =>
      token === "Mod"
        ? macos
          ? "Meta"
          : "Control"
        : token === "Ctrl"
          ? "Control"
          : token
    )
    .join("+")
}
