import {
  isEidosLiteShortcutEnabled,
  type EidosLiteBuiltInPlugins,
} from "../shared/built-in-plugins"
import type { EidosLiteShortcutCommand } from "../shared/keyboard-shortcuts"

export const SHORTCUT_GROUPS: Array<{
  label: string
  commands: EidosLiteShortcutCommand[]
}> = [
  {
    label: "File",
    commands: [
      "new-file",
      "quick-open",
      "search-space-text",
      "toggle-markdown-editing-mode",
    ],
  },
  {
    label: "Workspace",
    commands: [
      "command-palette",
      "format-document",
      "focus-file-content",
      "toggle-sidebar",
      "toggle-theme",
      "toggle-version",
      "toggle-sync",
      "toggle-terminal",
      "toggle-terminal-position",
    ],
  },
  {
    label: "Table area",
    commands: [
      "new-record",
      "previous-view",
      "next-view",
      "previous-table",
      "next-table",
      "open-cell-actions",
    ],
  },
  {
    label: "Document",
    commands: [
      "toggle-heading-fold",
      "fold-all-headings",
      "unfold-all-headings",
      "move-list-item-up",
      "move-list-item-down",
      "format-bold",
      "format-italic",
    ],
  },
]

export const COMMAND_LABELS: Record<EidosLiteShortcutCommand, string> = {
  "new-file": "New File",
  "quick-open": "Quick Open",
  "command-palette": "Command palette",
  "format-document": "Format Document",
  "search-space-text": "Search Space text",
  "focus-file-content": "Focus file content",
  "toggle-markdown-editing-mode": "Toggle Markdown editing mode",
  "toggle-sidebar": "Toggle Space Explorer",
  "toggle-theme": "Toggle theme",
  "toggle-version": "Toggle version history",
  "toggle-sync": "Toggle Sync",
  "toggle-terminal": "Toggle terminal",
  "toggle-terminal-position": "Toggle terminal position",
  "new-record": "New record",
  "previous-view": "Previous view",
  "next-view": "Next view",
  "previous-table": "Previous table",
  "next-table": "Next table",
  "open-cell-actions": "Open cell actions",
  "toggle-heading-fold": "Toggle heading fold",
  "fold-all-headings": "Fold all headings",
  "unfold-all-headings": "Unfold all headings",
  "move-list-item-up": "Move list item up",
  "move-list-item-down": "Move list item down",
  "format-bold": "Bold",
  "format-italic": "Italic",
}

export function enabledShortcutGroups(
  builtInPlugins: EidosLiteBuiltInPlugins
): typeof SHORTCUT_GROUPS {
  return SHORTCUT_GROUPS.map((group) => ({
    ...group,
    commands: group.commands.filter((command) =>
      isEidosLiteShortcutEnabled(command, builtInPlugins)
    ),
  })).filter((group) => group.commands.length > 0)
}
