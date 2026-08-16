import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  eidosLiteShortcutAriaKeyShortcuts,
  eidosLiteShortcutCommandForKeyboardEvent,
  eidosLiteShortcutLabel,
  isEidosLiteWorkspaceShortcutCommand,
  type EidosLiteKeyboardShortcuts,
  type EidosLiteWorkspaceShortcutCommand,
} from "../shared/keyboard-shortcuts"

export type WorkspaceShortcut = EidosLiteWorkspaceShortcutCommand

type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "repeat" | "shiftKey"
>

function inferredMacos(event: ShortcutKeyboardEvent): boolean {
  return event.metaKey && !event.ctrlKey
}

export function workspaceShortcutForKeyboardEvent(
  event: ShortcutKeyboardEvent,
  shortcuts: EidosLiteKeyboardShortcuts = DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  macos = inferredMacos(event)
): WorkspaceShortcut | null {
  const command = eidosLiteShortcutCommandForKeyboardEvent(
    event,
    shortcuts,
    macos
  )
  return command && isEidosLiteWorkspaceShortcutCommand(command)
    ? command
    : null
}

export function workspaceShortcutLabel(
  shortcut: WorkspaceShortcut,
  macos: boolean,
  shortcuts: EidosLiteKeyboardShortcuts = DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS
): string {
  return eidosLiteShortcutLabel(shortcuts[shortcut], macos)
}

export function workspaceShortcutAriaKeyShortcuts(
  shortcut: WorkspaceShortcut,
  macos: boolean,
  shortcuts: EidosLiteKeyboardShortcuts
): string | undefined {
  return eidosLiteShortcutAriaKeyShortcuts(shortcuts[shortcut], macos)
}
