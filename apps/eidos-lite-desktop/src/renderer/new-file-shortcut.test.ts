import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const appSource = readFileSync(new URL("./app.tsx", import.meta.url), "utf8")

describe("New file shortcut", () => {
  it("opens the file dialog globally before editor input shortcuts are ignored", () => {
    const newFileHandler = appSource.indexOf('workspaceShortcut === "new-file"')
    const inputGuard = appSource.indexOf("target instanceof HTMLElement")

    expect(newFileHandler).toBeGreaterThan(-1)
    expect(inputGuard).toBeGreaterThan(newFileHandler)
    expect(appSource).toContain(
      'setPathDialog({ action: "create-file", entry: selectedEntry })'
    )
    expect(appSource).toContain(
      'workspaceShortcutAriaKeyShortcuts(\n                "new-file"'
    )
  })
})
