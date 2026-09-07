import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const appSource = readFileSync(new URL("./app.tsx", import.meta.url), "utf8")
const windowControllerSource = readFileSync(
  new URL("../main/window-controller.ts", import.meta.url),
  "utf8"
)

describe("New file shortcut", () => {
  it("opens the file dialog from the Electron input layer regardless of focus", () => {
    const newFileHandler = appSource.indexOf('workspaceShortcut === "new-file"')

    expect(newFileHandler).toBeGreaterThan(-1)
    expect(windowControllerSource).toContain('on("before-input-event"')
    expect(windowControllerSource).toContain("handleWorkspaceShortcutInput(")
    expect(windowControllerSource).toContain(
      "IPC_CHANNELS.workspaceShortcutCommand"
    )
    expect(appSource).toContain("onWorkspaceShortcutCommand(")
    expect(appSource).toContain(
      'setPathDialog({ action: "create-file", entry: selectedEntry })'
    )
    expect(appSource).toMatch(
      /ariaShortcut:\s*workspaceShortcutAriaKeyShortcuts\(\s*"new-file"/
    )
    const headingSource = readFileSync(
      new URL("./workspace-heading.tsx", import.meta.url),
      "utf8"
    )
    expect(headingSource).toContain("aria-keyshortcuts={action.ariaShortcut}")
  })
})
