import { describe, expect, it } from "vitest"

import {
  enabledShortcutGroups,
  keyboardShortcutRowMode,
  SHORTCUT_GROUPS,
} from "./keyboard-shortcut-settings"

describe("Keyboard shortcut row actions", () => {
  it("shows file-content focus with the workspace commands", () => {
    expect(
      SHORTCUT_GROUPS.find((group) => group.label === "Workspace")?.commands
    ).toContain("focus-file-content")
  })

  it("shows the terminal toggle with the workspace commands", () => {
    expect(
      SHORTCUT_GROUPS.find((group) => group.label === "Workspace")?.commands
    ).toContain("toggle-terminal")
    expect(
      SHORTCUT_GROUPS.find((group) => group.label === "Workspace")?.commands
    ).toContain("toggle-terminal-position")
  })

  it("shows every table-area command in Settings", () => {
    expect(
      SHORTCUT_GROUPS.find((group) => group.label === "Table area")?.commands
    ).toEqual([
      "new-record",
      "previous-view",
      "next-view",
      "previous-table",
      "next-table",
      "open-cell-actions",
    ])
  })

  it("reveals terminal shortcuts only while its built-in plugin is enabled", () => {
    const workspaceCommands = (terminal: boolean) =>
      enabledShortcutGroups({ terminal }).find(
        (group) => group.label === "Workspace"
      )?.commands

    expect(workspaceCommands(false)).not.toContain("toggle-terminal")
    expect(workspaceCommands(false)).not.toContain("toggle-terminal-position")
    expect(workspaceCommands(true)).toContain("toggle-terminal")
    expect(workspaceCommands(true)).toContain("toggle-terminal-position")
  })

  it("offers removal only while the shortcut matches its default", () => {
    expect(keyboardShortcutRowMode("Mod+Backslash", "Mod+Backslash")).toBe(
      "remove"
    )
  })

  it("offers reset only after the shortcut is modified or cleared", () => {
    expect(keyboardShortcutRowMode("Mod+Shift+B", "Mod+Backslash")).toBe(
      "reset"
    )
    expect(keyboardShortcutRowMode(null, "Mod+Backslash")).toBe("reset")
  })
})
