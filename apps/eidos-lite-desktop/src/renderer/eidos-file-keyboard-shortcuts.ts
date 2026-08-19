import type { EidosFileUIKeyboardShortcuts } from "@eidos.space/eidos-file-ui"

import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  eidosLiteShortcutAriaKeyShortcuts,
  type EidosLiteKeyboardShortcuts,
  type EidosLiteShortcutCommand,
} from "../shared/keyboard-shortcuts"

function editorBindings(
  shortcuts: EidosLiteKeyboardShortcuts,
  command: EidosLiteShortcutCommand,
  macos: boolean,
  defaultAliases: readonly string[] = []
): readonly string[] {
  const binding = shortcuts[command]
  const ariaBinding = eidosLiteShortcutAriaKeyShortcuts(binding, macos)
  if (!ariaBinding) return []
  return binding === DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS[command]
    ? [ariaBinding, ...defaultAliases]
    : [ariaBinding]
}

export function eidosFileKeyboardShortcuts(
  shortcuts: EidosLiteKeyboardShortcuts,
  macos: boolean
): EidosFileUIKeyboardShortcuts {
  return {
    newRecord: editorBindings(shortcuts, "new-record", macos),
    previousView: editorBindings(
      shortcuts,
      "previous-view",
      macos,
      macos ? ["Meta+Alt+ArrowLeft"] : []
    ),
    nextView: editorBindings(
      shortcuts,
      "next-view",
      macos,
      macos ? ["Meta+Alt+ArrowRight"] : []
    ),
    previousTable: editorBindings(shortcuts, "previous-table", macos),
    nextTable: editorBindings(shortcuts, "next-table", macos),
    openCellActions: editorBindings(shortcuts, "open-cell-actions", macos),
  }
}
