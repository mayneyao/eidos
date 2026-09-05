import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical"
import { useEffect } from "react"

import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import {
  matchesMarkdownShortcut,
  resolveMarkdownShortcuts,
  type KeyboardShortcutEvent,
  type MarkdownShortcutId,
} from "../shortcuts/shortcut-registry"

const BUILT_IN_SHORTCUTS = resolveMarkdownShortcuts()
const MANAGED_SHORTCUTS = [
  "format.bold",
  "format.italic",
  "history.redo",
  "history.undo",
] as const satisfies readonly MarkdownShortcutId[]

function matchesBuiltIn(
  event: KeyboardShortcutEvent,
  id: (typeof MANAGED_SHORTCUTS)[number]
): boolean {
  return matchesMarkdownShortcut(event, id, BUILT_IN_SHORTCUTS)
}

/**
 * Owns shortcuts that Lexical also provides by default. Handling them at high
 * priority lets host overrides replace or disable the built-in binding instead
 * of merely changing the displayed shortcut label.
 */
export function EditorShortcutsPlugin({
  allowEmphasis = true,
}: {
  allowEmphasis?: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const { matches } = useMarkdownShortcuts()

  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const command = matches(event, "history.redo")
            ? REDO_COMMAND
            : matches(event, "history.undo")
              ? UNDO_COMMAND
              : matches(event, "format.bold")
                ? FORMAT_TEXT_COMMAND
                : matches(event, "format.italic")
                  ? FORMAT_TEXT_COMMAND
                  : null
          if (command) {
            event.preventDefault()
            if (command === FORMAT_TEXT_COMMAND) {
              if (!allowEmphasis) return true
              editor.dispatchCommand(
                command,
                matches(event, "format.bold") ? "bold" : "italic"
              )
            } else {
              editor.dispatchCommand(command, undefined)
            }
            return true
          }

          if (MANAGED_SHORTCUTS.some((id) => matchesBuiltIn(event, id))) {
            event.preventDefault()
            return true
          }
          return false
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor, matches, allowEmphasis]
  )

  return null
}
