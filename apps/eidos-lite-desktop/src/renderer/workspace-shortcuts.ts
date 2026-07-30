export type WorkspaceShortcut =
  | "toggle-sidebar"
  | "toggle-version"
  | "toggle-sync"

type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "repeat" | "shiftKey"
>

export function workspaceShortcutForKeyboardEvent(
  event: ShortcutKeyboardEvent
): WorkspaceShortcut | null {
  if (event.repeat || event.altKey || (!event.metaKey && !event.ctrlKey)) {
    return null
  }
  const key = event.key.toLowerCase()
  if (!event.shiftKey && key === "b") return "toggle-sidebar"
  if (event.shiftKey && key === "h") return "toggle-version"
  if (event.shiftKey && key === "s") return "toggle-sync"
  return null
}

export function workspaceShortcutLabel(
  shortcut: WorkspaceShortcut,
  macos: boolean
): string {
  const key = {
    "toggle-sidebar": "B",
    "toggle-version": "H",
    "toggle-sync": "S",
  }[shortcut]
  const shift = shortcut === "toggle-sidebar" ? "" : macos ? "⇧" : "Shift+"
  return macos ? `⌘${shift}${key}` : `Ctrl+${shift}${key}`
}

export const WORKSPACE_SHORTCUT_ARIA = {
  "toggle-sidebar": "Meta+B Control+B",
  "toggle-version": "Meta+Shift+H Control+Shift+H",
  "toggle-sync": "Meta+Shift+S Control+Shift+S",
} satisfies Record<WorkspaceShortcut, string>
